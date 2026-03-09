import { getUserId } from '../auth';
import { publishInspectionStatusChanged } from '../application/inspectionEvents';
import { getUploadInspectionUrl } from '../config';
import { markInspectionConflicted, markInspectionSyncSucceeded } from '../domain/inspectionSync';
import { inspectionRepository } from '../repositories/inspectionRepository';
import { syncMonitor } from '../syncMonitor';
import { buildInspectionSyncFingerprint, syncQueue, type SyncQueueEntry } from '../syncQueue';
import { FormDataValue, InspectionSession, UploadStatus } from '../types';
import { getFileReferences, serializeFormValue } from '../utils/formDataUtils';
import { deleteFiles, getFile } from '../utils/fileStorage';

export class InspectionConflictError extends Error {
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

const persistInspectionStatus = async (inspection: InspectionSession, status: UploadStatus) =>
  persistInspection({ ...inspection, uploadStatus: status });

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

export const processNextQueuedInspection = async (workerId: string) => {
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
    syncMonitor.markInspectionSucceeded(effectiveQueueEntry);
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
