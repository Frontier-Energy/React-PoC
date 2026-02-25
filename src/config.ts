export interface AppConfig {
  tenantName: string;
  apiBaseUrl: string;
  uploadInspectionPath: string;
  loginPath: string;
  registerPath: string;
}

export interface TenantDefinition {
  tenantId: string;
  displayName: string;
}

export const DEFAULT_TENANT_NAME = 'frontierDemo';
const QCONTROL_DOMAIN_SUFFIX = ['qcontrol', 'frontierenergy', 'com'] as const;
export const TENANTS: TenantDefinition[] = [
  {
    tenantId: DEFAULT_TENANT_NAME,
    displayName: 'Frontier Demo',
  },
];

const getTenantById = (tenantId: string) =>
  TENANTS.find((tenant) => tenant.tenantId.toLowerCase() === tenantId.toLowerCase());

export const resolveTenantNameFromHostname = (hostname: string): string => {
  const normalized = hostname.trim().toLowerCase();
  if (!normalized) {
    return DEFAULT_TENANT_NAME;
  }

  const parts = normalized.split('.');
  const hasExpectedShape = parts.length === 4
    && parts[1] === QCONTROL_DOMAIN_SUFFIX[0]
    && parts[2] === QCONTROL_DOMAIN_SUFFIX[1]
    && parts[3] === QCONTROL_DOMAIN_SUFFIX[2]
    && parts[0].length > 0;

  if (!hasExpectedShape) {
    return DEFAULT_TENANT_NAME;
  }

  return getTenantById(parts[0])?.tenantId ?? DEFAULT_TENANT_NAME;
};

const resolvedTenantName = typeof window === 'undefined'
  ? DEFAULT_TENANT_NAME
  : resolveTenantNameFromHostname(window.location.hostname);
export const activeTenant = getTenantById(resolvedTenantName) ?? TENANTS[0];

export const appConfig: AppConfig = {
  tenantName: activeTenant.tenantId,
  apiBaseUrl: 'https://react-receiver.icysmoke-6c3b2e19.centralus.azurecontainerapps.io',
  uploadInspectionPath: `/QHVAC/ReceiveInspection`,
  loginPath: `/QHVAC/login`,
  registerPath: `/QHVAC/Register`,
};

export const getUploadInspectionUrl = () =>
  `${appConfig.apiBaseUrl}${appConfig.uploadInspectionPath}`;

export const getLoginUrl = () =>
  `${appConfig.apiBaseUrl}${appConfig.loginPath}`;

export const getRegisterUrl = () =>
  `${appConfig.apiBaseUrl}${appConfig.registerPath}`;
