import { useEffect, useRef } from 'react';
import { useConnectivity } from './ConnectivityContext';
import { getUploadInspectionUrl } from './config';
import { InspectionSession, UploadStatus, FormDataValue } from './types';
import { getFileReferences, serializeFormValue } from './utils/formDataUtils';
import { deleteFiles, getFile } from './utils/fileStorage';
import { inspectionRepository } from './repositories/inspectionRepository';

const CONNECTIVITY_CHECK_INTERVAL_MS = 30000;

const loadInspectionsFromStorage = () => {
  return inspectionRepository.loadAll();
};

const updateInspectionStatus = (inspection: InspectionSession, status: UploadStatus) => {
  const updatedInspection: InspectionSession = { ...inspection, uploadStatus: status };
  inspectionRepository.update(updatedInspection);
  const currentSession = inspectionRepository.loadCurrent();
  if (currentSession?.id === inspection.id) {
    inspectionRepository.saveCurrent(updatedInspection);
  }
  window.dispatchEvent(new CustomEvent('inspection-status-changed', { detail: updatedInspection }));
};

const uploadInspection = async (inspection: InspectionSession) => {
  const formData: Record<string, FormDataValue> = inspectionRepository.loadFormData(inspection.id) ?? {};

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
  const payload = {
    sessionId: inspection.id,
    name: inspection.name,
    userId: '',
    queryParams,
  };

  if ((inspection as { userId?: string }).userId) {
    payload.userId = (inspection as { userId: string }).userId;
  }

  uploadForm.append('payload', JSON.stringify(payload));

  const response = await fetch(getUploadInspectionUrl(), {
    method: 'POST',
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

const processLocalInspections = async () => {
  const inspections = loadInspectionsFromStorage();
  const localInspections = inspections.filter(
    (inspection) => (inspection.uploadStatus || UploadStatus.Local) === UploadStatus.Local
  );

  for (const inspection of localInspections) {
    updateInspectionStatus(inspection, UploadStatus.Uploading);
    try {
      await uploadInspection(inspection);
      updateInspectionStatus(inspection, UploadStatus.Uploaded);
    } catch (error) {
      console.error('Failed to upload inspection:', inspection.id, error);
      updateInspectionStatus(inspection, UploadStatus.Failed);
    }
  }
};

export function BackgroundUploadManager() {
  const { status: connectivityStatus } = useConnectivity();
  const uploadInProgressRef = useRef(false);

  useEffect(() => {
    const runUploadCheck = async () => {
      if (connectivityStatus !== 'online' || uploadInProgressRef.current) {
        return;
      }
      uploadInProgressRef.current = true;
      try {
        await processLocalInspections();
      } finally {
        uploadInProgressRef.current = false;
      }
    };

    runUploadCheck();
    const intervalId = setInterval(runUploadCheck, CONNECTIVITY_CHECK_INTERVAL_MS);

    return () => clearInterval(intervalId);
  }, [connectivityStatus]);

  return null;
}
