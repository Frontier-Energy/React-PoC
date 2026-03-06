import {
  CUSTOMIZATION_STORAGE_KEY,
  DEFAULT_TENANT_NAME,
  getActiveTenant,
  getLoginUrl,
  getRegisterUrl,
  getTenantBootstrapUrl,
  getTenantById,
  getUploadInspectionUrl,
  resolveTenantNameFromHostname,
} from './config';

describe('config', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it('finds tenant ids case-insensitively', () => {
    expect(getTenantById('QHVAC')?.tenantId).toBe('qhvac');
    expect(getTenantById('missing')).toBeUndefined();
  });

  it('resolves tenant name from expected host shape', () => {
    expect(resolveTenantNameFromHostname('qhvac.qcontrol.frontierenergy.com')).toBe('qhvac');
    expect(resolveTenantNameFromHostname('lire.qcontrol.frontierenergy.com')).toBe('lire');
    expect(resolveTenantNameFromHostname('unknown.qcontrol.frontierenergy.com')).toBe(DEFAULT_TENANT_NAME);
    expect(resolveTenantNameFromHostname('localhost')).toBe(DEFAULT_TENANT_NAME);
    expect(resolveTenantNameFromHostname('')).toBe(DEFAULT_TENANT_NAME);
  });

  it('uses stored tenant from customization when valid', () => {
    localStorage.setItem(CUSTOMIZATION_STORAGE_KEY, JSON.stringify({ tenantId: 'opscentral' }));
    expect(getActiveTenant().tenantId).toBe('opscentral');
  });

  it('falls back to default tenant when customization is invalid json', () => {
    localStorage.setItem(CUSTOMIZATION_STORAGE_KEY, '{invalid');
    expect(getActiveTenant().tenantId).toBe(DEFAULT_TENANT_NAME);
  });

  it('builds upload, login, and register urls for active tenant', () => {
    localStorage.setItem(CUSTOMIZATION_STORAGE_KEY, JSON.stringify({ tenantId: 'qhvac' }));
    expect(getUploadInspectionUrl()).toContain('/inspections');
    expect(getLoginUrl()).toContain('/auth/login');
    expect(getRegisterUrl()).toContain('/auth/register');
    expect(getTenantBootstrapUrl()).toContain('/tenant-config');
  });

  it('falls back to default tenant when window is unavailable', () => {
    vi.stubGlobal('window', undefined);
    expect(getActiveTenant().tenantId).toBe(DEFAULT_TENANT_NAME);
    localStorage.setItem(CUSTOMIZATION_STORAGE_KEY, JSON.stringify({ tenantId: 'qhvac' }));
    expect(getActiveTenant().tenantId).toBe(DEFAULT_TENANT_NAME);
  });
});
