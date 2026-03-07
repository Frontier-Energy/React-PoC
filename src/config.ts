import { getAppPreferenceState } from './appState';
import {
  DEFAULT_TENANT_ID,
  GOVERNED_SERVICE_PATHS,
  GOVERNED_TENANTS,
  getEnvironmentById,
  resolveApiBaseUrlForHostname,
  resolveEnvironmentIdFromHostname,
  TENANT_HOSTNAME_SUFFIX,
  type EnvironmentDefinition,
  type TenantDefinition,
} from './governedConfig';
import { createAppConfigService } from './services/appConfigService';

export interface AppConfig {
  tenantName: string;
  apiBaseUrl: string;
  uploadInspectionPath: string;
  loginPath: string;
  registerPath: string;
  tenantBootstrapPath: string;
  formSchemasPath: string;
  translationsPath: string;
}

export type { TenantDefinition } from './governedConfig';

export const DEFAULT_TENANT_NAME = DEFAULT_TENANT_ID;
export const TENANTS: TenantDefinition[] = GOVERNED_TENANTS;

const resolveApiBaseUrl = (): string => {
  const hostname = typeof window === 'undefined' ? null : window.location.hostname;
  return resolveApiBaseUrlForHostname(hostname);
};

const appConfigService = createAppConfigService({
  tenants: TENANTS,
  defaultTenantName: DEFAULT_TENANT_NAME,
  tenantHostnameSuffix: TENANT_HOSTNAME_SUFFIX,
  resolveStoredTenantName: () => getAppPreferenceState().tenantId,
  resolveHostname: () => (typeof window === 'undefined' ? null : window.location.hostname),
  resolveApiBaseUrl,
  servicePaths: GOVERNED_SERVICE_PATHS,
});

export const getTenantById = appConfigService.getTenantById;
export const resolveTenantNameFromHostname = appConfigService.resolveTenantNameFromHostname;
export const getActiveTenant = appConfigService.getActiveTenant;
export { resolveEnvironmentIdFromHostname };
export const getEnvironmentConfigById = (environmentId: string): EnvironmentDefinition | undefined =>
  getEnvironmentById(environmentId);
export const getActiveEnvironment = (): EnvironmentDefinition | undefined => {
  const hostname = typeof window === 'undefined' ? null : window.location.hostname;
  return getEnvironmentById(resolveEnvironmentIdFromHostname(hostname));
};

const getAppConfig = (tenantId?: string): AppConfig => appConfigService.getAppConfig(tenantId);

export const getUploadInspectionUrl = () => {
  const appConfig = getAppConfig();
  return `${appConfig.apiBaseUrl}${appConfig.uploadInspectionPath}`;
};

export const getLoginUrl = () => {
  const appConfig = getAppConfig();
  return `${appConfig.apiBaseUrl}${appConfig.loginPath}`;
};

export const getRegisterUrl = () => {
  const appConfig = getAppConfig();
  return `${appConfig.apiBaseUrl}${appConfig.registerPath}`;
};

export const getTenantBootstrapUrl = (tenantId?: string) => {
  const appConfig = getAppConfig(tenantId);
  const requestTenantId = tenantId ?? appConfig.tenantName;
  const query = requestTenantId ? `?tenantId=${encodeURIComponent(requestTenantId)}` : '';
  return `${appConfig.apiBaseUrl}${appConfig.tenantBootstrapPath}${query}`;
};

export const getConnectivityCheckUrl = () => getTenantBootstrapUrl();

export const getFormSchemaUrl = (formType: string, tenantId?: string) => {
  const appConfig = getAppConfig(tenantId);
  return `${appConfig.apiBaseUrl}${appConfig.formSchemasPath}/${encodeURIComponent(formType)}`;
};

export const getTranslationsUrl = (language: string, tenantId?: string) => {
  const appConfig = getAppConfig(tenantId);
  return `${appConfig.apiBaseUrl}${appConfig.translationsPath}/${encodeURIComponent(language)}`;
};
