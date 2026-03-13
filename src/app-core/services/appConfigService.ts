import type { TenantDefinition } from '../governedConfig';
import type { AppConfig } from '../config';

export interface AppConfigServiceDependencies {
  tenants: TenantDefinition[];
  defaultTenantName: string;
  tenantHostnameSuffix: string;
  resolveStoredTenantName: () => string | null;
  resolveHostname: () => string | null;
  resolveApiBaseUrl: () => string;
  servicePaths: {
    uploadInspectionPath: string;
    loginPath: string;
    registerPath: string;
    tenantBootstrapPath: string;
    formSchemasPath: string;
    translationsPath: string;
  };
}

export const createAppConfigService = ({
  tenants,
  defaultTenantName,
  tenantHostnameSuffix,
  resolveStoredTenantName,
  resolveHostname,
  resolveApiBaseUrl,
  servicePaths,
}: AppConfigServiceDependencies) => {
  const getTenantById = (tenantId: string) =>
    tenants.find((tenant) => tenant.tenantId.toLowerCase() === tenantId.toLowerCase());

  const resolveTenantNameFromHostname = (hostname: string): string => {
    const normalized = hostname.trim().toLowerCase();
    if (!normalized) {
      return defaultTenantName;
    }

    const suffix = tenantHostnameSuffix.trim().toLowerCase();
    const suffixPrefix = `.${suffix}`;
    const hasExpectedShape = normalized.endsWith(suffixPrefix) && normalized.length > suffixPrefix.length;

    if (!hasExpectedShape) {
      return defaultTenantName;
    }

    const tenantSegment = normalized.slice(0, normalized.length - suffixPrefix.length);
    if (!tenantSegment || tenantSegment.includes('.')) {
      return defaultTenantName;
    }

    return getTenantById(tenantSegment)?.tenantId ?? defaultTenantName;
  };

  const resolveActiveTenantName = (): string => {
    const storedTenantName = resolveStoredTenantName();
    if (storedTenantName && getTenantById(storedTenantName)) {
      return storedTenantName;
    }

    const hostname = resolveHostname();
    if (!hostname) {
      return defaultTenantName;
    }

    return resolveTenantNameFromHostname(hostname);
  };

  const getActiveTenant = (): TenantDefinition => {
    const resolvedTenantName = resolveActiveTenantName();
    return getTenantById(resolvedTenantName) ?? tenants[0];
  };

  const getAppConfig = (tenantId?: string): AppConfig => {
    const activeTenant = tenantId ? getTenantById(tenantId) ?? getActiveTenant() : getActiveTenant();
    return {
      tenantName: activeTenant.tenantId,
      apiBaseUrl: resolveApiBaseUrl(),
      uploadInspectionPath: servicePaths.uploadInspectionPath,
      loginPath: servicePaths.loginPath,
      registerPath: servicePaths.registerPath,
      tenantBootstrapPath: servicePaths.tenantBootstrapPath,
      formSchemasPath: servicePaths.formSchemasPath,
      translationsPath: servicePaths.translationsPath,
    };
  };

  return {
    getTenantById,
    resolveTenantNameFromHostname,
    getActiveTenant,
    getAppConfig,
  };
};
