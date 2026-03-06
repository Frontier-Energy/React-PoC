import { FormDataValue, InspectionSession } from '../types';
import { getUserId } from '../auth';
import { getActiveTenant } from '../config';

const INSPECTION_PREFIX = 'inspection_';
const CURRENT_SESSION_KEY = 'currentSession';
const FORM_DATA_PREFIX = 'formData_';

type StorageScope = {
  tenantId: string;
  userId: string;
};

const ANONYMOUS_USER_SCOPE = 'anonymous';

const getStorageScope = (): StorageScope => ({
  tenantId: getActiveTenant().tenantId,
  userId: getUserId()?.trim() || ANONYMOUS_USER_SCOPE,
});

const getScopeForInspection = (inspection: Pick<InspectionSession, 'tenantId' | 'userId'>): StorageScope => ({
  tenantId: inspection.tenantId,
  userId: inspection.userId?.trim() || getStorageScope().userId,
});

const getScopeKey = (scope: StorageScope = getStorageScope()) => `${scope.tenantId}:${scope.userId}`;
const getInspectionKeyPrefix = (scope: StorageScope = getStorageScope()) => `${getScopeKey(scope)}:${INSPECTION_PREFIX}`;
const getInspectionKey = (inspectionId: string, scope: StorageScope = getStorageScope()) =>
  `${getInspectionKeyPrefix(scope)}${inspectionId}`;
const getFormDataKey = (inspectionId: string, scope: StorageScope = getStorageScope()) =>
  `${getScopeKey(scope)}:${FORM_DATA_PREFIX}${inspectionId}`;
const getCurrentSessionKey = (scope: StorageScope = getStorageScope()) => `${getScopeKey(scope)}:${CURRENT_SESSION_KEY}`;

const normalizeInspectionForScope = (
  inspection: InspectionSession,
  scope: StorageScope = getStorageScope()
): InspectionSession => ({
  ...inspection,
  tenantId: inspection.tenantId || scope.tenantId,
  userId: inspection.userId ?? (scope.userId === ANONYMOUS_USER_SCOPE ? undefined : scope.userId),
});

const parseJson = <T>(raw: string | null, errorMessage: string): T | null => {
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as T;
  } catch (error) {
    console.error(errorMessage, error);
    return null;
  }
};

export const inspectionRepository = {
  getStorageScopeKey(): string {
    return getScopeKey();
  },

  isInspectionStorageKey(key: string): boolean {
    return key.startsWith(getInspectionKeyPrefix());
  },

  loadAll(): InspectionSession[] {
    const sessionMap: Record<string, InspectionSession> = {};
    const scope = getStorageScope();
    const inspectionKeyPrefix = getInspectionKeyPrefix(scope);
    const keys = Object.keys(localStorage);

    keys.forEach((key) => {
      if (!key.startsWith(inspectionKeyPrefix)) {
        return;
      }

      const session = parseJson<InspectionSession>(
        localStorage.getItem(key),
        `Failed to parse session ${key}:`
      );
      if (session) {
        const normalizedSession = normalizeInspectionForScope(session, scope);
        sessionMap[normalizedSession.id] = normalizedSession;
      }
    });

    return Object.values(sessionMap);
  },

  loadById(inspectionId: string): InspectionSession | null {
    const session = parseJson<InspectionSession>(
      localStorage.getItem(getInspectionKey(inspectionId)),
      `Failed to parse session ${inspectionId}:`
    );
    return session ? normalizeInspectionForScope(session) : null;
  },

  loadCurrent(): InspectionSession | null {
    const session = parseJson<InspectionSession>(
      localStorage.getItem(getCurrentSessionKey()),
      'Failed to parse current inspection session:'
    );
    return session ? normalizeInspectionForScope(session) : null;
  },

  loadCurrentOrById(inspectionId: string): InspectionSession | null {
    const currentSession = this.loadCurrent();
    if (currentSession?.id === inspectionId) {
      return currentSession;
    }
    return this.loadById(inspectionId);
  },

  save(inspection: InspectionSession): void {
    const inspectionScope = getScopeForInspection(inspection);
    const normalizedInspection = normalizeInspectionForScope(inspection, inspectionScope);
    localStorage.setItem(getInspectionKey(normalizedInspection.id, inspectionScope), JSON.stringify(normalizedInspection));
  },

  saveCurrent(inspection: InspectionSession): void {
    const inspectionScope = getScopeForInspection(inspection);
    const normalizedInspection = normalizeInspectionForScope(inspection, inspectionScope);
    localStorage.setItem(getCurrentSessionKey(inspectionScope), JSON.stringify(normalizedInspection));
  },

  saveAsCurrent(inspection: InspectionSession): void {
    this.save(inspection);
    this.saveCurrent(inspection);
  },

  update(inspection: InspectionSession): InspectionSession {
    this.save(inspection);
    return inspection;
  },

  delete(
    inspectionOrId: InspectionSession | string,
    options?: { removeFormData?: boolean; removeCurrentIfMatch?: boolean }
  ): void {
    const removeFormData = options?.removeFormData ?? true;
    const removeCurrentIfMatch = options?.removeCurrentIfMatch ?? true;
    const inspectionId = typeof inspectionOrId === 'string' ? inspectionOrId : inspectionOrId.id;
    const inspectionScope =
      typeof inspectionOrId === 'string' ? getStorageScope() : getScopeForInspection(inspectionOrId);

    localStorage.removeItem(getInspectionKey(inspectionId, inspectionScope));
    if (removeFormData) {
      localStorage.removeItem(getFormDataKey(inspectionId, inspectionScope));
    }

    if (!removeCurrentIfMatch) {
      return;
    }

    const currentSession = parseJson<InspectionSession>(
      localStorage.getItem(getCurrentSessionKey(inspectionScope)),
      'Failed to parse current inspection session:'
    );
    if (currentSession?.id === inspectionId) {
      localStorage.removeItem(getCurrentSessionKey(inspectionScope));
    }
  },

  loadFormData(
    inspectionId: string,
    inspection?: Pick<InspectionSession, 'tenantId' | 'userId'>
  ): Record<string, FormDataValue> | null {
    const scope = inspection ? getScopeForInspection(inspection) : getStorageScope();
    return parseJson<Record<string, FormDataValue>>(
      localStorage.getItem(getFormDataKey(inspectionId, scope)),
      `Failed to parse form data for session ${inspectionId}:`
    );
  },

  saveFormData(
    inspectionId: string,
    formData: Record<string, FormDataValue>,
    inspection?: Pick<InspectionSession, 'tenantId' | 'userId'>
  ): void {
    const scope = inspection ? getScopeForInspection(inspection) : getStorageScope();
    localStorage.setItem(getFormDataKey(inspectionId, scope), JSON.stringify(formData));
  },

  updateFormDataEntry(
    inspectionId: string,
    key: string,
    value: FormDataValue | undefined,
    inspection?: Pick<InspectionSession, 'tenantId' | 'userId'>
  ): void {
    const currentFormData = this.loadFormData(inspectionId, inspection) ?? {};
    if (value === undefined) {
      delete currentFormData[key];
    } else {
      currentFormData[key] = value;
    }
    this.saveFormData(inspectionId, currentFormData, inspection);
  },

  clearFormData(inspectionId: string, inspection?: Pick<InspectionSession, 'tenantId' | 'userId'>): void {
    const scope = inspection ? getScopeForInspection(inspection) : getStorageScope();
    localStorage.removeItem(getFormDataKey(inspectionId, scope));
  },
};
