import { getUserId } from './auth';
import { publishInspectionStatusChanged, subscribeToInspectionStatusChanged } from './application/inspectionEvents';
import { getUploadInspectionUrl } from './config';
import { markInspectionConflicted, markInspectionSyncSucceeded } from './domain/inspectionSync';
import { inspectionRepository } from './repositories/inspectionRepository';
import { syncMonitor } from './syncMonitor';
import { buildInspectionSyncFingerprint, syncQueue, type SyncQueueEntry } from './syncQueue';
import { FormDataValue, InspectionSession, UploadStatus } from './types';
import { getFileReferences, serializeFormValue } from './utils/formDataUtils';
import { deleteFiles, getFile } from './utils/fileStorage';

export type BackgroundUploadConnectivityStatus = 'checking' | 'online' | 'offline';

const SYNC_CHECK_INTERVAL_MS = 15_000;

class InspectionConflictError extends Error {
  constructor(
    readonly conflict: {
      reason: string;
      serverRevision?: string | null;
      serverUpdatedAt?: number | null;
      conflictingFields?: string[];
    }
  ) {
    super(conflict.reason);
    this.name = 'InspectionConflictError';
  }
}

const persistInspection = async (inspection: InspectionSession) => {
  await inspectionRepository.update(inspection);
  const currentSession = await inspectionRepository.loadCurrent();
  if (currentSession?.id === inspection.id) {
    await inspectionRepository.saveCurrent(inspection);
  }
  publishInspectionStatusChanged(inspection);
  return inspection;
};

const persistInspectionStatus = async (inspection: InspectionSession, status: UploadStatus) => {
  return persistInspection({ ...inspection, uploadStatus: status });
};

const createUploadRequest = async (
  inspection: InspectionSession,
  formData: Record<string, FormDataValue>,
  queueEntry: SyncQueueEntry
) => {
  const uploadForm = new FormData();
  const queryParams: Record<string, string> = {};

  for (const [key, value] of Object.entries(formData)) {
    queryParams[key] = serializeFormValue(value);
    const files = getFileReferences(value);
    if (files.length === 0) {
      continue;
    }

    for (const fileRef of files) {
      const storedFile = await getFile(fileRef.id);
      if (!storedFile) {
        console.warn(`Missing stored file for ${fileRef.id}`);
        continue;
      }
      uploadForm.append('files', storedFile.blob, storedFile.name);
    }
  }

  uploadForm.append(
    'payload',
    JSON.stringify({
      sessionId: inspection.id,
      idempotencyKey: queueEntry.idempotencyKey,
      name: inspection.name,
      userId: inspection.userId ?? getUserId() ?? '',
      version: {
        clientRevision: queueEntry.clientRevision,
        baseServerRevision: queueEntry.baseServerRevision,
        mergePolicy: queueEntry.mergePolicy,
      },
      queryParams,
    })
  );

  return uploadForm;
};

const readResponseJson = async (response: Response): Promise<Record<string, unknown> | null> => {
  if (typeof response.json !== 'function') {
    return null;
  }

  try {
    const body = await response.json();
    return body && typeof body === 'object' ? (body as Record<string, unknown>) : null;
  } catch {
    return null;
  }
};

const uploadInspection = async (inspection: InspectionSession, queueEntry: SyncQueueEntry) => {
  const formData = (await inspectionRepository.loadFormData(inspection.id, inspection)) ?? {};
  const refreshedQueueEntry = await syncQueue.refreshFingerprint(queueEntry, inspection, formData);
  const uploadForm = await createUploadRequest(inspection, formData, refreshedQueueEntry);
  const response = await fetch(getUploadInspectionUrl(), {
    method: 'POST',
    headers: {
      'Idempotency-Key': refreshedQueueEntry.idempotencyKey,
    },
    body: uploadForm,
  });

  if (response.status === 409) {
    const payload = await readResponseJson(response);
    throw new InspectionConflictError({
      reason:
        typeof payload?.message === 'string'
          ? payload.message
          : `Upload conflict for revision ${refreshedQueueEntry.clientRevision}`,
      serverRevision: typeof payload?.serverRevision === 'string' ? payload.serverRevision : null,
      serverUpdatedAt: typeof payload?.serverUpdatedAt === 'number' ? payload.serverUpdatedAt : null,
      conflictingFields: Array.isArray(payload?.conflictingFields)
        ? payload.conflictingFields.filter((field): field is string => typeof field === 'string')
        : undefined,
    });
  }

  if (!response.ok) {
    throw new Error(`Upload failed with status ${response.status}`);
  }

  const uploadedFileIds = Object.values(formData)
    .flatMap((value) => getFileReferences(value))
    .map((file) => file.id);

  if (uploadedFileIds.length > 0) {
    await deleteFiles(uploadedFileIds);
  }

  const payload = await readResponseJson(response);
  return {
    serverRevision:
      typeof payload?.serverRevision === 'string'
        ? payload.serverRevision
        : response.headers?.get?.('ETag') ?? null,
  };
};

