import { getAppPreferenceState } from './appState';
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

export interface TenantDefinition {
  tenantId: string;
  displayName: string;
  uiDefaults: {
    theme: string;
    font: string;
    showLeftFlyout: boolean;
    showRightFlyout: boolean;
    showInspectionStatsButton: boolean;
  };
}

export const DEFAULT_TENANT_NAME = 'frontierDemo';
const DEFAULT_API_BASE_URL = 'https://react-receiver.icysmoke-6c3b2e19.centralus.azurecontainerapps.io';
export const TENANTS: TenantDefinition[] = [
  {
    tenantId: DEFAULT_TENANT_NAME,
    displayName: 'Frontier Demo',
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
    uiDefaults: {
      theme: 'mist',
      font: '"Source Sans Pro", "Helvetica Neue", Arial, sans-serif',
      showLeftFlyout: false,
      showRightFlyout: true,
      showInspectionStatsButton: false,
    },
  },
];

const resolveApiBaseUrl = (): string => {
  const configuredApiBaseUrl = import.meta.env.VITE_API_BASE_URL?.trim();
  const apiBaseUrl = configuredApiBaseUrl || DEFAULT_API_BASE_URL;
  return apiBaseUrl.replace(/\/+$/, '');
};

const appConfigService = createAppConfigService({
  tenants: TENANTS,
  defaultTenantName: DEFAULT_TENANT_NAME,
  resolveStoredTenantName: () => getAppPreferenceState().tenantId,
  resolveHostname: () => (typeof window === 'undefined' ? null : window.location.hostname),
  resolveApiBaseUrl,
});

export const getTenantById = appConfigService.getTenantById;
export const resolveTenantNameFromHostname = appConfigService.resolveTenantNameFromHostname;
export const getActiveTenant = appConfigService.getActiveTenant;

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
