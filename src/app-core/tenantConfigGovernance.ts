import { DEFAULT_ENVIRONMENT_ID, GOVERNED_ENVIRONMENTS, GOVERNED_TENANTS, type TenantDefinition } from './governedConfig';
import { platform } from '@platform';
import type { TenantBootstrapConfig } from './tenantBootstrap';

export const TENANT_CONFIG_GOVERNANCE_STORAGE_KEY = 'tenantConfigGovernanceState';
export const TENANT_CONFIG_SCHEMA_VERSION = '2026-03-01';
const GOVERNANCE_SEED_TIMESTAMP = '2026-03-01T00:00:00.000Z';

export interface TenantConfigArtifactRecord {
  artifactId: string;
  tenantId: string;
  version: string;
  schemaVersion: string;
  config: TenantBootstrapConfig;
  reviewStatus: 'approved';
  reviewedBy: string;
  reviewedAt: string;
  createdBy: string;
  createdAt: string;
}

export interface TenantConfigAuditEntry {
  auditId: string;
  tenantId: string;
  action: 'seeded' | 'promoted' | 'rolled-back';
  actorId: string;
  occurredAt: string;
  environmentId: string;
  fromVersion?: string;
  toVersion?: string;
  note: string;
}

interface TenantGovernanceStateRecord {
  artifactsByVersion: Record<string, TenantConfigArtifactRecord>;
  promotedVersionByEnvironment: Record<string, string>;
  promotionHistoryByEnvironment: Record<string, string[]>;
  auditEntries: TenantConfigAuditEntry[];
}

interface StoredTenantConfigGovernanceState {
  schemaVersion: string;
  tenants: Record<string, TenantGovernanceStateRecord>;
}

export interface TenantConfigGovernanceSnapshot {
  tenantId: string;
  environmentId: string;
  schemaVersion: string;
  promotedArtifact: TenantConfigArtifactRecord;
  promotedVersion: string;
  availableVersions: string[];
  auditEntries: TenantConfigAuditEntry[];
  promotionHistory: string[];
}

const normalizeTenantId = (tenantId: string) => tenantId.trim().toLowerCase();
const normalizeEnvironmentId = (environmentId: string) => environmentId.trim().toLowerCase();

const getActiveEnvironmentId = () => {
  const hostname = platform.runtime.getLocation()?.hostname ?? null;
  const normalizedHostname = hostname?.trim().toLowerCase() ?? '';
  if (!normalizedHostname) {
    return DEFAULT_ENVIRONMENT_ID;
  }

  const matchedEnvironment = GOVERNED_ENVIRONMENTS.find((environment) =>
    environment.hostnames.includes(normalizedHostname)
    || environment.hostnameSuffixes.some((suffix) => normalizedHostname.endsWith(suffix))
  );
  return matchedEnvironment?.environmentId ?? DEFAULT_ENVIRONMENT_ID;
};

const compareVersions = (left: string, right: string) => {
  const leftParts = left.split('.').map((value) => Number.parseInt(value, 10) || 0);
  const rightParts = right.split('.').map((value) => Number.parseInt(value, 10) || 0);
  const length = Math.max(leftParts.length, rightParts.length);

  for (let index = 0; index < length; index += 1) {
    const delta = (leftParts[index] ?? 0) - (rightParts[index] ?? 0);
    if (delta !== 0) {
      return delta;
    }
  }

  return 0;
};

const getNextVersion = (versions: string[]) => {
  const sortedVersions = [...versions].sort(compareVersions);
  const latest = sortedVersions[sortedVersions.length - 1] ?? '1.0.0';
  const [major, minor, patch] = latest.split('.').map((value: string) => Number.parseInt(value, 10) || 0);
  return `${major}.${minor}.${patch + 1}`;
};

