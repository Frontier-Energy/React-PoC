import { useEffect, useRef } from 'react';
import { useConnectivity } from './ConnectivityContext';
import { getUploadInspectionUrl } from './config';
import { InspectionSession, UploadStatus, FormDataValue } from './types';
import { getFileReferences, serializeFormValue } from './utils/formDataUtils';
import { deleteFiles, getFile } from './utils/fileStorage';

const CONNECTIVITY_CHECK_INTERVAL_MS = 30000;

const loadInspectionsFromStorage = () => {
  const sessionMap: Record<string, InspectionSession> = {};
  const keys = Object.keys(localStorage);

  keys.forEach((key) => {
    if (key.startsWith('inspection_')) {
      const sessionStr = localStorage.getItem(key);
      if (sessionStr) {
        try {
          const session: InspectionSession = JSON.parse(sessionStr);
          sessionMap[session.id] = session;
        } catch (error) {
          console.error(`Failed to parse session ${key}:`, error);
        }
      }
    }
  });

  return Object.values(sessionMap);
};

const updateInspectionStatus = (inspection: InspectionSession, status: UploadStatus) => {
  const updatedInspection: InspectionSession = { ...inspection, uploadStatus: status };
  localStorage.setItem(`inspection_${inspection.id}`, JSON.stringify(updatedInspection));
  localStorage.setItem('currentSession', JSON.stringify(updatedInspection));
  window.dispatchEvent(new CustomEvent('inspection-status-changed', { detail: updatedInspection }));
};

const uploadInspection = async (inspection: InspectionSession) => {
  const storedData = localStorage.getItem(`formData_${inspection.id}`);
  const formData: Record<string, FormDataValue> = storedData ? JSON.parse(storedData) : {};

  const fileEntries = Object.entries(formData).filter(([, value]) => getFileReferences(value).length > 0);
  const hasFiles = fileEntries.length > 0;

  if (hasFiles) {
    const uploadForm = new FormData();
    uploadForm.append('sessionId', inspection.id);
    uploadForm.append('name', inspection.name);
    if ((inspection as { userId?: string }).userId) {
      uploadForm.append('userId', String((inspection as { userId?: string }).userId));
    }

    const fileMap: Record<string, string[]> = {};

    for (const [key, value] of Object.entries(formData)) {
      const files = getFileReferences(value);
      if (files.length === 0) {
        uploadForm.append(key, serializeFormValue(value));
        continue;
      }

      fileMap[key] = [];
      for (const fileRef of files) {
        const storedFile = await getFile(fileRef.id);
        if (!storedFile) {
          console.warn(`Missing stored file for ${fileRef.id}`);
          continue;
        }
        uploadForm.append(key, storedFile.blob, storedFile.name);
        fileMap[key].push(fileRef.id);
      }
    }

    uploadForm.append('fileMap', JSON.stringify(fileMap));

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
  } else {
    const queryParams = Object.fromEntries(
      Object.entries(formData).map(([key, value]) => [key, serializeFormValue(value)])
    );
    const payload = {
      sessionId: inspection.id,
      name: inspection.name,
      userId: (inspection as { userId?: string }).userId,
      queryParams,
    };

    const response = await fetch(getUploadInspectionUrl(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(`Upload failed with status ${response.status}`);
    }
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
