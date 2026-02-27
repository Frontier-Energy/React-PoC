import { FormType } from './types';
import { CUSTOMIZATION_STORAGE_KEY } from './config';
import {
  fetchTenantBootstrapConfig,
  getDefaultTenantBootstrapConfig,
  mapTenantBootstrapResponse,
  persistTenantCustomization,
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

  it('fetches tenant bootstrap config from upstream service', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        tenantId: 'opscentral',
        formTypes: [FormType.SafetyChecklist],
        loginRequired: true,
      }),
    } as Response);

    const config = await fetchTenantBootstrapConfig();

    expect(config.tenantId).toBe('opscentral');
    expect(config.enabledForms).toEqual([FormType.SafetyChecklist]);
    expect(config.loginRequired).toBe(true);
  });

  it('throws when upstream bootstrap request fails', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: false,
      status: 500,
    } as Response);

    await expect(fetchTenantBootstrapConfig()).rejects.toThrow('Tenant bootstrap request failed with status 500');
  });

  it('persists tenant customization and merges with existing settings', () => {
    localStorage.setItem(
      CUSTOMIZATION_STORAGE_KEY,
      JSON.stringify({ language: 'es', extra: 'keep-me' })
    );
    persistTenantCustomization({
      tenantId: 'qhvac',
      displayName: 'QHVAC',
      theme: 'harbor',
      font: 'Tahoma',
      language: 'en',
      enabledForms: [FormType.HVAC],
      loginRequired: true,
    });

    expect(JSON.parse(localStorage.getItem(CUSTOMIZATION_STORAGE_KEY) || '{}')).toEqual({
      tenantId: 'qhvac',
      theme: 'harbor',
      font: 'Tahoma',
      language: 'en',
      extra: 'keep-me',
    });
  });

  it('handles malformed stored customization and omits language when not set', () => {
    localStorage.setItem(CUSTOMIZATION_STORAGE_KEY, '{bad-json');

    persistTenantCustomization({
      tenantId: 'opscentral',
      displayName: 'Operations Central',
      theme: 'mist',
      font: 'Georgia',
      enabledForms: [FormType.SafetyChecklist],
      loginRequired: false,
    });

    expect(JSON.parse(localStorage.getItem(CUSTOMIZATION_STORAGE_KEY) || '{}')).toEqual({
      tenantId: 'opscentral',
      theme: 'mist',
      font: 'Georgia',
    });
  });
});