const createDefaultConfigFromTenant = (tenant: TenantDefinition): TenantBootstrapConfig => ({
  tenantId: tenant.tenantId,
  displayName: tenant.displayName,
  theme: tenant.uiDefaults.theme,
  font: tenant.uiDefaults.font,
  showLeftFlyout: tenant.uiDefaults.showLeftFlyout,
  showRightFlyout: tenant.uiDefaults.showRightFlyout,
  showInspectionStatsButton: tenant.uiDefaults.showInspectionStatsButton,
  enabledForms: tenant.bootstrapDefaults.enabledForms,
  loginRequired: tenant.bootstrapDefaults.loginRequired,
});

const buildSeedArtifact = (tenant: TenantDefinition): TenantConfigArtifactRecord => ({
  artifactId: `${tenant.tenantId}:1.0.0`,
  tenantId: tenant.tenantId,
  version: '1.0.0',
  schemaVersion: TENANT_CONFIG_SCHEMA_VERSION,
  config: createDefaultConfigFromTenant(tenant),
  reviewStatus: 'approved',
  reviewedBy: 'platform-seed',
  reviewedAt: GOVERNANCE_SEED_TIMESTAMP,
  createdBy: 'platform-seed',
  createdAt: GOVERNANCE_SEED_TIMESTAMP,
});

const createSeededGovernanceState = (): StoredTenantConfigGovernanceState => {
  const tenants = GOVERNED_ENVIRONMENTS.length > 0
    ? Object.fromEntries(
        Array.from(new Set(GOVERNED_ENVIRONMENTS.map((environment) => environment.environmentId))).map((value) => [
          normalizeEnvironmentId(value),
          '1.0.0',
        ])
      )
    : { [normalizeEnvironmentId(DEFAULT_ENVIRONMENT_ID)]: '1.0.0' };

  return {
    schemaVersion: TENANT_CONFIG_SCHEMA_VERSION,
    tenants: Object.fromEntries(
      GOVERNED_TENANTS
        .map((tenant) => {
          const artifact = buildSeedArtifact(tenant);
          const promotionHistoryByEnvironment = Object.fromEntries(
            Object.keys(tenants).map((environmentId) => [environmentId, ['1.0.0']])
          );

          return [
            normalizeTenantId(tenant.tenantId),
            {
              artifactsByVersion: {
                '1.0.0': artifact,
              },
              promotedVersionByEnvironment: { ...tenants },
              promotionHistoryByEnvironment,
              auditEntries: [
                {
                  auditId: `${tenant.tenantId}:seeded:1`,
                  tenantId: tenant.tenantId,
                  action: 'seeded',
                  actorId: 'platform-seed',
                  occurredAt: GOVERNANCE_SEED_TIMESTAMP,
                  environmentId: normalizeEnvironmentId(DEFAULT_ENVIRONMENT_ID),
                  toVersion: '1.0.0',
                  note: 'Seeded governed tenant config from platform defaults.',
                },
              ],
            } satisfies TenantGovernanceStateRecord,
          ];
        })
    ),
  };
};

const readGovernanceState = (): StoredTenantConfigGovernanceState => {
  const seededState = createSeededGovernanceState();
  const stored = getGovernanceStorage()?.getItem(TENANT_CONFIG_GOVERNANCE_STORAGE_KEY);
  if (!stored) {
    return seededState;
  }

  try {
    const parsed = JSON.parse(stored) as StoredTenantConfigGovernanceState;
    if (!parsed || typeof parsed !== 'object' || typeof parsed.tenants !== 'object') {
      return seededState;
    }

    return {
      schemaVersion: typeof parsed.schemaVersion === 'string' ? parsed.schemaVersion : seededState.schemaVersion,
      tenants: {
        ...seededState.tenants,
        ...parsed.tenants,
      },
    };
  } catch {
    return seededState;
  }
};

const writeGovernanceState = (state: StoredTenantConfigGovernanceState) => {
  getGovernanceStorage()?.setItem(TENANT_CONFIG_GOVERNANCE_STORAGE_KEY, JSON.stringify(state));
};

