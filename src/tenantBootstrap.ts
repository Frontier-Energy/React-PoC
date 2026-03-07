import { setSelectedTenantId } from './appState';
import { getActiveTenant, getTenantById, getTenantBootstrapUrl } from './config';
import { isLanguageCode, type LanguageCode } from './resources/translations';
import { FormType } from './types';

export const TENANT_BOOTSTRAP_CACHE_STORAGE_KEY = 'tenantBootstrapCache';
export const DEFAULT_TENANT_BOOTSTRAP_TIMEOUT_MS = 4000;

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

export interface CachedTenantBootstrapConfig {
  savedAt: string;
  config: TenantBootstrapConfig;
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

const isFormType = (value: string): value is FormType => DEFAULT_ENABLED_FORMS.includes(value as FormType);
const resolveOptionalBoolean = (...values: Array<boolean | undefined>): boolean | undefined =>
  values.find((value) => typeof value === 'boolean');
const resolveDefaultEnabledFormsForTenant = (tenantId: string): FormType[] =>
  getTenantById(tenantId)?.bootstrapDefaults.enabledForms ?? DEFAULT_ENABLED_FORMS;
const resolveDefaultLoginRequiredForTenant = (tenantId: string): boolean =>
  getTenantById(tenantId)?.bootstrapDefaults.loginRequired ?? true;
const isTenantBootstrapConfig = (value: unknown): value is TenantBootstrapConfig => {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<TenantBootstrapConfig>;
  return (
    typeof candidate.tenantId === 'string' &&
    typeof candidate.displayName === 'string' &&
    typeof candidate.theme === 'string' &&
    typeof candidate.font === 'string' &&
    typeof candidate.showLeftFlyout === 'boolean' &&
    typeof candidate.showRightFlyout === 'boolean' &&
    typeof candidate.showInspectionStatsButton === 'boolean' &&
    Array.isArray(candidate.enabledForms) &&
    candidate.enabledForms.every((formType) => typeof formType === 'string' && isFormType(formType)) &&
    typeof candidate.loginRequired === 'boolean' &&
    (candidate.language === undefined || isLanguageCode(candidate.language))
  );
};
const normalizeTenantBootstrapCacheKey = (tenantId: string) => tenantId.trim().toLowerCase();

const readTenantBootstrapCacheStore = (): Record<string, CachedTenantBootstrapConfig> => {
  const stored = localStorage.getItem(TENANT_BOOTSTRAP_CACHE_STORAGE_KEY);
  if (!stored) {
    return {};
  }

  try {
    const parsed = JSON.parse(stored) as Record<string, CachedTenantBootstrapConfig>;
    return Object.entries(parsed).reduce<Record<string, CachedTenantBootstrapConfig>>((result, [key, value]) => {
      if (
        value &&
        typeof value === 'object' &&
        typeof value.savedAt === 'string' &&
        isTenantBootstrapConfig(value.config)
      ) {
        result[key] = value;
      }
      return result;
    }, {});
  } catch {
    return {};
  }
};

const writeTenantBootstrapCacheStore = (cache: Record<string, CachedTenantBootstrapConfig>) => {
  localStorage.setItem(TENANT_BOOTSTRAP_CACHE_STORAGE_KEY, JSON.stringify(cache));
};

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
    loginRequired: resolveDefaultLoginRequiredForTenant(activeTenant.tenantId),
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
    loginRequired: resolveDefaultLoginRequiredForTenant(activeTenant.tenantId),
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

export const readCachedTenantBootstrapConfig = (tenantId?: string): CachedTenantBootstrapConfig | null => {
  const defaults = getDefaultTenantBootstrapConfigForTenant(tenantId);
  const cache = readTenantBootstrapCacheStore();
  return cache[normalizeTenantBootstrapCacheKey(defaults.tenantId)] ?? null;
};

export const cacheTenantBootstrapConfig = (config: TenantBootstrapConfig, savedAt = new Date().toISOString()) => {
  const cache = readTenantBootstrapCacheStore();
  cache[normalizeTenantBootstrapCacheKey(config.tenantId)] = {
    savedAt,
    config,
  };
  writeTenantBootstrapCacheStore(cache);
};

export const clearCachedTenantBootstrapConfig = (tenantId?: string) => {
  const defaults = getDefaultTenantBootstrapConfigForTenant(tenantId);
  const cache = readTenantBootstrapCacheStore();
  delete cache[normalizeTenantBootstrapCacheKey(defaults.tenantId)];
  writeTenantBootstrapCacheStore(cache);
};

export const fetchTenantBootstrapConfig = async (
  tenantId?: string,
  options?: { timeoutMs?: number }
): Promise<TenantBootstrapConfig> => {
  const defaults = getDefaultTenantBootstrapConfigForTenant(tenantId);
  const timeoutMs = options?.timeoutMs ?? DEFAULT_TENANT_BOOTSTRAP_TIMEOUT_MS;
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(getTenantBootstrapUrl(defaults.tenantId), {
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`Tenant bootstrap request failed with status ${response.status}`);
    }
    const payload = (await response.json()) as TenantBootstrapResponse;
    const resolvedConfig = mapTenantBootstrapResponse(payload, defaults);
    cacheTenantBootstrapConfig(resolvedConfig);
    return resolvedConfig;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`Tenant bootstrap request timed out after ${timeoutMs}ms`);
    }
    throw error;
  } finally {
    window.clearTimeout(timeoutId);
  }
};

export const persistSelectedTenant = (tenantId: string) => {
  setSelectedTenantId(tenantId);
};
