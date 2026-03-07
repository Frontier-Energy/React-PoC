import { getUserId } from './auth';
import { inspectionRepository } from './repositories/inspectionRepository';
import { FormDataValue, InspectionSession, UploadStatus } from './types';
import { appDataStore, type StorageScope } from './utils/appDataStore';

const SYNC_QUEUE_PREFIX = 'syncQueue_';
const WORKER_LEASE_DURATION_MS = 45_000;
const ENTRY_PROCESSING_LEASE_DURATION_MS = 60_000;
const INITIAL_RETRY_DELAY_MS = 5_000;
const MAX_RETRY_DELAY_MS = 5 * 60_000;
const ANONYMOUS_USER_SCOPE = 'anonymous';

type QueueStatus = 'pending' | 'syncing' | 'failed';

export interface SyncQueueEntry {
  inspectionId: string;
  tenantId: string;
  userId?: string;
  status: QueueStatus;
  fingerprint: string;
  idempotencyKey: string;
  attemptCount: number;
  nextAttemptAt: number;
  createdAt: number;
  updatedAt: number;
  lastAttemptAt?: number;
  lastError?: string;
  processingOwnerId?: string;
  processingExpiresAt?: number;
}

interface WorkerLease {
  ownerId: string;
  expiresAt: number;
}

const getScope = (): StorageScope => {
  const [tenantId, userId] = inspectionRepository.getStorageScopeKey().split(':', 2);
  return { tenantId, userId };
};

const getQueueKey = (inspectionId: string, scope = getScope()) => `${appDataStore.getScopeKey(scope)}:${SYNC_QUEUE_PREFIX}${inspectionId}`;

