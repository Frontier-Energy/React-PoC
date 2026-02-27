export interface AppConfig {
  tenantName: string;
  apiBaseUrl: string;
  uploadInspectionPath: string;
  loginPath: string;
  registerPath: string;
  tenantBootstrapPath: string;
}

export interface TenantDefinition {
  tenantId: string;
  displayName: string;
  servicePathPrefix: string;
  uiDefaults: {
    theme: string;
    font: string;
  };
}

export const DEFAULT_TENANT_NAME = 'frontierDemo';
export const CUSTOMIZATION_STORAGE_KEY = 'appCustomization';
const QCONTROL_DOMAIN_SUFFIX = ['qcontrol', 'frontierenergy', 'com'] as const;
export const TENANTS: TenantDefinition[] = [
  {
    tenantId: DEFAULT_TENANT_NAME,
    displayName: 'Frontier Demo',
    servicePathPrefix: '/QHVAC',
    uiDefaults: {
      theme: 'mist',
      font: '"Source Sans Pro", "Helvetica Neue", Arial, sans-serif',
    },
  },
  {
    tenantId: 'qhvac',
    displayName: 'QHVAC',
    servicePathPrefix: '/QHVAC',
    uiDefaults: {
      theme: 'harbor',
      font: 'Tahoma, "Trebuchet MS", Arial, sans-serif',
    },
  },
  {
    tenantId: 'opscentral',
    displayName: 'Ops Central',
    servicePathPrefix: '/QHVAC',
    uiDefaults: {
      theme: 'sand',
      font: 'Georgia, "Times New Roman", serif',
    },
  },
];

export const getTenantById = (tenantId: string) =>
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

const readStoredTenantName = (): string | null => {
  if (typeof window === 'undefined') {
    return null;
  }
  const stored = localStorage.getItem(CUSTOMIZATION_STORAGE_KEY);
  if (!stored) {
    return null;
  }
  try {
    const parsed = JSON.parse(stored) as { tenantId?: string };
    return parsed.tenantId && getTenantById(parsed.tenantId) ? parsed.tenantId : null;
  } catch (error) {
    return null;
  }
};

const resolveActiveTenantName = (): string => {
  const storedTenantName = readStoredTenantName();
  if (storedTenantName) {
    return storedTenantName;
  }
  if (typeof window === 'undefined') {
    return DEFAULT_TENANT_NAME;
  }
  return resolveTenantNameFromHostname(window.location.hostname);
};

export const getActiveTenant = (): TenantDefinition => {
  const resolvedTenantName = resolveActiveTenantName();
  return getTenantById(resolvedTenantName) ?? TENANTS[0];
};

const getAppConfig = (): AppConfig => {
  const activeTenant = getActiveTenant();
  return {
    tenantName: activeTenant.tenantId,
    apiBaseUrl: 'https://react-receiver.icysmoke-6c3b2e19.centralus.azurecontainerapps.io',
    uploadInspectionPath: `${activeTenant.servicePathPrefix}/ReceiveInspection`,
    loginPath: `${activeTenant.servicePathPrefix}/login`,
    registerPath: `${activeTenant.servicePathPrefix}/Register`,
    tenantBootstrapPath: `${activeTenant.servicePathPrefix}/tenant-config`,
  };
};

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

export const getTenantBootstrapUrl = () => {
  const appConfig = getAppConfig();
  return `${appConfig.apiBaseUrl}${appConfig.tenantBootstrapPath}`;
};
