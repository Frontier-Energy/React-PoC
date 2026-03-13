import { isLanguageCode, type LanguageCode } from './resources/translations';
import { platform } from './platform';

export const LEGACY_CUSTOMIZATION_STORAGE_KEY = 'appCustomization';
export const TENANT_PREFERENCE_STORAGE_KEY = 'appTenantPreference';
export const THEME_PREFERENCE_STORAGE_KEY = 'appThemePreference';
export const FONT_PREFERENCE_STORAGE_KEY = 'appFontPreference';
export const LANGUAGE_PREFERENCE_STORAGE_KEY = 'appLanguagePreference';

type LegacyCustomization = {
  tenantId?: string;
  theme?: string;
  font?: string;
  language?: string;
};

const getPreferenceStorage = () => platform.storage.getLocalStorage();
const canUseStorage = () => getPreferenceStorage() !== null;

const normalizeStoredString = (value: string | null | undefined): string | null => {
  const normalized = value?.trim();
  return normalized ? normalized : null;
};

const readLegacyCustomization = (): LegacyCustomization | null => {
  if (!canUseStorage()) {
    return null;
  }

  const stored = getPreferenceStorage()?.getItem(LEGACY_CUSTOMIZATION_STORAGE_KEY);
  if (!stored) {
    return null;
  }

  try {
    return JSON.parse(stored) as LegacyCustomization;
  } catch {
    return null;
  }
};

const readStringPreference = (storageKey: string, legacyField?: keyof LegacyCustomization): string | null => {
  if (!canUseStorage()) {
    return null;
  }

  const currentValue = normalizeStoredString(getPreferenceStorage()?.getItem(storageKey));
  if (currentValue) {
    return currentValue;
  }

  if (!legacyField) {
    return null;
  }

  const legacyValue = normalizeStoredString(readLegacyCustomization()?.[legacyField]);
  if (legacyValue) {
    getPreferenceStorage()?.setItem(storageKey, legacyValue);
  }

  return legacyValue;
};

const writeStringPreference = (storageKey: string, value: string | null | undefined) => {
  if (!canUseStorage()) {
    return;
  }

  const normalizedValue = normalizeStoredString(value);
  if (!normalizedValue) {
    getPreferenceStorage()?.removeItem(storageKey);
    return;
  }

  getPreferenceStorage()?.setItem(storageKey, normalizedValue);
};

export const getStoredTenantPreference = () => readStringPreference(TENANT_PREFERENCE_STORAGE_KEY, 'tenantId');
export const setStoredTenantPreference = (tenantId: string | null | undefined) =>
  writeStringPreference(TENANT_PREFERENCE_STORAGE_KEY, tenantId);
export const clearStoredTenantPreference = () => writeStringPreference(TENANT_PREFERENCE_STORAGE_KEY, null);

export const getStoredThemePreference = () => readStringPreference(THEME_PREFERENCE_STORAGE_KEY, 'theme');
export const setStoredThemePreference = (theme: string | null | undefined) =>
  writeStringPreference(THEME_PREFERENCE_STORAGE_KEY, theme);
export const clearStoredThemePreference = () => writeStringPreference(THEME_PREFERENCE_STORAGE_KEY, null);

export const getStoredFontPreference = () => readStringPreference(FONT_PREFERENCE_STORAGE_KEY, 'font');
export const setStoredFontPreference = (font: string | null | undefined) =>
  writeStringPreference(FONT_PREFERENCE_STORAGE_KEY, font);
export const clearStoredFontPreference = () => writeStringPreference(FONT_PREFERENCE_STORAGE_KEY, null);

export const getStoredLanguagePreference = (): LanguageCode | null => {
  if (!canUseStorage()) {
    return null;
  }

  const currentValue = normalizeStoredString(getPreferenceStorage()?.getItem(LANGUAGE_PREFERENCE_STORAGE_KEY));
  if (currentValue) {
    return isLanguageCode(currentValue) ? currentValue : null;
  }

  const legacyValue = normalizeStoredString(readLegacyCustomization()?.language);
  if (legacyValue && isLanguageCode(legacyValue)) {
    getPreferenceStorage()?.setItem(LANGUAGE_PREFERENCE_STORAGE_KEY, legacyValue);
    return legacyValue;
  }

  return null;
};

export const setStoredLanguagePreference = (language: LanguageCode | null | undefined) =>
  writeStringPreference(LANGUAGE_PREFERENCE_STORAGE_KEY, language);
export const clearStoredLanguagePreference = () => writeStringPreference(LANGUAGE_PREFERENCE_STORAGE_KEY, null);
