import {
  clearStoredFontPreference,
  clearStoredThemePreference,
  getStoredFontPreference,
  getStoredLanguagePreference,
  getStoredTenantPreference,
  getStoredThemePreference,
  LANGUAGE_PREFERENCE_STORAGE_KEY,
  setStoredFontPreference,
  setStoredLanguagePreference,
  setStoredTenantPreference,
  setStoredThemePreference,
  TENANT_PREFERENCE_STORAGE_KEY,
  THEME_PREFERENCE_STORAGE_KEY,
  FONT_PREFERENCE_STORAGE_KEY,
} from './appPreferences';
import { isLanguageCode, type LanguageCode } from './resources/translations';

export interface AppPreferenceState {
  tenantId: string | null;
  theme: string | null;
  font: string | null;
  language: LanguageCode | null;
}

export type AppPreferenceKey = keyof AppPreferenceState;

const APP_PREFERENCES_CHANGED_EVENT = 'app-preferences-changed';

interface AppPreferencesChangedDetail {
  changedKeys: AppPreferenceKey[];
  state: AppPreferenceState;
}

const canUseWindow = () => typeof window !== 'undefined';
const normalizeStoredString = (value: string | null | undefined) => {
  const normalized = value?.trim();
  return normalized ? normalized : null;
};

const readState = (): AppPreferenceState => ({
  tenantId: getStoredTenantPreference(),
  theme: getStoredThemePreference(),
  font: getStoredFontPreference(),
  language: getStoredLanguagePreference(),
});

const storageKeyToPreferenceKey = (storageKey: string | null): AppPreferenceKey | null => {
  switch (storageKey) {
    case TENANT_PREFERENCE_STORAGE_KEY:
      return 'tenantId';
    case THEME_PREFERENCE_STORAGE_KEY:
      return 'theme';
    case FONT_PREFERENCE_STORAGE_KEY:
      return 'font';
    case LANGUAGE_PREFERENCE_STORAGE_KEY:
      return 'language';
    default:
      return null;
  }
};

const emitChange = (changedKeys: AppPreferenceKey[]) => {
  if (!canUseWindow()) {
    return;
  }

  window.dispatchEvent(
    new CustomEvent<AppPreferencesChangedDetail>(APP_PREFERENCES_CHANGED_EVENT, {
      detail: {
        changedKeys,
        state: readState(),
      },
    })
  );
};

export const getAppPreferenceState = (): AppPreferenceState => readState();

export const subscribeToAppPreferenceState = (
  listener: (state: AppPreferenceState, changedKeys: AppPreferenceKey[]) => void
) => {
  if (!canUseWindow()) {
    return () => {};
  }

  const handleCustomChange = (event: Event) => {
    const customEvent = event as CustomEvent<AppPreferencesChangedDetail>;
    listener(customEvent.detail.state, customEvent.detail.changedKeys);
  };

  const handleStorage = (event: StorageEvent) => {
    const changedKey = storageKeyToPreferenceKey(event.key);
    if (!changedKey) {
      return;
    }

    const currentState = readState();
    const nextValue = normalizeStoredString(event.newValue);

    if (changedKey === 'language') {
      listener(
        {
          ...currentState,
          language: nextValue && isLanguageCode(nextValue) ? nextValue : null,
        },
        [changedKey]
      );
      return;
    }

    listener(
      {
        ...currentState,
        [changedKey]: nextValue,
      },
      [changedKey]
    );
  };

  window.addEventListener(APP_PREFERENCES_CHANGED_EVENT, handleCustomChange as EventListener);
  window.addEventListener('storage', handleStorage);

  return () => {
    window.removeEventListener(APP_PREFERENCES_CHANGED_EVENT, handleCustomChange as EventListener);
    window.removeEventListener('storage', handleStorage);
  };
};

export const setSelectedTenantId = (tenantId: string) => {
  setStoredTenantPreference(tenantId);
  emitChange(['tenantId']);
};

export const setThemePreference = (theme: string) => {
  setStoredThemePreference(theme);
  emitChange(['theme']);
};

export const clearThemePreference = () => {
  clearStoredThemePreference();
  emitChange(['theme']);
};

export const setFontPreference = (font: string) => {
  setStoredFontPreference(font);
  emitChange(['font']);
};

export const clearFontPreference = () => {
  clearStoredFontPreference();
  emitChange(['font']);
};

export const setLanguagePreference = (language: LanguageCode) => {
  setStoredLanguagePreference(language);
  emitChange(['language']);
};