const processNextQueuedInspection = async (workerId: string) => {
  const queueEntry = await syncQueue.claimNextReady(workerId);
  if (!queueEntry) {
    return false;
  }

  syncMonitor.markInspectionClaimed(queueEntry);

  const inspection = await inspectionRepository.loadById(queueEntry.inspectionId, queueEntry);
  if (!inspection) {
    await syncQueue.delete(queueEntry.inspectionId, queueEntry);
    syncMonitor.markInspectionDeleted(queueEntry.inspectionId);
    return true;
  }

  const formData = (await inspectionRepository.loadFormData(inspection.id, inspection)) ?? {};
  const currentFingerprint = buildInspectionSyncFingerprint(inspection, formData);
  const effectiveQueueEntry =
    currentFingerprint === queueEntry.fingerprint
      ? queueEntry
      : await syncQueue.refreshFingerprint(queueEntry, inspection, formData);

  await persistInspectionStatus(inspection, UploadStatus.Uploading);

  try {
    const uploadResult = await uploadInspection(inspection, effectiveQueueEntry);
    await syncQueue.markSucceeded(inspection.id, inspection);
    await persistInspection({
      ...markInspectionSyncSucceeded(inspection, { serverRevision: uploadResult.serverRevision }),
      uploadStatus: UploadStatus.Uploaded,
    });
    syncMonitor.markInspectionSucceeded(inspection.id);
  } catch (error) {
    if (error instanceof InspectionConflictError) {
      const conflictedEntry = await syncQueue.markConflict(effectiveQueueEntry, error.conflict);
      await persistInspection({
        ...markInspectionConflicted(inspection, {
          detectedAt: Date.now(),
          reason: error.conflict.reason,
          serverRevision: error.conflict.serverRevision,
          serverUpdatedAt: error.conflict.serverUpdatedAt,
          conflictingFields: error.conflict.conflictingFields,
        }),
        uploadStatus: UploadStatus.Conflict,
      });
      syncMonitor.markInspectionConflicted(conflictedEntry, error.conflict.reason);
      return true;
    }

    console.error('Failed to upload inspection:', inspection.id, error);
    const failedEntry = await syncQueue.markFailed(
      effectiveQueueEntry,
      error instanceof Error ? error.message : 'Unknown upload error'
    );
    await persistInspectionStatus(inspection, UploadStatus.Failed);
    syncMonitor.markInspectionFailed(failedEntry, failedEntry.lastError ?? 'Unknown upload error');
  }

  return true;
};

export interface BackgroundUploadRuntime {
  start: () => void;
  stop: () => Promise<void>;
  setConnectivityStatus: (status: BackgroundUploadConnectivityStatus) => void;
}

export const createBackgroundUploadRuntime = (): BackgroundUploadRuntime => {
  let connectivityStatus: BackgroundUploadConnectivityStatus = 'checking';
  let syncInProgress = false;
  let started = false;
  const workerId = syncQueue.createWorkerId();
  let intervalId: number | null = null;
  let unsubscribeQueue: (() => void) | null = null;
  let unsubscribeInspectionEvents: (() => void) | null = null;
  const activeCycles = new Set<Promise<void>>();

  const getConnectivityStatus = () => connectivityStatus;

  const runSyncCycle = async (source: string) => {
    syncMonitor.noteWakeUp(source);

    if (getConnectivityStatus() !== 'online' || syncInProgress) {
      if (getConnectivityStatus() !== 'online') {
        syncMonitor.markPaused('offline');
      } else {
        syncMonitor.markBusy('cycle already running');
      }
      return;
    }

    syncInProgress = true;
    syncMonitor.markCycleStarted(workerId);

    try {
      await syncQueue.ensureQueuedForPendingInspections(await inspectionRepository.loadAll());
      await syncMonitor.refresh();
      if (!(await syncQueue.tryAcquireWorkerLease(workerId))) {
        syncMonitor.markLeaseUnavailable(workerId);
        return;
      }

      syncMonitor.markLeaseAcquired(workerId);

      while (getConnectivityStatus() === 'online') {
        if (!(await syncQueue.renewWorkerLease(workerId))) {
          syncMonitor.markLeaseLost(workerId);
          break;
        }

        const processed = await processNextQueuedInspection(workerId);
        if (!processed) {
          break;
        }
      }
    } finally {
      await syncQueue.releaseWorkerLease(workerId);
      syncInProgress = false;
      syncMonitor.markCycleCompleted();
      await syncMonitor.refresh();
    }
  };

  const scheduleSync = (source: string) => {
    const cycle = runSyncCycle(source);
    activeCycles.add(cycle);
    void cycle.finally(() => {
      activeCycles.delete(cycle);
    });
  };

  const handleInspectionStatusChanged = () => {
    scheduleSync('inspection status change');
  };

  return {
    start: () => {
      if (started) {
        return;
      }

      started = true;
      intervalId = window.setInterval(() => scheduleSync('interval'), SYNC_CHECK_INTERVAL_MS);
      unsubscribeQueue = syncQueue.subscribe(() => scheduleSync('queue event'));
      unsubscribeInspectionEvents = subscribeToInspectionStatusChanged(handleInspectionStatusChanged);
      scheduleSync('runtime start');
    },
    stop: async () => {
      if (!started) {
        return;
      }

      started = false;
      if (intervalId !== null) {
        window.clearInterval(intervalId);
        intervalId = null;
      }
      unsubscribeQueue?.();
      unsubscribeQueue = null;
      unsubscribeInspectionEvents?.();
      unsubscribeInspectionEvents = null;
      await Promise.allSettled(Array.from(activeCycles));
      await syncQueue.releaseWorkerLease(workerId);
    },
    setConnectivityStatus: (status: BackgroundUploadConnectivityStatus) => {
      connectivityStatus = status;
      if (started && status === 'online') {
        scheduleSync('connectivity restored');
      }
    },
  };
};

export const backgroundUploadRuntime = createBackgroundUploadRuntime();
