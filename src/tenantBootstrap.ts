import { setSelectedTenantId } from './appState';
import { getActiveTenant, getTenantById, getTenantBootstrapUrl } from './config';
import { isLanguageCode, type LanguageCode } from './resources/translations';
import { FormType } from './types';

export interface TenantBootstrapConfig {
  tenantId: string;
  displayName: string;
  theme: string;
  font: string;
  showLeftFlyout: boolean;
  showRightFlyout: boolean;
  showInspectionStatsButton: boolean;
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
    showLeftFlyout?: boolean;
    showRightFlyout?: boolean;
    showInspectionStatsButton?: boolean;
    includeInspectionStatsButton?: boolean;
    includeLeftFlyout?: boolean;
    includeRightFlyout?: boolean;
  };
  showLeftFlyout?: boolean;
  showRightFlyout?: boolean;
  showInspectionStatsButton?: boolean;
  includeInspectionStatsButton?: boolean;
  includeLeftFlyout?: boolean;
  includeRightFlyout?: boolean;
  enabledForms?: string[];
  formTypes?: string[];
  loginRequired?: boolean;
  requiresLogin?: boolean;
}

const DEFAULT_ENABLED_FORMS = Object.values(FormType);
const LOGIN_OPTIONAL_TENANTS = new Set(['lire']);
const DEFAULT_ENABLED_FORMS_BY_TENANT: Partial<Record<string, FormType[]>> = {
  frontierdemo: DEFAULT_ENABLED_FORMS,
  qhvac: [FormType.Electrical, FormType.ElectricalSF, FormType.HVAC],
  opscentral: [FormType.SafetyChecklist],
  lire: [],
};

const isFormType = (value: string): value is FormType => DEFAULT_ENABLED_FORMS.includes(value as FormType);
const resolveOptionalBoolean = (...values: Array<boolean | undefined>): boolean | undefined =>
  values.find((value) => typeof value === 'boolean');
const resolveDefaultEnabledFormsForTenant = (tenantId: string): FormType[] =>
  DEFAULT_ENABLED_FORMS_BY_TENANT[tenantId.toLowerCase()] ?? DEFAULT_ENABLED_FORMS;

export const getDefaultTenantBootstrapConfig = (): TenantBootstrapConfig => {
  const activeTenant = getActiveTenant();
  return {
    tenantId: activeTenant.tenantId,
    displayName: activeTenant.displayName,
    theme: activeTenant.uiDefaults.theme,
    font: activeTenant.uiDefaults.font,
    showLeftFlyout: activeTenant.uiDefaults.showLeftFlyout,
    showRightFlyout: activeTenant.uiDefaults.showRightFlyout,
    showInspectionStatsButton: activeTenant.uiDefaults.showInspectionStatsButton,
    enabledForms: resolveDefaultEnabledFormsForTenant(activeTenant.tenantId),
    loginRequired: !LOGIN_OPTIONAL_TENANTS.has(activeTenant.tenantId.toLowerCase()),
  };
};

export const getDefaultTenantBootstrapConfigForTenant = (tenantId?: string): TenantBootstrapConfig => {
  const requestedTenant = tenantId ? getTenantById(tenantId) : undefined;
  const activeTenant = requestedTenant ?? getActiveTenant();
  return {
    tenantId: activeTenant.tenantId,
    displayName: activeTenant.displayName,
    theme: activeTenant.uiDefaults.theme,
    font: activeTenant.uiDefaults.font,
    showLeftFlyout: activeTenant.uiDefaults.showLeftFlyout,
    showRightFlyout: activeTenant.uiDefaults.showRightFlyout,
    showInspectionStatsButton: activeTenant.uiDefaults.showInspectionStatsButton,
    enabledForms: resolveDefaultEnabledFormsForTenant(activeTenant.tenantId),
    loginRequired: !LOGIN_OPTIONAL_TENANTS.has(activeTenant.tenantId.toLowerCase()),
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
  const showLeftFlyout = resolveOptionalBoolean(
    payload.showLeftFlyout,
    payload.includeLeftFlyout,
    payload.uiDefaults?.showLeftFlyout,
    payload.uiDefaults?.includeLeftFlyout,
    baseTenant?.uiDefaults.showLeftFlyout,
    defaults.showLeftFlyout
  );
  const showRightFlyout = resolveOptionalBoolean(
    payload.showRightFlyout,
    payload.includeRightFlyout,
    payload.uiDefaults?.showRightFlyout,
    payload.uiDefaults?.includeRightFlyout,
    baseTenant?.uiDefaults.showRightFlyout,
    defaults.showRightFlyout
  );
  const showInspectionStatsButton = resolveOptionalBoolean(
    payload.showInspectionStatsButton,
    payload.includeInspectionStatsButton,
    payload.uiDefaults?.showInspectionStatsButton,
    payload.uiDefaults?.includeInspectionStatsButton,
    baseTenant?.uiDefaults.showInspectionStatsButton,
    defaults.showInspectionStatsButton
  );

  return {
    tenantId: baseTenant?.tenantId ?? defaults.tenantId,
    displayName: payload.displayName?.trim() || baseTenant?.displayName || defaults.displayName,
    theme: payload.uiDefaults?.theme?.trim() || baseTenant?.uiDefaults.theme || defaults.theme,
    font: payload.uiDefaults?.font?.trim() || baseTenant?.uiDefaults.font || defaults.font,
    showLeftFlyout: showLeftFlyout ?? defaults.showLeftFlyout,
    showRightFlyout: showRightFlyout ?? defaults.showRightFlyout,
    showInspectionStatsButton: showInspectionStatsButton ?? defaults.showInspectionStatsButton,
    language: language && isLanguageCode(language) ? language : defaults.language,
    enabledForms: enabledForms.length > 0 ? enabledForms : defaults.enabledForms,
    loginRequired,
  };
};

export const fetchTenantBootstrapConfig = async (tenantId?: string): Promise<TenantBootstrapConfig> => {
  const defaults = getDefaultTenantBootstrapConfigForTenant(tenantId);
  const response = await fetch(getTenantBootstrapUrl(defaults.tenantId));
  if (!response.ok) {
    throw new Error(`Tenant bootstrap request failed with status ${response.status}`);
  }
  const payload = (await response.json()) as TenantBootstrapResponse;
  return mapTenantBootstrapResponse(payload, defaults);
};

export const persistSelectedTenant = (tenantId: string) => {
  setSelectedTenantId(tenantId);
};
