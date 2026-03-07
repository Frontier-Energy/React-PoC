import { ANONYMOUS_USER_SCOPE } from '../domain/storageScope';
import type { SyncQueueEntry } from '../domain/syncQueue';
import { UploadStatus, type FormDataValue, type InspectionSession } from '../types';
import type { StorageScope } from '../utils/appDataStore';

interface WorkerLease {
  ownerId: string;
  expiresAt: number;
}

export interface SyncQueueStore {
  getScopeKey(scope: StorageScope): string;
  subscribe(scopeKey: string, listener: () => void): () => void;
  getQueueEntry(storageKey: string): Promise<SyncQueueEntry | null>;
  listQueueEntries(scope: StorageScope): Promise<SyncQueueEntry[]>;
  putQueueEntry(scope: StorageScope, storageKey: string, value: SyncQueueEntry): Promise<void>;
  deleteQueueEntry(scope: StorageScope, storageKey: string): Promise<void>;
  getWorkerLease(scope: StorageScope): Promise<WorkerLease | null>;
  putWorkerLease(scope: StorageScope, value: WorkerLease): Promise<void>;
  deleteWorkerLease(scope: StorageScope): Promise<void>;
}

export interface SyncQueueInspectionRepository {
  getStorageScopeKey(): string;
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
) =>
  JSON.stringify(
    stableSerialize({
      inspection: {
        id: inspection.id,
        name: inspection.name,
        formType: inspection.formType,
        tenantId: inspection.tenantId,
        userId: inspection.userId ?? resolveUserId() ?? '',
      },
      formData,
    })
  );

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

  return {
    createWorkerId() {
      return `sync-worker:${createId()}`;
    },

    subscribe(listener: () => void) {
      return store.subscribe(inspectionRepository.getStorageScopeKey(), listener);
    },

    async load(inspectionId: string) {
      return store.getQueueEntry(getQueueKey(inspectionId));
    },

    async list() {
      const entries = await store.listQueueEntries(resolveActiveScope());
      return entries.sort((left, right) => {
        if (left.nextAttemptAt !== right.nextAttemptAt) {
          return left.nextAttemptAt - right.nextAttemptAt;
        }

        return left.createdAt - right.createdAt;
      });
    },

    async enqueue(inspection: InspectionSession, formData: Record<string, FormDataValue>) {
      const inspectionScope = getInspectionScope(inspection);
      const existing = await store.getQueueEntry(getQueueKey(inspection.id, inspectionScope));
      const timestamp = now();
      const fingerprint = buildInspectionSyncFingerprint(inspection, formData, resolveUserId);

      const entry: SyncQueueEntry = {
        inspectionId: inspection.id,
        tenantId: inspectionScope.tenantId,
        userId: inspectionScope.userId === ANONYMOUS_USER_SCOPE ? undefined : inspectionScope.userId,
        status: 'pending',
        fingerprint,
        idempotencyKey:
          existing && existing.fingerprint === fingerprint
            ? existing.idempotencyKey
            : `inspection-sync:${inspection.id}:${createId()}`,
        attemptCount: existing?.fingerprint === fingerprint ? existing.attemptCount : 0,
        nextAttemptAt: timestamp,
        createdAt: existing?.createdAt ?? timestamp,
        updatedAt: timestamp,
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
      const scope = inspection ? { tenantId: inspection.tenantId, userId: inspection.userId ?? ANONYMOUS_USER_SCOPE } : getScope();
      await store.deleteQueueEntry(scope, getQueueKey(inspectionId, scope));
    },

    async tryAcquireWorkerLease(ownerId: string, currentTime = now()) {
      const scope = getScope();
      const existingLease = await store.getWorkerLease(scope);

      if (existingLease && existingLease.ownerId !== ownerId && existingLease.expiresAt > currentTime) {
        return false;
      }

      const nextLease: WorkerLease = {
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
      const readyEntry = (await this.list()).find((entry) => entry.nextAttemptAt <= currentTime && !isEntryLocked(entry, currentTime));
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
      const fingerprint = buildInspectionSyncFingerprint(inspection, formData, resolveUserId);
      if (fingerprint === entry.fingerprint) {
        return entry;
      }

      const timestamp = now();
      const updatedEntry: SyncQueueEntry = {
        ...entry,
        fingerprint,
        idempotencyKey: `inspection-sync:${inspection.id}:${createId()}`,
        attemptCount: 0,
        nextAttemptAt: timestamp,
        updatedAt: timestamp,
        lastError: undefined,
      };

      const scope = getInspectionScope(inspection);
      await store.putQueueEntry(scope, getQueueKey(updatedEntry.inspectionId, scope), updatedEntry);
      return updatedEntry;
    },

    async markFailed(entry: SyncQueueEntry, errorMessage: string, currentTime = now()) {
      const attemptCount = entry.attemptCount + 1;
      const updatedEntry: SyncQueueEntry = {
        ...entry,
        status: 'failed',
        attemptCount,
        nextAttemptAt: currentTime + computeRetryDelay(attemptCount),
        updatedAt: currentTime,
        lastAttemptAt: currentTime,
        lastError: errorMessage,
        processingOwnerId: undefined,
        processingExpiresAt: undefined,
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