const getTenantState = (state: StoredTenantConfigGovernanceState, tenantId: string): TenantGovernanceStateRecord => {
  const normalizedTenantId = normalizeTenantId(tenantId);
  const existing = state.tenants[normalizedTenantId];
  if (existing) {
    return existing;
  }

  const tenant = GOVERNED_TENANTS.find((candidate) => candidate.tenantId.toLowerCase() === normalizedTenantId);
  if (!tenant) {
    throw new Error(`Unknown tenant "${tenantId}"`);
  }

  const artifact = buildSeedArtifact(tenant);
  const environmentIds = GOVERNED_ENVIRONMENTS.map((environment) => normalizeEnvironmentId(environment.environmentId));
  const promotedVersionByEnvironment = Object.fromEntries(
    (environmentIds.length > 0 ? environmentIds : [normalizeEnvironmentId(DEFAULT_ENVIRONMENT_ID)]).map((environmentId) => [
      environmentId,
      '1.0.0',
    ])
  );
  const tenantState: TenantGovernanceStateRecord = {
    artifactsByVersion: {
      '1.0.0': artifact,
    },
    promotedVersionByEnvironment,
    promotionHistoryByEnvironment: Object.fromEntries(
      Object.keys(promotedVersionByEnvironment).map((environmentId) => [environmentId, ['1.0.0']])
    ),
    auditEntries: [
      {
        auditId: `${tenant.tenantId}:seeded:1`,
        tenantId: tenant.tenantId,
        action: 'seeded',
        actorId: 'platform-seed',
        occurredAt: GOVERNANCE_SEED_TIMESTAMP,
        environmentId: normalizeEnvironmentId(DEFAULT_ENVIRONMENT_ID),
        toVersion: '1.0.0',
        note: 'Seeded governed tenant config from platform defaults.',
      },
    ],
  };
  state.tenants[normalizedTenantId] = tenantState;
  return tenantState;
};

const cloneConfig = (config: TenantBootstrapConfig): TenantBootstrapConfig => ({
  ...config,
  enabledForms: [...config.enabledForms],
});

const toSnapshot = (
  tenantId: string,
  environmentId: string,
  state: TenantGovernanceStateRecord
): TenantConfigGovernanceSnapshot => {
  const normalizedEnvironmentId = normalizeEnvironmentId(environmentId);
  const promotedVersion = state.promotedVersionByEnvironment[normalizedEnvironmentId] ?? '1.0.0';
  const promotedArtifact = state.artifactsByVersion[promotedVersion] ?? Object.values(state.artifactsByVersion)[0];
  if (!promotedArtifact) {
    throw new Error(`No governed tenant config artifact found for tenant "${tenantId}"`);
  }

  return {
    tenantId: promotedArtifact.tenantId,
    environmentId: normalizedEnvironmentId,
    schemaVersion: TENANT_CONFIG_SCHEMA_VERSION,
    promotedArtifact: {
      ...promotedArtifact,
      config: cloneConfig(promotedArtifact.config),
    },
    promotedVersion,
    availableVersions: Object.keys(state.artifactsByVersion).sort(compareVersions),
    auditEntries: [...state.auditEntries].sort((left, right) => right.occurredAt.localeCompare(left.occurredAt)),
    promotionHistory: [...(state.promotionHistoryByEnvironment[normalizedEnvironmentId] ?? [promotedVersion])],
  };
};

export const getTenantConfigGovernanceSnapshot = (
  tenantId: string,
  environmentId = getActiveEnvironmentId()
): TenantConfigGovernanceSnapshot => {
  const state = readGovernanceState();
  const tenantState = getTenantState(state, tenantId);
  return toSnapshot(tenantId, environmentId, tenantState);
};

export const getGovernedTenantBootstrapConfig = (
  tenantId: string,
  environmentId = getActiveEnvironmentId()
): TenantBootstrapConfig => cloneConfig(getTenantConfigGovernanceSnapshot(tenantId, environmentId).promotedArtifact.config);

