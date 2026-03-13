import { markInspectionEdited } from '../domain/inspectionSync';
import type { SyncQueueEntry } from '../domain/syncQueue';
import { inspectionRepository } from '../repositories/inspectionRepository';
import { syncQueue } from '../syncQueue';
import { type FormDataValue, type InspectionSession, UploadStatus } from '../types';
import { deleteFiles, saveFiles } from '../utils/fileStorage';
import { getFileReferences } from '../utils/formDataUtils';
import { publishInspectionStatusChanged } from './inspectionEvents';

interface InspectionRepositoryLike {
  loadAll(): Promise<InspectionSession[]>;
  loadCurrent(inspection?: Pick<InspectionSession, 'tenantId' | 'userId'>): Promise<InspectionSession | null>;
  loadFormData(
    inspectionId: string,
    inspection?: Pick<InspectionSession, 'tenantId' | 'userId'>
  ): Promise<Record<string, FormDataValue> | null>;
  update(inspection: InspectionSession): Promise<InspectionSession>;
  saveCurrent(inspection: InspectionSession): Promise<void>;
  saveAsCurrent(inspection: InspectionSession): Promise<void>;
  updateFormDataEntry(
    inspectionId: string,
    key: string,
    value: FormDataValue | undefined,
    inspection?: Pick<InspectionSession, 'tenantId' | 'userId'>
  ): Promise<void>;
  clearFormData(
    inspectionId: string,
    inspection?: Pick<InspectionSession, 'tenantId' | 'userId'>
  ): Promise<void>;
  delete(inspection: InspectionSession | string, options?: { removeFormData?: boolean; removeCurrentIfMatch?: boolean }): Promise<void>;
}

interface SyncQueueLike {
  enqueue(inspection: InspectionSession, formData: Record<string, FormDataValue>): Promise<unknown>;
  retry(entry: SyncQueueEntry): Promise<unknown>;
  moveToDeadLetter(entry: SyncQueueEntry, reason: string): Promise<unknown>;
  delete(inspectionId: string, inspection?: Pick<InspectionSession, 'tenantId' | 'userId'>): Promise<void>;
}

interface InspectionApplicationServiceDependencies {
  inspectionRepository: InspectionRepositoryLike;
  syncQueue: SyncQueueLike;
  saveFiles: typeof saveFiles;
  deleteFiles: typeof deleteFiles;
  publishInspectionStatusChanged: (inspection: InspectionSession) => void;
}

