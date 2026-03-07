import { useEffect, useRef } from 'react';
import { getUserId } from './auth';
import { useConnectivity } from './ConnectivityContext';
import { getUploadInspectionUrl } from './config';
import { inspectionRepository } from './repositories/inspectionRepository';
import { syncMonitor } from './syncMonitor';
import { buildInspectionSyncFingerprint, syncQueue, type SyncQueueEntry } from './syncQueue';
import { FormDataValue, InspectionSession, UploadStatus } from './types';
import { getFileReferences, serializeFormValue } from './utils/formDataUtils';
import { deleteFiles, getFile } from './utils/fileStorage';

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

export function BackgroundUploadManager() {
  const { status: connectivityStatus } = useConnectivity();
  const syncInProgressRef = useRef(false);
  const workerIdRef = useRef(syncQueue.createWorkerId());

  useEffect(() => {
    const workerId = workerIdRef.current;

    const runSyncCycle = async (source: string) => {
      syncMonitor.noteWakeUp(source);

      if (connectivityStatus !== 'online' || syncInProgressRef.current) {
        if (connectivityStatus !== 'online') {
          syncMonitor.markPaused('offline');
        } else {
          syncMonitor.markBusy('cycle already running');
        }
        return;
      }

      syncInProgressRef.current = true;
      syncMonitor.markCycleStarted(workerId);

      try {
        await syncQueue.ensureQueuedForPendingInspections(await inspectionRepository.loadAll());
        await syncMonitor.refresh();
        if (!(await syncQueue.tryAcquireWorkerLease(workerId))) {
          syncMonitor.markLeaseUnavailable(workerId);
          return;
        }

        syncMonitor.markLeaseAcquired(workerId);

        while (connectivityStatus === 'online') {
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
        syncInProgressRef.current = false;
        syncMonitor.markCycleCompleted();
        await syncMonitor.refresh();
      }
    };

    const handleQueueWakeup = () => {
      void runSyncCycle('queue event');
    };

    void runSyncCycle('effect mount');

    const intervalId = window.setInterval(handleQueueWakeup, SYNC_CHECK_INTERVAL_MS);
    const unsubscribe = syncQueue.subscribe(handleQueueWakeup);
    window.addEventListener('inspection-status-changed', handleQueueWakeup as EventListener);

    return () => {
      window.clearInterval(intervalId);
      unsubscribe();
      window.removeEventListener('inspection-status-changed', handleQueueWakeup as EventListener);
      void syncQueue.releaseWorkerLease(workerId);
    };
  }, [connectivityStatus]);

  return null;
}