const generateId = () => {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

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

const getInspectionScope = (inspection: InspectionSession): StorageScope => ({
  tenantId: inspection.tenantId,
  userId: inspection.userId ?? getUserId() ?? ANONYMOUS_USER_SCOPE,
});

const getEntryScope = (entry: Pick<SyncQueueEntry, 'tenantId' | 'userId'>): StorageScope => ({
  tenantId: entry.tenantId,
  userId: entry.userId ?? ANONYMOUS_USER_SCOPE,
});

const isEntryLocked = (entry: SyncQueueEntry, now: number) =>
  entry.status === 'syncing' && (entry.processingExpiresAt ?? 0) > now;

const computeRetryDelay = (attemptCount: number) => {
  const exponentialDelay = Math.min(
    MAX_RETRY_DELAY_MS,
    INITIAL_RETRY_DELAY_MS * 2 ** Math.max(0, attemptCount - 1)
  );
  const jitterMultiplier = 0.9 + Math.random() * 0.2;
  return Math.round(exponentialDelay * jitterMultiplier);
};

export const buildInspectionSyncFingerprint = (
  inspection: InspectionSession,
  formData: Record<string, FormDataValue>
) =>
  JSON.stringify(
    stableSerialize({
      inspection: {
        id: inspection.id,
        name: inspection.name,
        formType: inspection.formType,
        tenantId: inspection.tenantId,
        userId: inspection.userId ?? getUserId() ?? '',
      },
      formData,
    })
  );

export const syncQueue = {
  createWorkerId() {
    return `sync-worker:${generateId()}`;
  },

  subscribe(listener: () => void) {
    return appDataStore.subscribe(inspectionRepository.getStorageScopeKey(), listener);
  },

  async load(inspectionId: string) {
    return appDataStore.getQueueEntry(getQueueKey(inspectionId));
  },

  async list() {
    const entries = await appDataStore.listQueueEntries(getScope());
    return entries.sort((left, right) => {
      if (left.nextAttemptAt !== right.nextAttemptAt) {
        return left.nextAttemptAt - right.nextAttemptAt;
      }

      return left.createdAt - right.createdAt;
    });
  },

  async enqueue(inspection: InspectionSession, formData: Record<string, FormDataValue>) {
    const inspectionScope = getInspectionScope(inspection);
    const existing = await appDataStore.getQueueEntry(getQueueKey(inspection.id, inspectionScope));
    const now = Date.now();
    const fingerprint = buildInspectionSyncFingerprint(inspection, formData);

    const entry: SyncQueueEntry = {
      inspectionId: inspection.id,
      tenantId: inspectionScope.tenantId,
      userId: inspectionScope.userId === ANONYMOUS_USER_SCOPE ? undefined : inspectionScope.userId,
      status: 'pending',
      fingerprint,
      idempotencyKey:
        existing && existing.fingerprint === fingerprint
          ? existing.idempotencyKey
          : `inspection-sync:${inspection.id}:${generateId()}`,
      attemptCount: existing?.fingerprint === fingerprint ? existing.attemptCount : 0,
      nextAttemptAt: now,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };

    await appDataStore.putQueueEntry(inspectionScope, getQueueKey(entry.inspectionId, inspectionScope), entry);
    return entry;
  },

  async ensureQueuedForInspection(inspection: InspectionSession) {
    const inspectionScope = getInspectionScope(inspection);
    const existing = await appDataStore.getQueueEntry(getQueueKey(inspection.id, inspectionScope));
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
    await appDataStore.deleteQueueEntry(scope, getQueueKey(inspectionId, scope));
  },

  async tryAcquireWorkerLease(ownerId: string, now = Date.now()) {
    const scope = getScope();
    const existingLease = await appDataStore.getWorkerLease(scope);

    if (existingLease && existingLease.ownerId !== ownerId && existingLease.expiresAt > now) {
      return false;
    }

    const nextLease: WorkerLease = {
      ownerId,
      expiresAt: now + WORKER_LEASE_DURATION_MS,
    };

    await appDataStore.putWorkerLease(scope, nextLease);
    const persistedLease = await appDataStore.getWorkerLease(scope);

    return persistedLease?.ownerId === ownerId;
  },

  async renewWorkerLease(ownerId: string, now = Date.now()) {
    return this.tryAcquireWorkerLease(ownerId, now);
  },

  async releaseWorkerLease(ownerId: string) {
    const scope = getScope();
    const existingLease = await appDataStore.getWorkerLease(scope);

    if (existingLease?.ownerId === ownerId) {
      await appDataStore.deleteWorkerLease(scope);
    }
  },

  async claimNextReady(ownerId: string, now = Date.now()) {
    const readyEntry = (await this.list()).find((entry) => entry.nextAttemptAt <= now && !isEntryLocked(entry, now));
    if (!readyEntry) {
      return null;
    }

    const claimedEntry: SyncQueueEntry = {
      ...readyEntry,
      status: 'syncing',
      lastAttemptAt: now,
      updatedAt: now,
      processingOwnerId: ownerId,
      processingExpiresAt: now + ENTRY_PROCESSING_LEASE_DURATION_MS,
    };

    const scope = getEntryScope(claimedEntry);
    await appDataStore.putQueueEntry(scope, getQueueKey(claimedEntry.inspectionId, scope), claimedEntry);
    return claimedEntry;
  },

  async refreshFingerprint(entry: SyncQueueEntry, inspection: InspectionSession, formData: Record<string, FormDataValue>) {
    const fingerprint = buildInspectionSyncFingerprint(inspection, formData);
    if (fingerprint === entry.fingerprint) {
      return entry;
    }

    const now = Date.now();
    const updatedEntry: SyncQueueEntry = {
      ...entry,
      fingerprint,
      idempotencyKey: `inspection-sync:${inspection.id}:${generateId()}`,
      attemptCount: 0,
      nextAttemptAt: now,
      updatedAt: now,
      lastError: undefined,
    };

    const scope = getInspectionScope(inspection);
    await appDataStore.putQueueEntry(scope, getQueueKey(updatedEntry.inspectionId, scope), updatedEntry);
    return updatedEntry;
  },

  async markFailed(entry: SyncQueueEntry, errorMessage: string, now = Date.now()) {
    const attemptCount = entry.attemptCount + 1;
    const updatedEntry: SyncQueueEntry = {
      ...entry,
      status: 'failed',
      attemptCount,
      nextAttemptAt: now + computeRetryDelay(attemptCount),
      updatedAt: now,
      lastAttemptAt: now,
      lastError: errorMessage,
      processingOwnerId: undefined,
      processingExpiresAt: undefined,
    };

    const scope = getEntryScope(updatedEntry);
    await appDataStore.putQueueEntry(scope, getQueueKey(updatedEntry.inspectionId, scope), updatedEntry);
    return updatedEntry;
  },

  async markSucceeded(inspectionId: string, inspection?: Pick<InspectionSession, 'tenantId' | 'userId'>) {
    await this.delete(inspectionId, inspection);
  },
};
