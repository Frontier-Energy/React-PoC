import { CUSTOMIZATION_STORAGE_KEY, getActiveTenant, getTenantById, getTenantBootstrapUrl } from './config';
import { isLanguageCode, type LanguageCode } from './resources/translations';
import { FormType } from './types';

export interface TenantBootstrapConfig {
  tenantId: string;
  displayName: string;
  theme: string;
  font: string;
  language?: LanguageCode;
  enabledForms: FormType[];
  loginRequired: boolean;
}

interface TenantBootstrapResponse {
  tenantId?: string;
  displayName?: string;
  uiDefaults?: {
    theme?: string;
    font?: string;
    language?: string;
  };
  enabledForms?: string[];
  formTypes?: string[];
  loginRequired?: boolean;
  requiresLogin?: boolean;
}

const DEFAULT_ENABLED_FORMS = Object.values(FormType);

const isFormType = (value: string): value is FormType => DEFAULT_ENABLED_FORMS.includes(value as FormType);

export const getDefaultTenantBootstrapConfig = (): TenantBootstrapConfig => {
  const activeTenant = getActiveTenant();
  return {
    tenantId: activeTenant.tenantId,
    displayName: activeTenant.displayName,
    theme: activeTenant.uiDefaults.theme,
    font: activeTenant.uiDefaults.font,
    enabledForms: DEFAULT_ENABLED_FORMS,
    loginRequired: true,
  };
};

export const mapTenantBootstrapResponse = (
  payload: TenantBootstrapResponse,
  defaults: TenantBootstrapConfig
): TenantBootstrapConfig => {
  const requestedTenantId = payload.tenantId?.trim();
  const resolvedTenant = requestedTenantId ? getTenantById(requestedTenantId) : undefined;
  const baseTenant = resolvedTenant ?? getTenantById(defaults.tenantId);
  const enabledFormsInput = payload.enabledForms ?? payload.formTypes;
  const enabledForms = enabledFormsInput?.filter(isFormType) ?? defaults.enabledForms;
  const loginRequired = typeof payload.loginRequired === 'boolean'
    ? payload.loginRequired
    : typeof payload.requiresLogin === 'boolean'
      ? payload.requiresLogin
      : defaults.loginRequired;
  const language = payload.uiDefaults?.language;

  return {
    tenantId: baseTenant?.tenantId ?? defaults.tenantId,
    displayName: payload.displayName?.trim() || baseTenant?.displayName || defaults.displayName,
    theme: payload.uiDefaults?.theme?.trim() || baseTenant?.uiDefaults.theme || defaults.theme,
    font: payload.uiDefaults?.font?.trim() || baseTenant?.uiDefaults.font || defaults.font,
    language: language && isLanguageCode(language) ? language : defaults.language,
    enabledForms: enabledForms.length > 0 ? enabledForms : defaults.enabledForms,
    loginRequired,
  };
};

export const fetchTenantBootstrapConfig = async (): Promise<TenantBootstrapConfig> => {
  const defaults = getDefaultTenantBootstrapConfig();
  const response = await fetch(getTenantBootstrapUrl());
  if (!response.ok) {
    throw new Error(`Tenant bootstrap request failed with status ${response.status}`);
  }
  const payload = (await response.json()) as TenantBootstrapResponse;
  return mapTenantBootstrapResponse(payload, defaults);
};

export const persistTenantCustomization = (config: TenantBootstrapConfig) => {
  const stored = localStorage.getItem(CUSTOMIZATION_STORAGE_KEY);
  let existing: Record<string, unknown> = {};
  if (stored) {
    try {
      existing = JSON.parse(stored) as Record<string, unknown>;
    } catch (error) {
      existing = {};
    }
  }
  const updated: Record<string, unknown> = {
    ...existing,
    tenantId: config.tenantId,
    theme: config.theme,
    font: config.font,
  };
  if (config.language) {
    updated.language = config.language;
  }
  localStorage.setItem(CUSTOMIZATION_STORAGE_KEY, JSON.stringify(updated));
};
