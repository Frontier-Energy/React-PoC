import type { TenantDefinition, AppConfig } from '../config';

export interface AppConfigServiceDependencies {
  tenants: TenantDefinition[];
  defaultTenantName: string;
  resolveStoredTenantName: () => string | null;
  resolveHostname: () => string | null;
  resolveApiBaseUrl: () => string;
}

const QCONTROL_DOMAIN_SUFFIX = ['qcontrol', 'frontierenergy', 'com'] as const;

export const createAppConfigService = ({
  tenants,
  defaultTenantName,
  resolveStoredTenantName,
  resolveHostname,
  resolveApiBaseUrl,
}: AppConfigServiceDependencies) => {
  const getTenantById = (tenantId: string) =>
    tenants.find((tenant) => tenant.tenantId.toLowerCase() === tenantId.toLowerCase());

  const resolveTenantNameFromHostname = (hostname: string): string => {
    const normalized = hostname.trim().toLowerCase();
    if (!normalized) {
      return defaultTenantName;
    }

    const parts = normalized.split('.');
    const hasExpectedShape = parts.length === 4
      && parts[1] === QCONTROL_DOMAIN_SUFFIX[0]
      && parts[2] === QCONTROL_DOMAIN_SUFFIX[1]
      && parts[3] === QCONTROL_DOMAIN_SUFFIX[2]
      && parts[0].length > 0;

    if (!hasExpectedShape) {
      return defaultTenantName;
    }

    return getTenantById(parts[0])?.tenantId ?? defaultTenantName;
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
      uploadInspectionPath: '/inspections',
      loginPath: '/auth/login',
      registerPath: '/auth/register',
      tenantBootstrapPath: '/tenant-config',
      formSchemasPath: '/form-schemas',
      translationsPath: '/translations',
    };
  };

  return {
    getTenantById,
    resolveTenantNameFromHostname,
    getActiveTenant,
    getAppConfig,
  };
};