export const createInspectionApplicationService = ({
  inspectionRepository: inspectionRepo,
  syncQueue: queue,
  saveFiles: persistFiles,
  deleteFiles: removeFiles,
  publishInspectionStatusChanged: publishStatusChanged,
}: InspectionApplicationServiceDependencies) => {
  const saveDraftFieldValue = async (
    sessionId: string,
    inspection: Pick<InspectionSession, 'tenantId' | 'userId'>,
    fieldId: string,
    value: FormDataValue | undefined,
    externalId?: string
  ) => {
    await inspectionRepo.updateFormDataEntry(sessionId, externalId ?? fieldId, value, inspection);
  };

  return {
  async getUploadStatusCounts() {
    const inspections = await inspectionRepo.loadAll();
    const counts: Record<UploadStatus, number> = {
      [UploadStatus.Local]: 0,
      [UploadStatus.InProgress]: 0,
      [UploadStatus.Uploading]: 0,
      [UploadStatus.Uploaded]: 0,
      [UploadStatus.Failed]: 0,
      [UploadStatus.Conflict]: 0,
    };

    inspections.forEach((inspection) => {
      const status = inspection.uploadStatus ?? UploadStatus.Local;
      counts[status] += 1;
    });

    return counts;
  },

  getRecoveryCandidates(inspections: InspectionSession[], queueEntries: SyncQueueEntry[]) {
    const queueEntriesById = new Map(queueEntries.map((entry) => [entry.inspectionId, entry]));
    return inspections.filter((inspection) => {
      const entry = queueEntriesById.get(inspection.id);
      const uploadStatus = inspection.uploadStatus ?? UploadStatus.Local;
      return (
        uploadStatus === UploadStatus.Failed ||
        uploadStatus === UploadStatus.Conflict ||
        uploadStatus === UploadStatus.Uploading ||
        entry?.status === 'failed' ||
        entry?.status === 'conflict' ||
        entry?.status === 'dead-letter' ||
        entry?.status === 'syncing'
      );
    });
  },

  async getFormDataFieldCount(
    inspectionId: string,
    inspection?: Pick<InspectionSession, 'tenantId' | 'userId'>
  ) {
    const formData = await inspectionRepo.loadFormData(inspectionId, inspection);
    return Object.keys(formData ?? {}).length;
  },

  async retryQueueEntry(entry: SyncQueueEntry) {
    await queue.retry(entry);
  },

  async moveQueueEntryToDeadLetter(entry: SyncQueueEntry, reason: string) {
    await queue.moveToDeadLetter(entry, reason);
  },

  async recoverUpload(inspection: InspectionSession, entry?: SyncQueueEntry | null) {
    const formData = (await inspectionRepo.loadFormData(inspection.id, inspection)) ?? {};
    const recoveredInspection: InspectionSession = {
      ...inspection,
      uploadStatus: UploadStatus.Local,
    };

    await inspectionRepo.update(recoveredInspection);
    if (entry) {
      await queue.retry(entry);
    } else {
      await queue.enqueue(recoveredInspection, formData);
    }

    const currentSession = await inspectionRepo.loadCurrent(inspection);
    if (currentSession?.id === inspection.id) {
      await inspectionRepo.saveCurrent(recoveredInspection);
    }

    publishStatusChanged(recoveredInspection);
    return recoveredInspection;
  },

  async activateInspectionSession(inspection: InspectionSession) {
    await inspectionRepo.saveCurrent(inspection);
  },

  async retryInspectionUpload(inspection: InspectionSession) {
    const formData = (await inspectionRepo.loadFormData(inspection.id, inspection)) ?? {};
    const updatedInspection: InspectionSession = {
      ...inspection,
      uploadStatus: UploadStatus.Local,
    };

    await inspectionRepo.update(updatedInspection);
    await queue.enqueue(updatedInspection, formData);

    const currentSession = await inspectionRepo.loadCurrent();
    if (currentSession?.id === inspection.id) {
      await inspectionRepo.saveCurrent(updatedInspection);
    }

    publishStatusChanged(updatedInspection);
    return updatedInspection;
  },

  async deleteInspection(inspection: InspectionSession) {
    await inspectionRepo.delete(inspection);
    await queue.delete(inspection.id, inspection);
  },

  async saveDraftFieldValue(
    sessionId: string,
    inspection: Pick<InspectionSession, 'tenantId' | 'userId'>,
    fieldId: string,
    value: FormDataValue | undefined,
    externalId?: string
  ) {
    await saveDraftFieldValue(sessionId, inspection, fieldId, value, externalId);
  },

  async replaceDraftFiles(options: {
    sessionId?: string;
    inspection: Pick<InspectionSession, 'tenantId' | 'userId'> | null;
    fieldId: string;
    currentValue: FormDataValue | undefined;
    files: File[];
    multiple?: boolean;
    externalId?: string;
  }) {
    const { sessionId, inspection, fieldId, currentValue, files, multiple, externalId } = options;
    let existingFiles = getFileReferences(currentValue);
    if (existingFiles.length === 0 && sessionId && inspection) {
      const storedFormData = await inspectionRepo.loadFormData(sessionId, inspection);
      existingFiles = getFileReferences(storedFormData?.[externalId ?? fieldId]);
    }
    if (existingFiles.length > 0) {
      await removeFiles(existingFiles.map((file) => file.id));
    }

    if (files.length === 0) {
      if (sessionId && inspection) {
        await saveDraftFieldValue(sessionId, inspection, fieldId, undefined, externalId);
      }
      return undefined;
    }

    const savedFiles = await persistFiles(files, { sessionId, fieldId });
    const nextValue = multiple ? savedFiles : savedFiles[0];

    if (sessionId && inspection) {
      await saveDraftFieldValue(sessionId, inspection, fieldId, nextValue, externalId);
    }

    return nextValue;
  },

  async resetDraft(
    sessionId: string,
    inspection: Pick<InspectionSession, 'tenantId' | 'userId'>,
    formData: Record<string, FormDataValue>
  ) {
    const fileIds = Object.values(formData)
      .flatMap((value) => getFileReferences(value))
      .map((file) => file.id);

    if (fileIds.length > 0) {
      await removeFiles(fileIds);
    }

    await inspectionRepo.clearFormData(sessionId, inspection);
  },

  async renameDraftSession(session: InspectionSession, name: string) {
    const updatedSession = markInspectionEdited({
      ...session,
      name,
    });
    await inspectionRepo.saveAsCurrent(updatedSession);
    return updatedSession;
  },

  async submitDraft(session: InspectionSession, formData: Record<string, FormDataValue>) {
    const updatedSession: InspectionSession = {
      ...session,
      uploadStatus: UploadStatus.Local,
    };

    await inspectionRepo.saveAsCurrent(updatedSession);
    await queue.enqueue(updatedSession, formData);
    publishStatusChanged(updatedSession);
    return updatedSession;
  },
  };
};

export const inspectionApplicationService = createInspectionApplicationService({
  inspectionRepository,
  syncQueue,
  saveFiles,
  deleteFiles,
  publishInspectionStatusChanged,
});
