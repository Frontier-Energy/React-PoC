import {
  DEFAULT_ENVIRONMENT_ID,
  getEnvironmentById,
  GOVERNED_ENVIRONMENTS,
  resolveApiBaseUrlForHostname,
  resolveApiBearerTokenForHostname,
  resolveEnvironmentIdFromHostname,
} from './governedConfig';

describe('governedConfig', () => {
  it('finds environments case-insensitively', () => {
    expect(getEnvironmentById('BETA')).toEqual(
      expect.objectContaining({
        environmentId: 'beta',
        displayName: 'Beta',
      })
    );
  });

  it('falls back to the default environment when hostname is empty or unknown', () => {
    expect(resolveEnvironmentIdFromHostname(undefined)).toBe(DEFAULT_ENVIRONMENT_ID);
    expect(resolveEnvironmentIdFromHostname(null)).toBe(DEFAULT_ENVIRONMENT_ID);
    expect(resolveEnvironmentIdFromHostname('')).toBe(DEFAULT_ENVIRONMENT_ID);
    expect(resolveEnvironmentIdFromHostname('unknown.example.com')).toBe(DEFAULT_ENVIRONMENT_ID);
  });

  it('matches environments by explicit hostname and hostname suffix', () => {
    expect(resolveEnvironmentIdFromHostname('localhost')).toBe('beta');
    expect(resolveEnvironmentIdFromHostname('ops.qcontrol.frontierenergy.com')).toBe('production');
  });

  it('resolves api base urls using the inferred environment', () => {
    const betaEnvironment = GOVERNED_ENVIRONMENTS.find((environment) => environment.environmentId === 'beta');
    const productionEnvironment = GOVERNED_ENVIRONMENTS.find((environment) => environment.environmentId === 'production');

    expect(resolveApiBaseUrlForHostname('localhost')).toBe(betaEnvironment?.apiBaseUrl);
    expect(resolveApiBaseUrlForHostname('ops.qcontrol.frontierenergy.com')).toBe(productionEnvironment?.apiBaseUrl);
    expect(resolveApiBaseUrlForHostname('missing.example.com')).toBe(betaEnvironment?.apiBaseUrl);
  });

  it('resolves api bearer tokens using the inferred environment', () => {
    const betaEnvironment = GOVERNED_ENVIRONMENTS.find((environment) => environment.environmentId === 'beta');
    const productionEnvironment = GOVERNED_ENVIRONMENTS.find((environment) => environment.environmentId === 'production');

    expect(resolveApiBearerTokenForHostname('localhost')).toBe(betaEnvironment?.apiBearerToken ?? null);
    expect(resolveApiBearerTokenForHostname('ops.qcontrol.frontierenergy.com')).toBe(productionEnvironment?.apiBearerToken ?? null);
    expect(resolveApiBearerTokenForHostname('missing.example.com')).toBe(betaEnvironment?.apiBearerToken ?? null);
  });
});
