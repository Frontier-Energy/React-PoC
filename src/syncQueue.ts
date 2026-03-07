import { getUserId } from './auth';
import type { SyncQueueEntry } from './domain/syncQueue';
import { inspectionRepository } from './repositories/inspectionRepository';
import { buildInspectionSyncFingerprint as buildFingerprint, createSyncQueueService } from './services/syncQueueService';
import { FormDataValue, InspectionSession } from './types';
import { appDataStore, type StorageScope } from './utils/appDataStore';

const getScope = (): StorageScope => {
  const [tenantId, userId] = inspectionRepository.getStorageScopeKey().split(':', 2);
  return { tenantId, userId };
};

const generateId = () => {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

export const buildInspectionSyncFingerprint = (
  inspection: InspectionSession,
  formData: Record<string, FormDataValue>
) => buildFingerprint(inspection, formData, getUserId);

export { type SyncQueueEntry };

export const syncQueue = createSyncQueueService({
  store: appDataStore,
  inspectionRepository,
  resolveActiveScope: getScope,
  resolveUserId: getUserId,
  createId: generateId,
  now: () => Date.now(),
  random: () => Math.random(),
});
