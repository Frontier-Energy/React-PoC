import { ANONYMOUS_USER_SCOPE } from '../domain/storageScope';
import { getUserId } from '../auth';
import { getActiveTenant } from '../config';
import { createInspectionRepository } from '../services/inspectionService';
import { appDataStore, type StorageScope } from '../utils/appDataStore';

const getStorageScope = (): StorageScope => ({
  tenantId: getActiveTenant().tenantId,
  userId: getUserId()?.trim() || ANONYMOUS_USER_SCOPE,
});

export const inspectionRepository = createInspectionRepository({
  store: appDataStore,
  resolveActiveScope: getStorageScope,
});
