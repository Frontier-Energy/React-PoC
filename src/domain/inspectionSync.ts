import type { InspectionConflictDetails, InspectionSession, InspectionVersionStamp } from '../types';

export const DEFAULT_INSPECTION_MERGE_POLICY = 'manual-on-version-mismatch' as const;

const createDefaultVersionStamp = (updatedAt: number): InspectionVersionStamp => ({
  clientRevision: 1,
  baseServerRevision: null,
  serverRevision: null,
  updatedAt,
  mergePolicy: DEFAULT_INSPECTION_MERGE_POLICY,
});

export const ensureInspectionSyncState = (
  inspection: InspectionSession,
  updatedAt = Date.now()
) => {
  const version: InspectionVersionStamp = inspection.version
    ? {
        clientRevision: Math.max(1, inspection.version.clientRevision ?? 1),
        baseServerRevision: inspection.version.baseServerRevision ?? null,
        serverRevision: inspection.version.serverRevision ?? null,
        updatedAt: inspection.version.updatedAt ?? updatedAt,
        mergePolicy: inspection.version.mergePolicy ?? DEFAULT_INSPECTION_MERGE_POLICY,
      }
    : createDefaultVersionStamp(updatedAt);

  return {
    ...inspection,
    version,
    conflict: inspection.conflict ?? null,
  };
};

export const markInspectionEdited = (
  inspection: InspectionSession,
  updatedAt = Date.now()
): InspectionSession => {
  const normalized = ensureInspectionSyncState(inspection, updatedAt);
  const version = normalized.version ?? createDefaultVersionStamp(updatedAt);
  return {
    ...normalized,
    version: {
      ...version,
      clientRevision: version.clientRevision + 1,
      updatedAt,
    },
    conflict: null,
  };
};

export const markInspectionSyncSucceeded = (
  inspection: InspectionSession,
  options?: { serverRevision?: string | null; syncedAt?: number }
): InspectionSession => {
  const syncedAt = options?.syncedAt ?? Date.now();
  const normalized = ensureInspectionSyncState(inspection, syncedAt);
  const version = normalized.version ?? createDefaultVersionStamp(syncedAt);
  const serverRevision = options?.serverRevision ?? version.serverRevision ?? version.baseServerRevision;

  return {
    ...normalized,
    version: {
      ...version,
      baseServerRevision: serverRevision ?? version.baseServerRevision,
      serverRevision: serverRevision ?? version.serverRevision,
      updatedAt: syncedAt,
    },
    conflict: null,
  };
};

export const markInspectionConflicted = (
  inspection: InspectionSession,
  conflict: InspectionConflictDetails
): InspectionSession => {
  const normalized = ensureInspectionSyncState(inspection, conflict.detectedAt);
  const version = normalized.version ?? createDefaultVersionStamp(conflict.detectedAt);
  return {
    ...normalized,
    conflict,
    version: {
      ...version,
      serverRevision: conflict.serverRevision ?? version.serverRevision,
      updatedAt: conflict.detectedAt,
    },
  };
};
