import { FormType } from './types';
import { LEGACY_CUSTOMIZATION_STORAGE_KEY, TENANT_PREFERENCE_STORAGE_KEY } from './appPreferences';
import {
  cacheTenantBootstrapConfig,
  clearCachedTenantBootstrapConfig,
  DEFAULT_TENANT_BOOTSTRAP_TIMEOUT_MS,
  fetchTenantBootstrapConfig,
  getDefaultTenantBootstrapConfig,
  getDefaultTenantBootstrapConfigForTenant,
  mapTenantBootstrapResponse,
  persistSelectedTenant,
  readCachedTenantBootstrapConfig,
  TENANT_BOOTSTRAP_CACHE_STORAGE_KEY,
} from './tenantBootstrap';

describe('tenantBootstrap', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it('returns defaults from active tenant with login required', () => {
    const defaults = getDefaultTenantBootstrapConfig();

    expect(defaults.tenantId).toBeTruthy();
    expect(defaults.enabledForms).toEqual(Object.values(FormType));
    expect(defaults.loginRequired).toBe(true);
    expect(defaults.showLeftFlyout).toBe(true);
    expect(defaults.showRightFlyout).toBe(true);
    expect(defaults.showInspectionStatsButton).toBe(false);
  });

  it('defaults login to optional and hides left flyout for lire tenant', () => {
    localStorage.setItem(TENANT_PREFERENCE_STORAGE_KEY, 'lire');

    const defaults = getDefaultTenantBootstrapConfig();

    expect(defaults.tenantId).toBe('lire');
    expect(defaults.enabledForms).toEqual([]);
    expect(defaults.loginRequired).toBe(false);
    expect(defaults.showLeftFlyout).toBe(false);
    expect(defaults.showRightFlyout).toBe(true);
    expect(defaults.showInspectionStatsButton).toBe(false);
  });

  it('returns tenant-specific default forms for known tenants', () => {
    expect(getDefaultTenantBootstrapConfigForTenant('qhvac').enabledForms).toEqual([
      FormType.Electrical,
      FormType.ElectricalSF,
      FormType.HVAC,
    ]);
    expect(getDefaultTenantBootstrapConfigForTenant('opscentral').enabledForms).toEqual([
      FormType.SafetyChecklist,
    ]);
    expect(getDefaultTenantBootstrapConfigForTenant('lire').enabledForms).toEqual([]);
    expect(getDefaultTenantBootstrapConfigForTenant('frontierDemo').enabledForms).toEqual(
      Object.values(FormType)
    );
  });

  it('maps upstream payload fields into normalized tenant config', () => {
    const defaults = getDefaultTenantBootstrapConfig();
    const config = mapTenantBootstrapResponse(
      {
        tenantId: 'qhvac',
        enabledForms: [FormType.HVAC, 'unknown'],
        uiDefaults: {
          theme: 'harbor',
          font: 'Tahoma',
        },
        requiresLogin: false,
      },
      defaults
    );

    expect(config.tenantId).toBe('qhvac');
    expect(config.enabledForms).toEqual([FormType.HVAC]);
    expect(config.theme).toBe('harbor');
    expect(config.font).toBe('Tahoma');
    expect(config.loginRequired).toBe(false);
    expect(config.showLeftFlyout).toBe(true);
    expect(config.showRightFlyout).toBe(true);
    expect(config.showInspectionStatsButton).toBe(false);
  });

  it('uses defaults/fallbacks for invalid mapped fields', () => {
    const defaults = getDefaultTenantBootstrapConfig();
    const config = mapTenantBootstrapResponse(
      {
        tenantId: 'unknown-tenant',
        displayName: '   ',
        uiDefaults: {
          theme: '   ',
          font: '   ',
          language: 'fr',
        },
        enabledForms: [],
      },
      {
        ...defaults,
        language: 'en',
      }
    );

    expect(config.tenantId).toBe(defaults.tenantId);
    expect(config.displayName).toBe(defaults.displayName);
    expect(config.theme).toBe(defaults.theme);
    expect(config.font).toBe(defaults.font);
    expect(config.language).toBe('en');
    expect(config.enabledForms).toEqual(defaults.enabledForms);
    expect(config.loginRequired).toBe(defaults.loginRequired);
    expect(config.showLeftFlyout).toBe(defaults.showLeftFlyout);
    expect(config.showRightFlyout).toBe(defaults.showRightFlyout);
    expect(config.showInspectionStatsButton).toBe(defaults.showInspectionStatsButton);
  });

  it('prefers loginRequired over requiresLogin and maps language/formTypes when valid', () => {
    const defaults = getDefaultTenantBootstrapConfig();
    const config = mapTenantBootstrapResponse(
      {
        tenantId: defaults.tenantId,
        formTypes: [FormType.Electrical],
        loginRequired: true,
        requiresLogin: false,
        uiDefaults: {
          language: 'es',
        },
      },
      defaults
    );

    expect(config.enabledForms).toEqual([FormType.Electrical]);
    expect(config.loginRequired).toBe(true);
    expect(config.language).toBe('es');
    expect(config.showLeftFlyout).toBe(defaults.showLeftFlyout);
    expect(config.showRightFlyout).toBe(defaults.showRightFlyout);
    expect(config.showInspectionStatsButton).toBe(defaults.showInspectionStatsButton);
  });

  it('uses requiresLogin when loginRequired is not provided', () => {
    const defaults = getDefaultTenantBootstrapConfig();
    const config = mapTenantBootstrapResponse(
      {
        requiresLogin: false,
      },
      defaults
    );

    expect(config.loginRequired).toBe(false);
  });

  it('maps flyout fields when provided by upstream payload', () => {
    const defaults = getDefaultTenantBootstrapConfig();
    const config = mapTenantBootstrapResponse(
      {
        includeLeftFlyout: false,
        includeRightFlyout: true,
        includeInspectionStatsButton: true,
      },
      defaults
    );

    expect(config.showLeftFlyout).toBe(false);
    expect(config.showRightFlyout).toBe(true);
    expect(config.showInspectionStatsButton).toBe(true);
  });

  it('fetches tenant bootstrap config from upstream service', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        tenantId: 'opscentral',
        formTypes: [FormType.SafetyChecklist],
        loginRequired: true,
      }),
    } as Response);

    const { config, governance } = await fetchTenantBootstrapConfig();

    expect(config.tenantId).toBe('opscentral');
    expect(config.enabledForms).toEqual([FormType.SafetyChecklist]);
    expect(config.loginRequired).toBe(true);
    expect(config.showLeftFlyout).toBe(true);
    expect(config.showRightFlyout).toBe(true);
    expect(config.showInspectionStatsButton).toBe(false);
    expect(governance.promotedVersion).toBeTruthy();
  });

  it('requests bootstrap for the explicitly selected tenant during tenant switching', async () => {
    localStorage.setItem(TENANT_PREFERENCE_STORAGE_KEY, 'opscentral');
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        tenantId: 'qhvac',
        formTypes: [FormType.HVAC],
      }),
    } as Response);

    const { config } = await fetchTenantBootstrapConfig('qhvac');

    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining('/tenant-config?tenantId=qhvac'),
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    );
    expect(config.tenantId).toBe('qhvac');
    expect(config.enabledForms).toEqual([FormType.HVAC]);
  });

  it('throws when upstream bootstrap request fails', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: false,
      status: 500,
    } as Response);

    await expect(fetchTenantBootstrapConfig()).rejects.toThrow('Tenant bootstrap request failed with status 500');
  });

  it('caches resolved bootstrap configs by tenant', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        tenantId: 'opscentral',
        formTypes: [FormType.SafetyChecklist],
      }),
    } as Response);

    const { config } = await fetchTenantBootstrapConfig();
    const cached = readCachedTenantBootstrapConfig(config.tenantId);

    expect(cached?.config).toEqual(config);
    expect(cached?.savedAt).toBeTruthy();
  });

  it('reads and clears cached bootstrap config safely', () => {
    const defaults = getDefaultTenantBootstrapConfigForTenant('qhvac');
    cacheTenantBootstrapConfig(defaults, '2026-03-07T10:00:00.000Z');

    expect(readCachedTenantBootstrapConfig('qhvac')).toEqual({
      savedAt: '2026-03-07T10:00:00.000Z',
      config: defaults,
    });

    clearCachedTenantBootstrapConfig('qhvac');

    expect(readCachedTenantBootstrapConfig('qhvac')).toBeNull();
  });

  it('ignores malformed cache payloads', () => {
    localStorage.setItem(TENANT_BOOTSTRAP_CACHE_STORAGE_KEY, '{not-json');

    expect(readCachedTenantBootstrapConfig()).toBeNull();
  });

  it('throws a timeout error when bootstrap exceeds the timeout window', async () => {
    vi.useFakeTimers();
    vi.spyOn(global, 'fetch').mockImplementation(
      () =>
        new Promise<Response>((_, reject) => {
          const abortError = new Error('aborted');
          abortError.name = 'AbortError';
          const timeoutId = window.setTimeout(() => reject(abortError), DEFAULT_TENANT_BOOTSTRAP_TIMEOUT_MS);
          void timeoutId;
        })
    );

    try {
      const request = fetchTenantBootstrapConfig().catch((error: unknown) => error);
      await vi.advanceTimersByTimeAsync(DEFAULT_TENANT_BOOTSTRAP_TIMEOUT_MS);

      const error = await request;
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toBe(
        `Tenant bootstrap request timed out after ${DEFAULT_TENANT_BOOTSTRAP_TIMEOUT_MS}ms`
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it('persists only the selected tenant preference', () => {
    persistSelectedTenant('qhvac');

    expect(localStorage.getItem(TENANT_PREFERENCE_STORAGE_KEY)).toBe('qhvac');
  });

  it('reads tenant defaults from legacy customization for backwards compatibility', () => {
    localStorage.setItem(LEGACY_CUSTOMIZATION_STORAGE_KEY, JSON.stringify({ tenantId: 'lire' }));

    expect(getDefaultTenantBootstrapConfig().tenantId).toBe('lire');
    expect(localStorage.getItem(TENANT_PREFERENCE_STORAGE_KEY)).toBe('lire');
  });

  it('falls back to defaults when both requested and default tenant ids are unknown', () => {
    const config = mapTenantBootstrapResponse(
      {
        tenantId: 'missing-tenant',
        displayName: 'Custom Name',
        uiDefaults: {
          theme: 'custom-theme',
          font: 'custom-font',
        },
      },
      {
        tenantId: 'also-missing',
        displayName: 'Default Name',
        theme: 'default-theme',
        font: 'default-font',
        enabledForms: [FormType.HVAC],
        loginRequired: true,
        showLeftFlyout: true,
        showRightFlyout: true,
        showInspectionStatsButton: false,
      }
    );

    expect(config.tenantId).toBe('also-missing');
    expect(config.displayName).toBe('Custom Name');
    expect(config.theme).toBe('custom-theme');
    expect(config.font).toBe('custom-font');
  });

  it('overwrites tenant selection when persisting a new one', () => {
    localStorage.setItem(TENANT_PREFERENCE_STORAGE_KEY, 'frontierDemo');

    persistSelectedTenant('qhvac');

    expect(localStorage.getItem(TENANT_PREFERENCE_STORAGE_KEY)).toBe('qhvac');
  });

  it('falls back to tenant catalog display/theme/font when payload values are blank', () => {
    const defaults = getDefaultTenantBootstrapConfig();
    const config = mapTenantBootstrapResponse(
      {
        tenantId: 'qhvac',
        displayName: '   ',
        uiDefaults: {
          theme: '   ',
          font: '   ',
        },
      },
      defaults
    );

    expect(config.displayName).toBe('QHVAC');
    expect(config.theme).toBe('harbor');
    expect(config.font).toContain('Tahoma');
  });

  it('falls back to provided defaults when no tenant catalog match exists', () => {
    const config = mapTenantBootstrapResponse(
      {
        displayName: '   ',
        uiDefaults: {
          theme: '   ',
          font: '   ',
        },
      },
      {
        tenantId: 'unknown',
        displayName: 'Default Name',
        theme: 'default-theme',
        font: 'default-font',
        enabledForms: [FormType.Electrical],
        loginRequired: false,
        showLeftFlyout: true,
        showRightFlyout: true,
        showInspectionStatsButton: false,
      }
    );

    expect(config.displayName).toBe('Default Name');
    expect(config.theme).toBe('default-theme');
    expect(config.font).toBe('default-font');
  });
});
