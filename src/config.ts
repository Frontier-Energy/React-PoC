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

export interface TenantDefinition {
  tenantId: string;
  displayName: string;
  servicePathPrefix: string;
  uiDefaults: {
    theme: string;
    font: string;
    showLeftFlyout: boolean;
    showRightFlyout: boolean;
    showInspectionStatsButton: boolean;
  };
}

export const DEFAULT_TENANT_NAME = 'frontierDemo';
export const CUSTOMIZATION_STORAGE_KEY = 'appCustomization';
const DEFAULT_API_BASE_URL = 'https://react-receiver.icysmoke-6c3b2e19.centralus.azurecontainerapps.io';
const QCONTROL_DOMAIN_SUFFIX = ['qcontrol', 'frontierenergy', 'com'] as const;
export const TENANTS: TenantDefinition[] = [
  {
    tenantId: DEFAULT_TENANT_NAME,
    displayName: 'Frontier Demo',
    servicePathPrefix: '/QHVAC',
    uiDefaults: {
      theme: 'mist',
      font: '"Source Sans Pro", "Helvetica Neue", Arial, sans-serif',
      showLeftFlyout: true,
      showRightFlyout: true,
      showInspectionStatsButton: false,
    },
  },
  {
    tenantId: 'qhvac',
    displayName: 'QHVAC',
    servicePathPrefix: '/QHVAC',
    uiDefaults: {
      theme: 'harbor',
      font: 'Tahoma, "Trebuchet MS", Arial, sans-serif',
      showLeftFlyout: true,
      showRightFlyout: true,
      showInspectionStatsButton: false,
    },
  },
  {
    tenantId: 'opscentral',
    displayName: 'Ops Central',
    servicePathPrefix: '/QHVAC',
    uiDefaults: {
      theme: 'sand',
      font: 'Georgia, "Times New Roman", serif',
      showLeftFlyout: true,
      showRightFlyout: true,
      showInspectionStatsButton: false,
    },
  },
  {
    tenantId: 'lire',
    displayName: 'LIRE',
    servicePathPrefix: '/QHVAC',
    uiDefaults: {
      theme: 'mist',
      font: '"Source Sans Pro", "Helvetica Neue", Arial, sans-serif',
      showLeftFlyout: false,
      showRightFlyout: true,
      showInspectionStatsButton: false,
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

const resolveApiBaseUrl = (): string => {
  const configuredApiBaseUrl = import.meta.env.VITE_API_BASE_URL?.trim();
  const apiBaseUrl = configuredApiBaseUrl || DEFAULT_API_BASE_URL;
  return apiBaseUrl.replace(/\/+$/, '');
};

export const getActiveTenant = (): TenantDefinition => {
  const resolvedTenantName = resolveActiveTenantName();
  return getTenantById(resolvedTenantName) ?? TENANTS[0];
};

const getAppConfig = (tenantId?: string): AppConfig => {
  const activeTenant = tenantId ? getTenantById(tenantId) ?? getActiveTenant() : getActiveTenant();
  return {
    tenantName: activeTenant.tenantId,
    apiBaseUrl: resolveApiBaseUrl(),
    uploadInspectionPath: `${activeTenant.servicePathPrefix}/ReceiveInspection`,
    loginPath: `${activeTenant.servicePathPrefix}/login`,
    registerPath: `${activeTenant.servicePathPrefix}/Register`,
    tenantBootstrapPath: `${activeTenant.servicePathPrefix}/tenant-config`,
    formSchemasPath: `${activeTenant.servicePathPrefix}/form-schemas`,
    translationsPath: `${activeTenant.servicePathPrefix}/translations`,
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

export const getTenantBootstrapUrl = (tenantId?: string) => {
  const appConfig = getAppConfig(tenantId);
  const requestTenantId = tenantId ?? appConfig.tenantName;
  const query = requestTenantId ? `?tenantId=${encodeURIComponent(requestTenantId)}` : '';
  return `${appConfig.apiBaseUrl}${appConfig.tenantBootstrapPath}${query}`;
};

export const getFormSchemaUrl = (formType: string, tenantId?: string) => {
  const appConfig = getAppConfig(tenantId);
  return `${appConfig.apiBaseUrl}${appConfig.formSchemasPath}/${encodeURIComponent(formType)}`;
};

export const getTranslationsUrl = (language: string, tenantId?: string) => {
  const appConfig = getAppConfig(tenantId);
  return `${appConfig.apiBaseUrl}${appConfig.translationsPath}/${encodeURIComponent(language)}`;
};
