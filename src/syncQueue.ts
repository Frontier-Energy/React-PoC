import { getUserId } from './auth';
import { inspectionRepository } from './repositories/inspectionRepository';
import { FormDataValue, InspectionSession, UploadStatus } from './types';

const SYNC_QUEUE_PREFIX = 'syncQueue_';
const SYNC_WORKER_LEASE_KEY = 'syncQueueWorkerLease';
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

const parseJson = <T>(raw: string | null, errorMessage: string): T | null => {
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as T;
  } catch (error) {
    console.error(errorMessage, error);
    return null;
  }
};

const getScopeKey = () => inspectionRepository.getStorageScopeKey();
const getQueueKey = (inspectionId: string) => `${getScopeKey()}:${SYNC_QUEUE_PREFIX}${inspectionId}`;
const getQueuePrefix = () => `${getScopeKey()}:${SYNC_QUEUE_PREFIX}`;
const getWorkerLeaseKey = () => `${getScopeKey()}:${SYNC_WORKER_LEASE_KEY}`;

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

const getInspectionScope = (inspection: InspectionSession) => ({
  tenantId: inspection.tenantId,
  userId: inspection.userId ?? getUserId() ?? ANONYMOUS_USER_SCOPE,
});

const isEntryLocked = (entry: SyncQueueEntry, now: number) =>
  entry.status === 'syncing' && (entry.processingExpiresAt ?? 0) > now;

const readEntry = (inspectionId: string): SyncQueueEntry | null =>
  parseJson<SyncQueueEntry>(
    localStorage.getItem(getQueueKey(inspectionId)),
    `Failed to parse sync queue entry ${inspectionId}:`
  );

const writeEntry = (entry: SyncQueueEntry) => {
  localStorage.setItem(getQueueKey(entry.inspectionId), JSON.stringify(entry));
};

const removeEntry = (inspectionId: string) => {
  localStorage.removeItem(getQueueKey(inspectionId));
};

const listEntries = (): SyncQueueEntry[] => {
  const prefix = getQueuePrefix();
  const keys = Object.keys(localStorage).filter((key) => key.startsWith(prefix));

  return keys
    .map((key) =>
      parseJson<SyncQueueEntry>(localStorage.getItem(key), `Failed to parse sync queue entry ${key}:`)
    )
    .filter((entry): entry is SyncQueueEntry => entry !== null)
    .sort((left, right) => {
      if (left.nextAttemptAt !== right.nextAttemptAt) {
        return left.nextAttemptAt - right.nextAttemptAt;
      }

      return left.createdAt - right.createdAt;
    });
};

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

  load(inspectionId: string) {
    return readEntry(inspectionId);
  },

  list() {
    return listEntries();
  },

  enqueue(inspection: InspectionSession, formData: Record<string, FormDataValue>) {
    const existing = readEntry(inspection.id);
    const now = Date.now();
    const fingerprint = buildInspectionSyncFingerprint(inspection, formData);
    const inspectionScope = getInspectionScope(inspection);

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

    writeEntry(entry);
    return entry;
  },

  ensureQueuedForInspection(inspection: InspectionSession) {
    const existing = readEntry(inspection.id);
    if (existing) {
      return existing;
    }

    const formData = inspectionRepository.loadFormData(inspection.id, inspection) ?? {};
    return this.enqueue(inspection, formData);
  },

  ensureQueuedForPendingInspections(inspections: InspectionSession[]) {
    inspections.forEach((inspection) => {
      const status = inspection.uploadStatus || UploadStatus.Local;
      if (status === UploadStatus.Local || status === UploadStatus.Failed || status === UploadStatus.Uploading) {
        this.ensureQueuedForInspection(inspection);
      }

      if (status === UploadStatus.Uploaded) {
        removeEntry(inspection.id);
      }
    });
  },

  delete(inspectionId: string) {
    removeEntry(inspectionId);
  },

  tryAcquireWorkerLease(ownerId: string, now = Date.now()) {
    const leaseKey = getWorkerLeaseKey();
    const existingLease = parseJson<WorkerLease>(
      localStorage.getItem(leaseKey),
      'Failed to parse sync worker lease:'
    );

    if (existingLease && existingLease.ownerId !== ownerId && existingLease.expiresAt > now) {
      return false;
    }

    const nextLease: WorkerLease = {
      ownerId,
      expiresAt: now + WORKER_LEASE_DURATION_MS,
    };

    localStorage.setItem(leaseKey, JSON.stringify(nextLease));
    const persistedLease = parseJson<WorkerLease>(
      localStorage.getItem(leaseKey),
      'Failed to parse sync worker lease:'
    );

    return persistedLease?.ownerId === ownerId;
  },

  renewWorkerLease(ownerId: string, now = Date.now()) {
    return this.tryAcquireWorkerLease(ownerId, now);
  },

  releaseWorkerLease(ownerId: string) {
    const leaseKey = getWorkerLeaseKey();
    const existingLease = parseJson<WorkerLease>(
      localStorage.getItem(leaseKey),
      'Failed to parse sync worker lease:'
    );

    if (existingLease?.ownerId === ownerId) {
      localStorage.removeItem(leaseKey);
    }
  },

  claimNextReady(ownerId: string, now = Date.now()) {
    const readyEntry = listEntries().find((entry) => entry.nextAttemptAt <= now && !isEntryLocked(entry, now));
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

    writeEntry(claimedEntry);
    return claimedEntry;
  },

  refreshFingerprint(entry: SyncQueueEntry, inspection: InspectionSession, formData: Record<string, FormDataValue>) {
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

    writeEntry(updatedEntry);
    return updatedEntry;
  },

  markFailed(entry: SyncQueueEntry, errorMessage: string, now = Date.now()) {
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

    writeEntry(updatedEntry);
    return updatedEntry;
  },

  markSucceeded(inspectionId: string) {
    removeEntry(inspectionId);
  },
};
