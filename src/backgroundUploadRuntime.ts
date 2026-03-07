import { getUserId } from './auth';
import { getUploadInspectionUrl } from './config';
import { inspectionRepository } from './repositories/inspectionRepository';
import { syncMonitor } from './syncMonitor';
import { buildInspectionSyncFingerprint, syncQueue, type SyncQueueEntry } from './syncQueue';
import { FormDataValue, InspectionSession, UploadStatus } from './types';
import { getFileReferences, serializeFormValue } from './utils/formDataUtils';
import { deleteFiles, getFile } from './utils/fileStorage';

export type BackgroundUploadConnectivityStatus = 'checking' | 'online' | 'offline';

const SYNC_CHECK_INTERVAL_MS = 15_000;

const emitInspectionStatusChanged = (inspection: InspectionSession) => {
  window.dispatchEvent(new CustomEvent('inspection-status-changed', { detail: inspection }));
};

const persistInspectionStatus = async (inspection: InspectionSession, status: UploadStatus) => {
  const updatedInspection: InspectionSession = { ...inspection, uploadStatus: status };
  await inspectionRepository.update(updatedInspection);
  const currentSession = await inspectionRepository.loadCurrent();
  if (currentSession?.id === inspection.id) {
    await inspectionRepository.saveCurrent(updatedInspection);
  }
  emitInspectionStatusChanged(updatedInspection);
  return updatedInspection;
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
      queryParams,
    })
  );

  return uploadForm;
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

  if (!response.ok) {
    throw new Error(`Upload failed with status ${response.status}`);
  }

  const uploadedFileIds = Object.values(formData)
    .flatMap((value) => getFileReferences(value))
    .map((file) => file.id);

  if (uploadedFileIds.length > 0) {
    await deleteFiles(uploadedFileIds);
  }
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
    await uploadInspection(inspection, effectiveQueueEntry);
    await syncQueue.markSucceeded(inspection.id, inspection);
    await persistInspectionStatus(inspection, UploadStatus.Uploaded);
    syncMonitor.markInspectionSucceeded(inspection.id);
  } catch (error) {
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
  let unsubscribe: (() => void) | null = null;
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
      unsubscribe = syncQueue.subscribe(() => scheduleSync('queue event'));
      window.addEventListener('inspection-status-changed', handleInspectionStatusChanged as EventListener);
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
      unsubscribe?.();
      unsubscribe = null;
      window.removeEventListener('inspection-status-changed', handleInspectionStatusChanged as EventListener);
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
