import governedAppConfig from './resources/governedAppConfig.json';
import type { FormType } from './types';

export interface TenantUiDefaults {
  theme: string;
  font: string;
  showLeftFlyout: boolean;
  showRightFlyout: boolean;
  showInspectionStatsButton: boolean;
}

export interface TenantBootstrapDefaults {
  enabledForms: FormType[];
  loginRequired: boolean;
}

export interface TenantDefinition {
  tenantId: string;
  displayName: string;
  uiDefaults: TenantUiDefaults;
  bootstrapDefaults: TenantBootstrapDefaults;
}

export interface EnvironmentDefinition {
  environmentId: string;
  displayName: string;
  apiBaseUrl: string;
  apiBearerToken: string | null;
  hostnames: string[];
  hostnameSuffixes: string[];
}

export interface ServicePaths {
  uploadInspectionPath: string;
  loginPath: string;
  registerPath: string;
  tenantBootstrapPath: string;
  formSchemasPath: string;
  translationsPath: string;
}

interface RawGovernedAppConfig {
  defaultEnvironmentId: string;
  defaultTenantId: string;
  tenantHostnameSuffix: string;
  servicePaths: ServicePaths;
  environments: Array<{
    environmentId: string;
    displayName: string;
    apiBaseUrl: string;
    apiBearerToken?: string;
    hostnames: string[];
    hostnameSuffixes: string[];
  }>;
  tenants: Array<{
    tenantId: string;
    displayName: string;
    uiDefaults: TenantUiDefaults;
    bootstrapDefaults: {
      enabledForms: string[];
      loginRequired: boolean;
    };
  }>;
}

const rawConfig = governedAppConfig as RawGovernedAppConfig;
const normalizeHostname = (hostname: string) => hostname.trim().toLowerCase();
const normalizePathBaseUrl = (apiBaseUrl: string) => apiBaseUrl.trim().replace(/\/+$/, '');
const normalizeOptionalToken = (token: string | undefined) => {
  const normalizedToken = token?.trim() ?? '';
  return normalizedToken.length > 0 ? normalizedToken : null;
};
const isFormType = (value: unknown): value is FormType => typeof value === 'string' && value.trim().length > 0;

const mapEnabledForms = (tenantId: string, enabledForms: string[]): FormType[] => {
  const invalidFormTypes = enabledForms.filter((formType) => !isFormType(formType));
  if (invalidFormTypes.length > 0) {
    throw new Error(
      `Governed config for tenant "${tenantId}" contains unsupported forms: ${invalidFormTypes.join(', ')}`
    );
  }

  return enabledForms;
};

export const GOVERNED_SERVICE_PATHS: ServicePaths = rawConfig.servicePaths;
export const DEFAULT_ENVIRONMENT_ID = rawConfig.defaultEnvironmentId;
export const DEFAULT_TENANT_ID = rawConfig.defaultTenantId;
export const TENANT_HOSTNAME_SUFFIX = normalizeHostname(rawConfig.tenantHostnameSuffix);

export const GOVERNED_ENVIRONMENTS: EnvironmentDefinition[] = rawConfig.environments.map((environment) => ({
  environmentId: environment.environmentId,
  displayName: environment.displayName,
  apiBaseUrl: normalizePathBaseUrl(environment.apiBaseUrl),
  apiBearerToken: normalizeOptionalToken(environment.apiBearerToken),
  hostnames: environment.hostnames.map(normalizeHostname),
  hostnameSuffixes: environment.hostnameSuffixes.map(normalizeHostname),
}));

export const GOVERNED_TENANTS: TenantDefinition[] = rawConfig.tenants.map((tenant) => ({
  tenantId: tenant.tenantId,
  displayName: tenant.displayName,
  uiDefaults: tenant.uiDefaults,
  bootstrapDefaults: {
    enabledForms: mapEnabledForms(tenant.tenantId, tenant.bootstrapDefaults.enabledForms),
    loginRequired: tenant.bootstrapDefaults.loginRequired,
  },
}));

export const getEnvironmentById = (environmentId: string) =>
  GOVERNED_ENVIRONMENTS.find((environment) => environment.environmentId.toLowerCase() === environmentId.toLowerCase());

export const resolveEnvironmentIdFromHostname = (hostname: string | null | undefined): string => {
  const normalizedHostname = hostname ? normalizeHostname(hostname) : '';
  if (!normalizedHostname) {
    return DEFAULT_ENVIRONMENT_ID;
  }

  const matchedEnvironment = GOVERNED_ENVIRONMENTS.find((environment) =>
    environment.hostnames.includes(normalizedHostname)
    || environment.hostnameSuffixes.some((suffix) => normalizedHostname.endsWith(suffix))
  );

  return matchedEnvironment?.environmentId ?? DEFAULT_ENVIRONMENT_ID;
};

export const resolveApiBaseUrlForHostname = (hostname: string | null | undefined): string => {
  const environmentId = resolveEnvironmentIdFromHostname(hostname);
  return getEnvironmentById(environmentId)?.apiBaseUrl ?? getEnvironmentById(DEFAULT_ENVIRONMENT_ID)?.apiBaseUrl ?? '';
};

export const resolveApiBearerTokenForHostname = (hostname: string | null | undefined): string | null => {
  const environmentId = resolveEnvironmentIdFromHostname(hostname);
  return getEnvironmentById(environmentId)?.apiBearerToken ?? getEnvironmentById(DEFAULT_ENVIRONMENT_ID)?.apiBearerToken ?? null;
};

