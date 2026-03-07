import { FormDataValue, InspectionSession } from '../types';
import { getUserId } from '../auth';
import { getActiveTenant } from '../config';
import { appDataStore, type StorageScope } from '../utils/appDataStore';

const INSPECTION_PREFIX = 'inspection_';
const FORM_DATA_PREFIX = 'formData_';

const ANONYMOUS_USER_SCOPE = 'anonymous';

const getStorageScope = (): StorageScope => ({
  tenantId: getActiveTenant().tenantId,
  userId: getUserId()?.trim() || ANONYMOUS_USER_SCOPE,
});

const getScopeForInspection = (inspection: Pick<InspectionSession, 'tenantId' | 'userId'>): StorageScope => ({
  tenantId: inspection.tenantId,
  userId: inspection.userId?.trim() || getStorageScope().userId,
});

const getInspectionKeyPrefix = (scope: StorageScope = getStorageScope()) =>
  `${appDataStore.getScopeKey(scope)}:${INSPECTION_PREFIX}`;
const getInspectionKey = (inspectionId: string, scope: StorageScope = getStorageScope()) =>
  `${getInspectionKeyPrefix(scope)}${inspectionId}`;
const getFormDataKey = (inspectionId: string, scope: StorageScope = getStorageScope()) =>
  `${appDataStore.getScopeKey(scope)}:${FORM_DATA_PREFIX}${inspectionId}`;

const normalizeInspectionForScope = (
  inspection: InspectionSession,
  scope: StorageScope = getStorageScope()
): InspectionSession => ({
  ...inspection,
  tenantId: inspection.tenantId || scope.tenantId,
  userId: inspection.userId ?? (scope.userId === ANONYMOUS_USER_SCOPE ? undefined : scope.userId),
});

export const inspectionRepository = {
  getStorageScopeKey(): string {
    return appDataStore.getScopeKey(getStorageScope());
  },

  isInspectionStorageKey(key: string): boolean {
    return key.startsWith(getInspectionKeyPrefix());
  },

  subscribe(listener: () => void) {
    return appDataStore.subscribe(this.getStorageScopeKey(), listener);
  },

  async loadAll(): Promise<InspectionSession[]> {
    const scope = getStorageScope();
    const sessionMap: Record<string, InspectionSession> = {};
    const sessions = await appDataStore.listInspections(scope);

    sessions.forEach((session) => {
      const normalizedSession = normalizeInspectionForScope(session, scope);
      sessionMap[normalizedSession.id] = normalizedSession;
    });

    return Object.values(sessionMap);
  },

  async loadById(
    inspectionId: string,
    inspection?: Pick<InspectionSession, 'tenantId' | 'userId'>
  ): Promise<InspectionSession | null> {
    const scope = inspection ? getScopeForInspection(inspection) : getStorageScope();
    const session = await appDataStore.getInspection(getInspectionKey(inspectionId, scope));
    return session ? normalizeInspectionForScope(session, scope) : null;
  },

  async loadCurrent(inspection?: Pick<InspectionSession, 'tenantId' | 'userId'>): Promise<InspectionSession | null> {
    const scope = inspection ? getScopeForInspection(inspection) : getStorageScope();
    const session = await appDataStore.getCurrentSession(scope);
    return session ? normalizeInspectionForScope(session, scope) : null;
  },

  async loadCurrentOrById(
    inspectionId: string,
    inspection?: Pick<InspectionSession, 'tenantId' | 'userId'>
  ): Promise<InspectionSession | null> {
    const currentSession = await this.loadCurrent(inspection);
    if (currentSession?.id === inspectionId) {
      return currentSession;
    }

    return this.loadById(inspectionId, inspection);
  },

  async save(inspection: InspectionSession): Promise<void> {
    const inspectionScope = getScopeForInspection(inspection);
    const normalizedInspection = normalizeInspectionForScope(inspection, inspectionScope);
    await appDataStore.putInspection(inspectionScope, getInspectionKey(normalizedInspection.id, inspectionScope), normalizedInspection);
  },

  async saveCurrent(inspection: InspectionSession): Promise<void> {
    const inspectionScope = getScopeForInspection(inspection);
    const normalizedInspection = normalizeInspectionForScope(inspection, inspectionScope);
    await appDataStore.putCurrentSession(inspectionScope, normalizedInspection);
  },

  async saveAsCurrent(inspection: InspectionSession): Promise<void> {
    await this.save(inspection);
    await this.saveCurrent(inspection);
  },

  async update(inspection: InspectionSession): Promise<InspectionSession> {
    await this.save(inspection);
    return inspection;
  },

  async delete(
    inspectionOrId: InspectionSession | string,
    options?: { removeFormData?: boolean; removeCurrentIfMatch?: boolean }
  ): Promise<void> {
    const removeFormData = options?.removeFormData ?? true;
    const removeCurrentIfMatch = options?.removeCurrentIfMatch ?? true;
    const inspectionId = typeof inspectionOrId === 'string' ? inspectionOrId : inspectionOrId.id;
    const inspectionScope =
      typeof inspectionOrId === 'string' ? getStorageScope() : getScopeForInspection(inspectionOrId);

    await appDataStore.deleteInspection(inspectionScope, getInspectionKey(inspectionId, inspectionScope));
    if (removeFormData) {
      await appDataStore.deleteFormData(inspectionScope, getFormDataKey(inspectionId, inspectionScope));
    }

    if (!removeCurrentIfMatch) {
      return;
    }

    const currentSession = await this.loadCurrent(inspectionScope);
    if (currentSession?.id === inspectionId) {
      await appDataStore.deleteCurrentSession(inspectionScope);
    }
  },

  async loadFormData(
    inspectionId: string,
    inspection?: Pick<InspectionSession, 'tenantId' | 'userId'>
  ): Promise<Record<string, FormDataValue> | null> {
    const scope = inspection ? getScopeForInspection(inspection) : getStorageScope();
    return appDataStore.getFormData(getFormDataKey(inspectionId, scope));
  },

  async saveFormData(
    inspectionId: string,
    formData: Record<string, FormDataValue>,
    inspection?: Pick<InspectionSession, 'tenantId' | 'userId'>
  ): Promise<void> {
    const scope = inspection ? getScopeForInspection(inspection) : getStorageScope();
    await appDataStore.putFormData(scope, getFormDataKey(inspectionId, scope), formData);
  },

  async updateFormDataEntry(
    inspectionId: string,
    key: string,
    value: FormDataValue | undefined,
    inspection?: Pick<InspectionSession, 'tenantId' | 'userId'>
  ): Promise<void> {
    const currentFormData = (await this.loadFormData(inspectionId, inspection)) ?? {};
    if (value === undefined) {
      delete currentFormData[key];
    } else {
      currentFormData[key] = value;
    }

    await this.saveFormData(inspectionId, currentFormData, inspection);
  },

  async clearFormData(
    inspectionId: string,
    inspection?: Pick<InspectionSession, 'tenantId' | 'userId'>
  ): Promise<void> {
    const scope = inspection ? getScopeForInspection(inspection) : getStorageScope();
    await appDataStore.deleteFormData(scope, getFormDataKey(inspectionId, scope));
  },
};
