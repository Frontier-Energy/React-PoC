import { ensureInspectionSyncState } from '../domain/inspectionSync';
import { ANONYMOUS_USER_SCOPE } from '../domain/storageScope';
import type { SyncQueueDiagnostics, SyncQueueEntry, SyncQueueMetrics, SyncWorkerLease } from '../domain/syncQueue';
import { UploadStatus, type FormDataValue, type InspectionSession } from '../types';
import type { StorageScope } from '../utils/appDataStore';

export interface SyncQueueStore {
  getScopeKey(scope: StorageScope): string;
  subscribe(scopeKey: string, listener: () => void): () => void;
  getQueueEntry(storageKey: string): Promise<SyncQueueEntry | null>;
  listQueueEntries(scope: StorageScope): Promise<SyncQueueEntry[]>;
  putQueueEntry(scope: StorageScope, storageKey: string, value: SyncQueueEntry): Promise<void>;
  deleteQueueEntry(scope: StorageScope, storageKey: string): Promise<void>;
  getWorkerLease(scope: StorageScope): Promise<SyncWorkerLease | null>;
  putWorkerLease(scope: StorageScope, value: SyncWorkerLease): Promise<void>;
  deleteWorkerLease(scope: StorageScope): Promise<void>;
}

export interface SyncQueueInspectionRepository {
  getStorageScopeKey(): string;
  loadById(
    inspectionId: string,
    inspection?: Pick<InspectionSession, 'tenantId' | 'userId'>
  ): Promise<InspectionSession | null>;
  loadFormData(
    inspectionId: string,
    inspection?: Pick<InspectionSession, 'tenantId' | 'userId'>
  ): Promise<Record<string, FormDataValue> | null>;
}

export interface SyncQueueServiceDependencies {
  store: SyncQueueStore;
  inspectionRepository: SyncQueueInspectionRepository;
  resolveActiveScope: () => StorageScope;
  resolveUserId: () => string | null;
  createId: () => string;
  now: () => number;
  random: () => number;
}

const SYNC_QUEUE_PREFIX = 'syncQueue_';
const WORKER_LEASE_DURATION_MS = 45_000;
const ENTRY_PROCESSING_LEASE_DURATION_MS = 60_000;
const INITIAL_RETRY_DELAY_MS = 5_000;
const MAX_RETRY_DELAY_MS = 5 * 60_000;
const MAX_AUTO_RETRY_ATTEMPTS = 3;

const stableSerialize = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map((item) => stableSerialize(item));
  }

  if (value && typeof value === 'object') {
    return Object.keys(value as Record<string, unknown>)
      .sort()
      .reduce<Record<string, unknown>>((accumulator, key) => {
        accumulator[key] = stableSerialize((value as Record<string, unknown>)[key]);
        return accumulator;
      }, {});
  }

  return value;
};

export const buildInspectionSyncFingerprint = (
  inspection: InspectionSession,
  formData: Record<string, FormDataValue>,
  resolveUserId: () => string | null = () => null
) => {
  const version = ensureInspectionSyncState(inspection).version;

  return JSON.stringify(
    stableSerialize({
      inspection: {
        id: inspection.id,
        name: inspection.name,
        formType: inspection.formType,
        tenantId: inspection.tenantId,
        userId: inspection.userId ?? resolveUserId() ?? '',
        version: version
          ? {
              clientRevision: version.clientRevision,
              baseServerRevision: version.baseServerRevision,
              mergePolicy: version.mergePolicy,
            }
          : undefined,
      },
      formData,
    })
  );
};

