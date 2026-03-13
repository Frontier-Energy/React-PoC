import { getActiveTenant } from '../config';
import { platform } from '@platform';

const getCacheStorage = () => platform.storage.getLocalStorage();

export const CONTENT_ARTIFACT_CACHE_STORAGE_KEY = 'tenantContentArtifactCache';

export type ContentKind = 'form-schema' | 'translations';

interface CachedContentArtifactRecord {
  tenantId: string;
  kind: ContentKind;
  subject: string;
  schemaVersion: string;
  artifactVersion: string;
  cachedAt: string;
  payload: unknown;
}

const normalizeTenantId = (tenantId?: string) => tenantId?.trim().toLowerCase() || getActiveTenant().tenantId.toLowerCase();
const buildCacheKey = (tenantId: string, kind: ContentKind, subject: string) => `${tenantId}::${kind}::${subject}`;

const readContentArtifactCache = (): Record<string, CachedContentArtifactRecord> => {
  const stored = getCacheStorage()?.getItem(CONTENT_ARTIFACT_CACHE_STORAGE_KEY);
  if (!stored) {
    return {};
  }

  try {
    const parsed = JSON.parse(stored) as Record<string, CachedContentArtifactRecord>;
    return Object.entries(parsed).reduce<Record<string, CachedContentArtifactRecord>>((result, [key, value]) => {
      if (
        value &&
        typeof value === 'object' &&
        typeof value.tenantId === 'string' &&
        (value.kind === 'form-schema' || value.kind === 'translations') &&
        typeof value.subject === 'string' &&
        typeof value.schemaVersion === 'string' &&
        typeof value.artifactVersion === 'string' &&
        typeof value.cachedAt === 'string'
      ) {
        result[key] = value;
      }
      return result;
    }, {});
  } catch {
    return {};
  }
};

const writeContentArtifactCache = (cache: Record<string, CachedContentArtifactRecord>) => {
  getCacheStorage()?.setItem(CONTENT_ARTIFACT_CACHE_STORAGE_KEY, JSON.stringify(cache));
};

export const readCachedArtifact = <T>(
  tenantId: string | undefined,
  kind: ContentKind,
  subject: string,
  normalize: (payload: unknown) => T
): T | null => {
  const normalizedTenantId = normalizeTenantId(tenantId);
  const cache = readContentArtifactCache();
  const record = cache[buildCacheKey(normalizedTenantId, kind, subject)];
  if (!record) {
    return null;
  }

  try {
    return normalize(record.payload);
  } catch {
    return null;
  }
};

export const cacheArtifact = (
  tenantId: string | undefined,
  kind: ContentKind,
  subject: string,
  payload: unknown,
  schemaVersion: string,
  artifactVersion: string
) => {
  const normalizedTenantId = normalizeTenantId(tenantId);
  const cache = readContentArtifactCache();
  cache[buildCacheKey(normalizedTenantId, kind, subject)] = {
    tenantId: normalizedTenantId,
    kind,
    subject,
    schemaVersion,
    artifactVersion,
    cachedAt: new Date().toISOString(),
    payload,
  };
  writeContentArtifactCache(cache);
};

export const clearCachedContentArtifacts = (tenantId?: string) => {
  const normalizedTenantId = normalizeTenantId(tenantId);
  const cache = readContentArtifactCache();
  Object.keys(cache).forEach((key) => {
    if (cache[key]?.tenantId === normalizedTenantId) {
      delete cache[key];
    }
  });
  writeContentArtifactCache(cache);
};

