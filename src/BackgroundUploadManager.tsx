import { useEffect, useRef } from 'react';
import { getUserId } from './auth';
import { useConnectivity } from './ConnectivityContext';
import { getUploadInspectionUrl } from './config';
import { inspectionRepository } from './repositories/inspectionRepository';
import { buildInspectionSyncFingerprint, syncQueue, type SyncQueueEntry } from './syncQueue';
import { FormDataValue, InspectionSession, UploadStatus } from './types';
import { getFileReferences, serializeFormValue } from './utils/formDataUtils';
import { deleteFiles, getFile } from './utils/fileStorage';

const SYNC_CHECK_INTERVAL_MS = 15_000;

const emitInspectionStatusChanged = (inspection: InspectionSession) => {
  window.dispatchEvent(new CustomEvent('inspection-status-changed', { detail: inspection }));
};

const persistInspectionStatus = (inspection: InspectionSession, status: UploadStatus) => {
  const updatedInspection: InspectionSession = { ...inspection, uploadStatus: status };
  inspectionRepository.update(updatedInspection);
  const currentSession = inspectionRepository.loadCurrent();
  if (currentSession?.id === inspection.id) {
    inspectionRepository.saveCurrent(updatedInspection);
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
  const formData = inspectionRepository.loadFormData(inspection.id, inspection) ?? {};
  const refreshedQueueEntry = syncQueue.refreshFingerprint(queueEntry, inspection, formData);
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
  const queueEntry = syncQueue.claimNextReady(workerId);
  if (!queueEntry) {
    return false;
  }

  const inspection = inspectionRepository.loadById(queueEntry.inspectionId);
  if (!inspection) {
    syncQueue.delete(queueEntry.inspectionId);
    return true;
  }

  const formData = inspectionRepository.loadFormData(inspection.id, inspection) ?? {};
  const currentFingerprint = buildInspectionSyncFingerprint(inspection, formData);
  const effectiveQueueEntry =
    currentFingerprint === queueEntry.fingerprint
      ? queueEntry
      : syncQueue.refreshFingerprint(queueEntry, inspection, formData);

  persistInspectionStatus(inspection, UploadStatus.Uploading);

  try {
    await uploadInspection(inspection, effectiveQueueEntry);
    syncQueue.markSucceeded(inspection.id);
    persistInspectionStatus(inspection, UploadStatus.Uploaded);
  } catch (error) {
    console.error('Failed to upload inspection:', inspection.id, error);
    syncQueue.markFailed(effectiveQueueEntry, error instanceof Error ? error.message : 'Unknown upload error');
    persistInspectionStatus(inspection, UploadStatus.Failed);
  }

  return true;
};

export function BackgroundUploadManager() {
  const { status: connectivityStatus } = useConnectivity();
  const syncInProgressRef = useRef(false);
  const workerIdRef = useRef(syncQueue.createWorkerId());

  useEffect(() => {
    const workerId = workerIdRef.current;

    const runSyncCycle = async () => {
      if (connectivityStatus !== 'online' || syncInProgressRef.current) {
        return;
      }

      syncInProgressRef.current = true;

      try {
        syncQueue.ensureQueuedForPendingInspections(inspectionRepository.loadAll());
        if (!syncQueue.tryAcquireWorkerLease(workerId)) {
          return;
        }

        while (connectivityStatus === 'online') {
          if (!syncQueue.renewWorkerLease(workerId)) {
            break;
          }

          const processed = await processNextQueuedInspection(workerId);
          if (!processed) {
            break;
          }
        }
      } finally {
        syncQueue.releaseWorkerLease(workerId);
        syncInProgressRef.current = false;
      }
    };

    const handleQueueWakeup = () => {
      void runSyncCycle();
    };

    void runSyncCycle();

    const intervalId = window.setInterval(handleQueueWakeup, SYNC_CHECK_INTERVAL_MS);
    window.addEventListener('storage', handleQueueWakeup);
    window.addEventListener('inspection-status-changed', handleQueueWakeup as EventListener);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener('storage', handleQueueWakeup);
      window.removeEventListener('inspection-status-changed', handleQueueWakeup as EventListener);
      syncQueue.releaseWorkerLease(workerId);
    };
  }, [connectivityStatus]);

  return null;
}