export const promoteTenantConfigArtifact = ({
  tenantId,
  environmentId = getActiveEnvironmentId(),
  actorId,
  config,
  note,
}: {
  tenantId: string;
  environmentId?: string;
  actorId: string;
  config: TenantBootstrapConfig;
  note?: string;
}): TenantConfigGovernanceSnapshot => {
  const state = readGovernanceState();
  const tenantState = getTenantState(state, tenantId);
  const normalizedEnvironmentId = normalizeEnvironmentId(environmentId);
  const nextVersion = getNextVersion(Object.keys(tenantState.artifactsByVersion));
  const occurredAt = new Date().toISOString();
  const previousVersion = tenantState.promotedVersionByEnvironment[normalizedEnvironmentId];

  tenantState.artifactsByVersion[nextVersion] = {
    artifactId: `${tenantId}:${nextVersion}`,
    tenantId,
    version: nextVersion,
    schemaVersion: TENANT_CONFIG_SCHEMA_VERSION,
    config: cloneConfig(config),
    reviewStatus: 'approved',
    reviewedBy: actorId,
    reviewedAt: occurredAt,
    createdBy: actorId,
    createdAt: occurredAt,
  };
  tenantState.promotedVersionByEnvironment[normalizedEnvironmentId] = nextVersion;
  const previousHistory = tenantState.promotionHistoryByEnvironment[normalizedEnvironmentId] ?? [];
  tenantState.promotionHistoryByEnvironment[normalizedEnvironmentId] = [
    ...previousHistory,
    nextVersion,
  ];
  tenantState.auditEntries.push({
    auditId: `${tenantId}:promoted:${tenantState.auditEntries.length + 1}`,
    tenantId,
    action: 'promoted',
    actorId,
    occurredAt,
    environmentId: normalizedEnvironmentId,
    fromVersion: previousVersion,
    toVersion: nextVersion,
    note: note ?? `Promoted governed tenant config artifact ${nextVersion}.`,
  });

  writeGovernanceState(state);
  return toSnapshot(tenantId, normalizedEnvironmentId, tenantState);
};

export const rollbackTenantConfigArtifact = ({
  tenantId,
  environmentId = getActiveEnvironmentId(),
  actorId,
  note,
}: {
  tenantId: string;
  environmentId?: string;
  actorId: string;
  note?: string;
}): TenantConfigGovernanceSnapshot => {
  const state = readGovernanceState();
  const tenantState = getTenantState(state, tenantId);
  const normalizedEnvironmentId = normalizeEnvironmentId(environmentId);
  const history = [...(tenantState.promotionHistoryByEnvironment[normalizedEnvironmentId] ?? [])];

  if (history.length < 2) {
    throw new Error(`No rollback target is available for tenant "${tenantId}" in environment "${normalizedEnvironmentId}"`);
  }

  const fromVersion = history[history.length - 1] as string;
  const toVersion = history[history.length - 2] as string;
  tenantState.promotedVersionByEnvironment[normalizedEnvironmentId] = toVersion;
  tenantState.promotionHistoryByEnvironment[normalizedEnvironmentId] = history.slice(0, -1);
  tenantState.auditEntries.push({
    auditId: `${tenantId}:rolled-back:${tenantState.auditEntries.length + 1}`,
    tenantId,
    action: 'rolled-back',
    actorId,
    occurredAt: new Date().toISOString(),
    environmentId: normalizedEnvironmentId,
    fromVersion,
    toVersion,
    note: note ?? `Rolled back governed tenant config to ${toVersion}.`,
  });

  writeGovernanceState(state);
  return toSnapshot(tenantId, normalizedEnvironmentId, tenantState);
};

export const clearTenantConfigGovernanceState = () => {
  getGovernanceStorage()?.removeItem(TENANT_CONFIG_GOVERNANCE_STORAGE_KEY);
};
const getGovernanceStorage = () => platform.storage.getLocalStorage();

