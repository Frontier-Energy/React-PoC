import {
  DEFAULT_TENANT_NAME,
  getActiveEnvironment,
  getConfiguredApiBearerToken,
  getEnvironmentConfigById,
  getActiveTenant,
  getConnectivityCheckUrl,
  getFormSchemaUrl,
  getLoginUrl,
  getRegisterUrl,
  getTenantBootstrapUrl,
  getTenantById,
  getTranslationsUrl,
  getUploadInspectionUrl,
  resolveEnvironmentIdFromHostname,
  resolveTenantNameFromHostname,
} from './config';
import { LEGACY_CUSTOMIZATION_STORAGE_KEY, TENANT_PREFERENCE_STORAGE_KEY } from './appPreferences';

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
    localStorage.setItem(TENANT_PREFERENCE_STORAGE_KEY, 'opscentral');
    expect(getActiveTenant().tenantId).toBe('opscentral');
  });

  it('resolves the active environment from governed host mappings', () => {
    expect(resolveEnvironmentIdFromHostname('localhost')).toBe('beta');
    expect(resolveEnvironmentIdFromHostname('qhvac.qcontrol.frontierenergy.com')).toBe('production');
    expect(resolveEnvironmentIdFromHostname('unknown-host')).toBe('beta');
    expect(getEnvironmentConfigById('beta')?.displayName).toBe('Beta');
  });

  it('falls back to default tenant when legacy customization is invalid json', () => {
    localStorage.setItem(LEGACY_CUSTOMIZATION_STORAGE_KEY, '{invalid');
    expect(getActiveTenant().tenantId).toBe(DEFAULT_TENANT_NAME);
  });

  it('builds upload, login, and register urls for active tenant', () => {
    localStorage.setItem(TENANT_PREFERENCE_STORAGE_KEY, 'qhvac');
    expect(getUploadInspectionUrl()).toContain('/inspections');
    expect(getLoginUrl()).toContain('/auth/login');
    expect(getRegisterUrl()).toContain('/auth/register');
    expect(getTenantBootstrapUrl()).toContain('/tenant-config');
    expect(getConnectivityCheckUrl()).toBe(getTenantBootstrapUrl());
  });

  it('uses the Beta API environment in local development', () => {
    vi.stubGlobal('window', {
      location: {
        hostname: 'localhost',
      },
    });

    expect(getActiveEnvironment()?.environmentId).toBe('beta');
    expect(getUploadInspectionUrl()).toContain('apim-qcs-cus-dev-7dbwgp.azure-api.net');
  });

  it('reads the configured API bearer token from the active environment', () => {
    vi.stubGlobal('window', {
      location: {
        hostname: 'localhost',
      },
    });

    expect(getConfiguredApiBearerToken()).toBeNull();
  });

  it('builds bootstrap and content urls for an explicitly requested tenant', () => {
    localStorage.setItem(TENANT_PREFERENCE_STORAGE_KEY, 'opscentral');

    expect(getTenantBootstrapUrl('qhvac')).toContain('/tenant-config?tenantId=qhvac');
    expect(getFormSchemaUrl('hvac', 'qhvac')).toContain('/form-schemas/hvac');
    expect(getTranslationsUrl('en', 'qhvac')).toContain('/translations/en');
  });

  it('falls back to hostname tenant when stored customization tenant is unknown', () => {
    localStorage.setItem(TENANT_PREFERENCE_STORAGE_KEY, 'missing-tenant');
    vi.stubGlobal('window', {
      location: {
        hostname: 'lire.qcontrol.frontierenergy.com',
      },
    });

    expect(getActiveTenant().tenantId).toBe('lire');
  });

  it('falls back to default tenant when window is unavailable', () => {
    vi.stubGlobal('window', undefined);
    expect(getActiveTenant().tenantId).toBe(DEFAULT_TENANT_NAME);
    localStorage.setItem(TENANT_PREFERENCE_STORAGE_KEY, 'qhvac');
    expect(getActiveTenant().tenantId).toBe(DEFAULT_TENANT_NAME);
  });
});
