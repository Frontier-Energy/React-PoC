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
    localStorage.clear();
  });

  it('finds tenant ids case-insensitively', () => {
    expect(getTenantById('QHVAC')?.tenantId).toBe('qhvac');
    expect(getTenantById('missing')).toBeUndefined();
  });

  it('resolves tenant name from expected host shape', () => {
    expect(resolveTenantNameFromHostname('qhvac.qcontrol.frontierenergy.com')).toBe('qhvac');
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
    expect(getUploadInspectionUrl()).toContain('/QHVAC/ReceiveInspection');
    expect(getLoginUrl()).toContain('/QHVAC/login');
    expect(getRegisterUrl()).toContain('/QHVAC/Register');
    expect(getTenantBootstrapUrl()).toContain('/QHVAC/tenant-config');
  });
});
