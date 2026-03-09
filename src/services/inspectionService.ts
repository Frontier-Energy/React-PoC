import type { ScopedEntity } from '../domain/storageScope';
import { ensureInspectionSyncState, markInspectionEdited } from '../domain/inspectionSync';
import { ANONYMOUS_USER_SCOPE } from '../domain/storageScope';
import type { FormDataValue, InspectionSession } from '../types';
import type { StorageScope } from '../utils/appDataStore';

export interface InspectionStore {
  getScopeKey(scope: StorageScope): string;
  subscribe(scopeKey: string, listener: () => void): () => void;
  listInspections(scope: StorageScope): Promise<InspectionSession[]>;
  getInspection(storageKey: string): Promise<InspectionSession | null>;
  putInspection(scope: StorageScope, storageKey: string, value: InspectionSession): Promise<void>;
  deleteInspection(scope: StorageScope, storageKey: string): Promise<void>;
  getCurrentSession(scope: StorageScope): Promise<InspectionSession | null>;
  putCurrentSession(scope: StorageScope, value: InspectionSession): Promise<void>;
  deleteCurrentSession(scope: StorageScope): Promise<void>;
  getFormData(storageKey: string): Promise<Record<string, FormDataValue> | null>;
  putFormData(scope: StorageScope, storageKey: string, value: Record<string, FormDataValue>): Promise<void>;
  deleteFormData(scope: StorageScope, storageKey: string): Promise<void>;
}

export interface InspectionServiceDependencies {
  store: InspectionStore;
  resolveActiveScope: () => StorageScope;
}

const INSPECTION_PREFIX = 'inspection_';
const FORM_DATA_PREFIX = 'formData_';

export const createInspectionRepository = ({ store, resolveActiveScope }: InspectionServiceDependencies) => {
  const getScopeForInspection = (inspection: ScopedEntity): StorageScope => ({
    tenantId: inspection.tenantId,
    userId: inspection.userId?.trim() || resolveActiveScope().userId,
  });

  const getInspectionKeyPrefix = (scope: StorageScope = resolveActiveScope()) =>
    `${store.getScopeKey(scope)}:${INSPECTION_PREFIX}`;
  const getInspectionKey = (inspectionId: string, scope: StorageScope = resolveActiveScope()) =>
    `${getInspectionKeyPrefix(scope)}${inspectionId}`;
  const getFormDataKey = (inspectionId: string, scope: StorageScope = resolveActiveScope()) =>
    `${store.getScopeKey(scope)}:${FORM_DATA_PREFIX}${inspectionId}`;

  const normalizeInspectionForScope = (
    inspection: InspectionSession,
    scope: StorageScope = resolveActiveScope()
  ): InspectionSession => ({
    ...ensureInspectionSyncState(inspection),
    tenantId: inspection.tenantId || scope.tenantId,
    userId: inspection.userId ?? (scope.userId === ANONYMOUS_USER_SCOPE ? undefined : scope.userId),
  });

  const bumpInspectionRevision = async (inspectionId: string, scope: StorageScope) => {
    const [inspection, currentSession] = await Promise.all([
      store.getInspection(getInspectionKey(inspectionId, scope)),
      store.getCurrentSession(scope),
    ]);
    const sourceInspection =
      currentSession?.id === inspectionId ? currentSession : inspection;

    if (!sourceInspection) {
      return null;
    }

    const updatedInspection = normalizeInspectionForScope(markInspectionEdited(sourceInspection), scope);
    await store.putInspection(scope, getInspectionKey(updatedInspection.id, scope), updatedInspection);

    if (currentSession?.id === updatedInspection.id) {
      await store.putCurrentSession(scope, updatedInspection);
    }

    return updatedInspection;
  };

  return {
    getStorageScopeKey(): string {
      return store.getScopeKey(resolveActiveScope());
    },

    isInspectionStorageKey(key: string): boolean {
      return key.startsWith(getInspectionKeyPrefix());
    },

    subscribe(listener: () => void) {
      return store.subscribe(this.getStorageScopeKey(), listener);
    },

    async loadAll(): Promise<InspectionSession[]> {
      const scope = resolveActiveScope();
      const sessionMap: Record<string, InspectionSession> = {};
      const sessions = await store.listInspections(scope);

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
      const scope = inspection ? getScopeForInspection(inspection) : resolveActiveScope();
      const session = await store.getInspection(getInspectionKey(inspectionId, scope));
      return session ? normalizeInspectionForScope(session, scope) : null;
    },

    async loadCurrent(inspection?: Pick<InspectionSession, 'tenantId' | 'userId'>): Promise<InspectionSession | null> {
      const scope = inspection ? getScopeForInspection(inspection) : resolveActiveScope();
      const session = await store.getCurrentSession(scope);
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
      await store.putInspection(inspectionScope, getInspectionKey(normalizedInspection.id, inspectionScope), normalizedInspection);
    },

    async saveCurrent(inspection: InspectionSession): Promise<void> {
      const inspectionScope = getScopeForInspection(inspection);
      const normalizedInspection = normalizeInspectionForScope(inspection, inspectionScope);
      await store.putCurrentSession(inspectionScope, normalizedInspection);
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
        typeof inspectionOrId === 'string' ? resolveActiveScope() : getScopeForInspection(inspectionOrId);

      await store.deleteInspection(inspectionScope, getInspectionKey(inspectionId, inspectionScope));
      if (removeFormData) {
        await store.deleteFormData(inspectionScope, getFormDataKey(inspectionId, inspectionScope));
      }

      if (!removeCurrentIfMatch) {
        return;
      }

      const currentSession = await this.loadCurrent(inspectionScope);
      if (currentSession?.id === inspectionId) {
        await store.deleteCurrentSession(inspectionScope);
      }
    },

    async loadFormData(
      inspectionId: string,
      inspection?: Pick<InspectionSession, 'tenantId' | 'userId'>
    ): Promise<Record<string, FormDataValue> | null> {
      const scope = inspection ? getScopeForInspection(inspection) : resolveActiveScope();
      return store.getFormData(getFormDataKey(inspectionId, scope));
    },

    async saveFormData(
      inspectionId: string,
      formData: Record<string, FormDataValue>,
      inspection?: Pick<InspectionSession, 'tenantId' | 'userId'>
    ): Promise<void> {
      const scope = inspection ? getScopeForInspection(inspection) : resolveActiveScope();
      await store.putFormData(scope, getFormDataKey(inspectionId, scope), formData);
      await bumpInspectionRevision(inspectionId, scope);
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

      const scope = inspection ? getScopeForInspection(inspection) : resolveActiveScope();
      await store.putFormData(scope, getFormDataKey(inspectionId, scope), currentFormData);
      await bumpInspectionRevision(inspectionId, scope);
    },

    async clearFormData(
      inspectionId: string,
      inspection?: Pick<InspectionSession, 'tenantId' | 'userId'>
    ): Promise<void> {
      const scope = inspection ? getScopeForInspection(inspection) : resolveActiveScope();
      await store.deleteFormData(scope, getFormDataKey(inspectionId, scope));
      await bumpInspectionRevision(inspectionId, scope);
    },
  };
};
