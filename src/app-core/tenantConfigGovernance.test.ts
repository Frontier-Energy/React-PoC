import {
  clearTenantConfigGovernanceState,
  getGovernedTenantBootstrapConfig,
  getTenantConfigGovernanceSnapshot,
  promoteTenantConfigArtifact,
  TENANT_CONFIG_GOVERNANCE_STORAGE_KEY,
  rollbackTenantConfigArtifact,
  TENANT_CONFIG_SCHEMA_VERSION,
} from './tenantConfigGovernance';
import { FormType } from './types';

describe('tenantConfigGovernance', () => {
  beforeEach(() => {
    localStorage.clear();
    clearTenantConfigGovernanceState();
  });

  it('seeds governed tenant config from platform defaults', () => {
    const snapshot = getTenantConfigGovernanceSnapshot('qhvac', 'beta');

    expect(snapshot.schemaVersion).toBe(TENANT_CONFIG_SCHEMA_VERSION);
    expect(snapshot.promotedVersion).toBe('1.0.0');
    expect(snapshot.promotedArtifact.reviewStatus).toBe('approved');
    expect(snapshot.promotedArtifact.config.enabledForms).toEqual([
      FormType.Electrical,
      FormType.ElectricalSF,
      FormType.HVAC,
    ]);
    expect(snapshot.auditEntries[0]?.action).toBe('seeded');
  });

  it('promotes a new governed tenant config version and updates the environment pointer', () => {
    const snapshot = promoteTenantConfigArtifact({
      tenantId: 'qhvac',
      environmentId: 'beta',
      actorId: 'user-1',
      config: {
        ...getGovernedTenantBootstrapConfig('qhvac', 'beta'),
        loginRequired: false,
        showInspectionStatsButton: true,
      },
    });

    expect(snapshot.promotedVersion).toBe('1.0.1');
    expect(snapshot.promotedArtifact.config.loginRequired).toBe(false);
    expect(snapshot.promotedArtifact.config.showInspectionStatsButton).toBe(true);
    expect(snapshot.auditEntries[0]).toEqual(
      expect.objectContaining({
        action: 'promoted',
        actorId: 'user-1',
        environmentId: 'beta',
        fromVersion: '1.0.0',
        toVersion: '1.0.1',
      })
    );
  });

  it('rolls back to the previous promoted version for an environment', () => {
    promoteTenantConfigArtifact({
      tenantId: 'qhvac',
      environmentId: 'beta',
      actorId: 'user-1',
      config: {
        ...getGovernedTenantBootstrapConfig('qhvac', 'beta'),
        loginRequired: false,
      },
    });

    const snapshot = rollbackTenantConfigArtifact({
      tenantId: 'qhvac',
      environmentId: 'beta',
      actorId: 'user-2',
    });
    const rollbackAuditEntry = snapshot.auditEntries.find((entry) => entry.action === 'rolled-back');

    expect(snapshot.promotedVersion).toBe('1.0.0');
    expect(snapshot.promotedArtifact.config.loginRequired).toBe(true);
    expect(rollbackAuditEntry).toEqual(
      expect.objectContaining({
        action: 'rolled-back',
        actorId: 'user-2',
        fromVersion: '1.0.1',
        toVersion: '1.0.0',
      })
    );
  });

  it('throws when no rollback target exists', () => {
    expect(() =>
      rollbackTenantConfigArtifact({
        tenantId: 'qhvac',
        environmentId: 'beta',
        actorId: 'user-1',
      })
    ).toThrow('No rollback target is available');
  });

  it('falls back to seeded state when persisted governance json is malformed', () => {
    localStorage.setItem(TENANT_CONFIG_GOVERNANCE_STORAGE_KEY, '{bad-json');

    const snapshot = getTenantConfigGovernanceSnapshot('lire', 'beta');

    expect(snapshot.promotedVersion).toBe('1.0.0');
    expect(snapshot.promotedArtifact.config.loginRequired).toBe(false);
  });

  it('falls back to seeded state when persisted governance shape is invalid', () => {
    localStorage.setItem(
      TENANT_CONFIG_GOVERNANCE_STORAGE_KEY,
      JSON.stringify({
        schemaVersion: 123,
        tenants: null,
      })
    );

    const snapshot = getTenantConfigGovernanceSnapshot('qhvac', 'beta');

    expect(snapshot.schemaVersion).toBe(TENANT_CONFIG_SCHEMA_VERSION);
    expect(snapshot.promotedVersion).toBe('1.0.0');
  });

  it('resolves the active environment from hostname when no environment id is supplied', () => {
    const snapshot = getTenantConfigGovernanceSnapshot('qhvac');

    expect(snapshot.environmentId).toBe('beta');
  });

  it('falls back to the default environment when window is unavailable', () => {
    vi.stubGlobal('window', undefined);

    const snapshot = getTenantConfigGovernanceSnapshot('qhvac');

    expect(snapshot.environmentId).toBe('beta');
  });

  it('throws for unknown tenants', () => {
    expect(() => getTenantConfigGovernanceSnapshot('missing-tenant', 'beta')).toThrow('Unknown tenant "missing-tenant"');
  });

  it('supports promotion into a custom environment id that has no previous history', () => {
    const snapshot = promoteTenantConfigArtifact({
      tenantId: 'opscentral',
      environmentId: 'sandbox',
      actorId: 'user-9',
      config: {
        ...getGovernedTenantBootstrapConfig('opscentral', 'beta'),
        showInspectionStatsButton: true,
      },
      note: 'Promoted to sandbox for operator validation.',
    });
    const promotedAuditEntry = snapshot.auditEntries.find((entry) => entry.action === 'promoted' && entry.environmentId === 'sandbox');

    expect(snapshot.environmentId).toBe('sandbox');
    expect(snapshot.promotedVersion).toBe('1.0.1');
    expect(snapshot.promotionHistory).toEqual(['1.0.1']);
    expect(promotedAuditEntry).toEqual(
      expect.objectContaining({
        actorId: 'user-9',
        fromVersion: undefined,
        toVersion: '1.0.1',
        note: 'Promoted to sandbox for operator validation.',
      })
    );
  });

  it('falls back to the first stored artifact when an environment pointer is missing', () => {
    localStorage.setItem(
      TENANT_CONFIG_GOVERNANCE_STORAGE_KEY,
      JSON.stringify({
        schemaVersion: TENANT_CONFIG_SCHEMA_VERSION,
        tenants: {
          qhvac: {
            artifactsByVersion: {
              '2.0.0': {
                artifactId: 'qhvac:2.0.0',
                tenantId: 'qhvac',
                version: '2.0.0',
                schemaVersion: TENANT_CONFIG_SCHEMA_VERSION,
                config: {
                  ...getGovernedTenantBootstrapConfig('qhvac', 'beta'),
                  displayName: 'Recovered QHVAC',
                },
                reviewStatus: 'approved',
                reviewedBy: 'ops-user',
                reviewedAt: '2026-03-08T00:00:00.000Z',
                createdBy: 'ops-user',
                createdAt: '2026-03-08T00:00:00.000Z',
              },
            },
            promotedVersionByEnvironment: {},
            promotionHistoryByEnvironment: {},
            auditEntries: [],
          },
        },
      })
    );

    const snapshot = getTenantConfigGovernanceSnapshot('qhvac', 'sandbox');

    expect(snapshot.promotedArtifact.version).toBe('2.0.0');
    expect(snapshot.promotedArtifact.config.displayName).toBe('Recovered QHVAC');
    expect(snapshot.promotionHistory).toEqual(['1.0.0']);
  });

  it('throws when a persisted tenant state has no artifacts to recover', () => {
    localStorage.setItem(
      TENANT_CONFIG_GOVERNANCE_STORAGE_KEY,
      JSON.stringify({
        schemaVersion: TENANT_CONFIG_SCHEMA_VERSION,
        tenants: {
          qhvac: {
            artifactsByVersion: {},
            promotedVersionByEnvironment: {
              beta: '1.0.0',
            },
            promotionHistoryByEnvironment: {},
            auditEntries: [],
          },
        },
      })
    );

    expect(() => getTenantConfigGovernanceSnapshot('qhvac', 'beta')).toThrow(
      'No governed tenant config artifact found for tenant "qhvac"'
    );
  });

  it('returns cloned governed config arrays instead of shared references', () => {
    const config = getGovernedTenantBootstrapConfig('qhvac', 'beta');

    config.enabledForms.push(FormType.SafetyChecklist);

    expect(getGovernedTenantBootstrapConfig('qhvac', 'beta').enabledForms).toEqual([
      FormType.Electrical,
      FormType.ElectricalSF,
      FormType.HVAC,
    ]);
  });
});