export const createSyncQueueService = ({
  store,
  inspectionRepository,
  resolveActiveScope,
  resolveUserId,
  createId,
  now,
  random,
}: SyncQueueServiceDependencies) => {
  const getScope = (): StorageScope => {
    const [tenantId, userId] = inspectionRepository.getStorageScopeKey().split(':', 2);
    return { tenantId, userId };
  };

  const getQueueKey = (inspectionId: string, scope = getScope()) => `${store.getScopeKey(scope)}:${SYNC_QUEUE_PREFIX}${inspectionId}`;

  const getInspectionScope = (inspection: InspectionSession): StorageScope => ({
    tenantId: inspection.tenantId,
    userId: inspection.userId ?? resolveUserId() ?? ANONYMOUS_USER_SCOPE,
  });

  const getExplicitScope = (inspection?: Pick<InspectionSession, 'tenantId' | 'userId'>): StorageScope =>
    inspection
      ? { tenantId: inspection.tenantId, userId: inspection.userId ?? ANONYMOUS_USER_SCOPE }
      : getScope();

  const getEntryScope = (entry: Pick<SyncQueueEntry, 'tenantId' | 'userId'>): StorageScope => ({
    tenantId: entry.tenantId,
    userId: entry.userId ?? ANONYMOUS_USER_SCOPE,
  });

  const isEntryLocked = (entry: SyncQueueEntry, currentTime: number) =>
    entry.status === 'syncing' && (entry.processingExpiresAt ?? 0) > currentTime;

  const computeRetryDelay = (attemptCount: number) => {
    const exponentialDelay = Math.min(
      MAX_RETRY_DELAY_MS,
      INITIAL_RETRY_DELAY_MS * 2 ** Math.max(0, attemptCount - 1)
    );
    const jitterMultiplier = 0.9 + random() * 0.2;
    return Math.round(exponentialDelay * jitterMultiplier);
  };

  const toMetrics = (entries: SyncQueueEntry[], currentTime: number): SyncQueueMetrics => {
    const nextAttemptAt = entries
      .filter((entry) => entry.status !== 'dead-letter')
      .reduce<number | null>((earliest, entry) => {
        if (earliest === null || entry.nextAttemptAt < earliest) {
          return entry.nextAttemptAt;
        }
        return earliest;
      }, null);

    return {
      totalCount: entries.length,
      readyCount: entries.filter(
        (entry) =>
          entry.status !== 'dead-letter' &&
          entry.status !== 'conflict' &&
          entry.nextAttemptAt <= currentTime &&
          !isEntryLocked(entry, currentTime)
      ).length,
      pendingCount: entries.filter((entry) => entry.status === 'pending').length,
      syncingCount: entries.filter((entry) => entry.status === 'syncing').length,
      failedCount: entries.filter((entry) => entry.status === 'failed').length,
      deadLetterCount: entries.filter((entry) => entry.status === 'dead-letter').length,
      conflictCount: entries.filter((entry) => entry.status === 'conflict').length,
      oldestEntryAgeMs: entries.length > 0 ? currentTime - Math.min(...entries.map((entry) => entry.createdAt)) : null,
      nextAttemptAt,
    };
  };

  return {
    createWorkerId() {
      return `sync-worker:${createId()}`;
    },

    subscribe(listener: () => void) {
      return store.subscribe(inspectionRepository.getStorageScopeKey(), listener);
    },

    async load(inspectionId: string, inspection?: Pick<InspectionSession, 'tenantId' | 'userId'>) {
      const scope = getExplicitScope(inspection);
      return store.getQueueEntry(getQueueKey(inspectionId, scope));
    },

    async list(scope = resolveActiveScope()) {
      const entries = await store.listQueueEntries(scope);
      return entries.sort((left, right) => {
        if (left.nextAttemptAt !== right.nextAttemptAt) {
          return left.nextAttemptAt - right.nextAttemptAt;
        }

        return left.createdAt - right.createdAt;
      });
    },

    async getWorkerLease(scope = resolveActiveScope()) {
      return store.getWorkerLease(scope);
    },

    async getDiagnostics(scope = resolveActiveScope(), currentTime = now()): Promise<SyncQueueDiagnostics> {
      const entries = await this.list(scope);
      return {
        generatedAt: currentTime,
        entries,
        workerLease: await store.getWorkerLease(scope),
        metrics: toMetrics(entries, currentTime),
      };
    },

    async enqueue(inspection: InspectionSession, formData: Record<string, FormDataValue>) {
      const inspectionScope = getInspectionScope(inspection);
      const existing = await store.getQueueEntry(getQueueKey(inspection.id, inspectionScope));
      const timestamp = now();
      const persistedInspection =
        (await inspectionRepository.loadById(inspection.id, inspection)) ?? inspection;
      const normalizedInspection = ensureInspectionSyncState(persistedInspection, timestamp);
      const version = normalizedInspection.version;
      const fingerprint = buildInspectionSyncFingerprint(normalizedInspection, formData, resolveUserId);

      const entry: SyncQueueEntry = {
        inspectionId: normalizedInspection.id,
        tenantId: inspectionScope.tenantId,
        userId: inspectionScope.userId === ANONYMOUS_USER_SCOPE ? undefined : inspectionScope.userId,
        status: 'pending',
        fingerprint,
        clientRevision: version?.clientRevision ?? 1,
        baseServerRevision: version?.baseServerRevision ?? null,
        mergePolicy: version?.mergePolicy ?? 'manual-on-version-mismatch',
        idempotencyKey:
          existing && existing.fingerprint === fingerprint
            ? existing.idempotencyKey
            : `inspection-sync:${normalizedInspection.id}:${createId()}`,
        attemptCount: existing?.fingerprint === fingerprint ? existing.attemptCount : 0,
        nextAttemptAt: timestamp,
        createdAt: existing?.createdAt ?? timestamp,
        updatedAt: timestamp,
        deadLetteredAt: undefined,
        deadLetterReason: undefined,
        conflictDetectedAt: undefined,
        conflictServerRevision: undefined,
        conflictServerUpdatedAt: undefined,
        conflictingFields: undefined,
      };

      await store.putQueueEntry(inspectionScope, getQueueKey(entry.inspectionId, inspectionScope), entry);
      return entry;
    },

    async ensureQueuedForInspection(inspection: InspectionSession) {
      const inspectionScope = getInspectionScope(inspection);
      const existing = await store.getQueueEntry(getQueueKey(inspection.id, inspectionScope));
      if (existing) {
        return existing;
      }

      const formData = (await inspectionRepository.loadFormData(inspection.id, inspection)) ?? {};
      return this.enqueue(inspection, formData);
    },

    async ensureQueuedForPendingInspections(inspections: InspectionSession[]) {
      await Promise.all(
        inspections.map(async (inspection) => {
          const status = inspection.uploadStatus || UploadStatus.Local;
          if (status === UploadStatus.Local || status === UploadStatus.Failed || status === UploadStatus.Uploading) {
            await this.ensureQueuedForInspection(inspection);
          }

          if (status === UploadStatus.Uploaded) {
            await this.delete(inspection.id, inspection);
          }
        })
      );
    },

    async delete(inspectionId: string, inspection?: Pick<InspectionSession, 'tenantId' | 'userId'>) {
      const scope = getExplicitScope(inspection);
      await store.deleteQueueEntry(scope, getQueueKey(inspectionId, scope));
    },

    async tryAcquireWorkerLease(ownerId: string, currentTime = now()) {
      const scope = getScope();
      const existingLease = await store.getWorkerLease(scope);

      if (existingLease && existingLease.ownerId !== ownerId && existingLease.expiresAt > currentTime) {
        return false;
      }

      const nextLease: SyncWorkerLease = {
        ownerId,
        expiresAt: currentTime + WORKER_LEASE_DURATION_MS,
      };

      await store.putWorkerLease(scope, nextLease);
      const persistedLease = await store.getWorkerLease(scope);

      return persistedLease?.ownerId === ownerId;
    },

    async renewWorkerLease(ownerId: string, currentTime = now()) {
      return this.tryAcquireWorkerLease(ownerId, currentTime);
    },

    async releaseWorkerLease(ownerId: string) {
      const scope = getScope();
      const existingLease = await store.getWorkerLease(scope);

      if (existingLease?.ownerId === ownerId) {
        await store.deleteWorkerLease(scope);
      }
    },

    async claimNextReady(ownerId: string, currentTime = now()) {
      const readyEntry = (await this.list()).find(
        (entry) =>
          entry.status !== 'dead-letter' &&
          entry.status !== 'conflict' &&
          entry.nextAttemptAt <= currentTime &&
          !isEntryLocked(entry, currentTime)
      );
      if (!readyEntry) {
        return null;
      }

      const claimedEntry: SyncQueueEntry = {
        ...readyEntry,
        status: 'syncing',
        lastAttemptAt: currentTime,
        updatedAt: currentTime,
        processingOwnerId: ownerId,
        processingExpiresAt: currentTime + ENTRY_PROCESSING_LEASE_DURATION_MS,
      };

      const scope = getEntryScope(claimedEntry);
      await store.putQueueEntry(scope, getQueueKey(claimedEntry.inspectionId, scope), claimedEntry);
      return claimedEntry;
    },

    async refreshFingerprint(entry: SyncQueueEntry, inspection: InspectionSession, formData: Record<string, FormDataValue>) {
      const normalizedInspection = ensureInspectionSyncState(inspection);
      const version = normalizedInspection.version;
      const fingerprint = buildInspectionSyncFingerprint(normalizedInspection, formData, resolveUserId);
      if (fingerprint === entry.fingerprint) {
        return entry;
      }

      const timestamp = now();
      const updatedEntry: SyncQueueEntry = {
        ...entry,
        fingerprint,
        clientRevision: version?.clientRevision ?? 1,
        baseServerRevision: version?.baseServerRevision ?? null,
        mergePolicy: version?.mergePolicy ?? 'manual-on-version-mismatch',
        idempotencyKey: `inspection-sync:${inspection.id}:${createId()}`,
        attemptCount: 0,
        nextAttemptAt: timestamp,
        updatedAt: timestamp,
        lastError: undefined,
        deadLetteredAt: undefined,
        deadLetterReason: undefined,
        conflictDetectedAt: undefined,
        conflictServerRevision: undefined,
        conflictServerUpdatedAt: undefined,
        conflictingFields: undefined,
      };

      const scope = getInspectionScope(inspection);
      await store.putQueueEntry(scope, getQueueKey(updatedEntry.inspectionId, scope), updatedEntry);
      return updatedEntry;
    },

    async markFailed(entry: SyncQueueEntry, errorMessage: string, currentTime = now()) {
      const attemptCount = entry.attemptCount + 1;
      const deadLettered = attemptCount >= MAX_AUTO_RETRY_ATTEMPTS;
      const updatedEntry: SyncQueueEntry = {
        ...entry,
        status: deadLettered ? 'dead-letter' : 'failed',
        attemptCount,
        nextAttemptAt: deadLettered ? currentTime : currentTime + computeRetryDelay(attemptCount),
        updatedAt: currentTime,
        lastAttemptAt: currentTime,
        lastError: errorMessage,
        processingOwnerId: undefined,
        processingExpiresAt: undefined,
        deadLetteredAt: deadLettered ? currentTime : undefined,
        deadLetterReason: deadLettered ? errorMessage : undefined,
        conflictDetectedAt: undefined,
        conflictServerRevision: undefined,
        conflictServerUpdatedAt: undefined,
        conflictingFields: undefined,
      };

      const scope = getEntryScope(updatedEntry);
      await store.putQueueEntry(scope, getQueueKey(updatedEntry.inspectionId, scope), updatedEntry);
      return updatedEntry;
    },

    async markConflict(
      entry: SyncQueueEntry,
      conflict: {
        reason: string;
        detectedAt?: number;
        serverRevision?: string | null;
        serverUpdatedAt?: number | null;
        conflictingFields?: string[];
      },
      currentTime = now()
    ) {
      const detectedAt = conflict.detectedAt ?? currentTime;
      const updatedEntry: SyncQueueEntry = {
        ...entry,
        status: 'conflict',
        nextAttemptAt: Number.MAX_SAFE_INTEGER,
        updatedAt: currentTime,
        lastAttemptAt: currentTime,
        lastError: conflict.reason,
        processingOwnerId: undefined,
        processingExpiresAt: undefined,
        deadLetteredAt: undefined,
        deadLetterReason: undefined,
        conflictDetectedAt: detectedAt,
        conflictServerRevision: conflict.serverRevision ?? undefined,
        conflictServerUpdatedAt: conflict.serverUpdatedAt ?? undefined,
        conflictingFields: conflict.conflictingFields,
      };

      const scope = getEntryScope(updatedEntry);
      await store.putQueueEntry(scope, getQueueKey(updatedEntry.inspectionId, scope), updatedEntry);
      return updatedEntry;
    },

    async moveToDeadLetter(entry: SyncQueueEntry, reason: string, currentTime = now()) {
      const updatedEntry: SyncQueueEntry = {
        ...entry,
        status: 'dead-letter',
        updatedAt: currentTime,
        lastError: entry.lastError ?? reason,
        processingOwnerId: undefined,
        processingExpiresAt: undefined,
        deadLetteredAt: currentTime,
        deadLetterReason: reason,
        conflictDetectedAt: undefined,
        conflictServerRevision: undefined,
        conflictServerUpdatedAt: undefined,
        conflictingFields: undefined,
      };

      const scope = getEntryScope(updatedEntry);
      await store.putQueueEntry(scope, getQueueKey(updatedEntry.inspectionId, scope), updatedEntry);
      return updatedEntry;
    },

    async retry(entry: SyncQueueEntry, currentTime = now()) {
      const updatedEntry: SyncQueueEntry = {
        ...entry,
        status: 'pending',
        attemptCount: 0,
        nextAttemptAt: currentTime,
        updatedAt: currentTime,
        processingOwnerId: undefined,
        processingExpiresAt: undefined,
        deadLetteredAt: undefined,
        deadLetterReason: undefined,
        conflictDetectedAt: undefined,
        conflictServerRevision: undefined,
        conflictServerUpdatedAt: undefined,
        conflictingFields: undefined,
      };

      const scope = getEntryScope(updatedEntry);
      await store.putQueueEntry(scope, getQueueKey(updatedEntry.inspectionId, scope), updatedEntry);
      return updatedEntry;
    },

    async markSucceeded(inspectionId: string, inspection?: Pick<InspectionSession, 'tenantId' | 'userId'>) {
      await this.delete(inspectionId, inspection);
    },
  };
};
