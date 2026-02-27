import { FormType } from './types';
import {
  fetchTenantBootstrapConfig,
  getDefaultTenantBootstrapConfig,
  mapTenantBootstrapResponse,
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
});
