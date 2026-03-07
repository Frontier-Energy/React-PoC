import {
  FONT_PREFERENCE_STORAGE_KEY,
  getStoredFontPreference,
  getStoredLanguagePreference,
  getStoredTenantPreference,
  getStoredThemePreference,
  LANGUAGE_PREFERENCE_STORAGE_KEY,
  LEGACY_CUSTOMIZATION_STORAGE_KEY,
  setStoredFontPreference,
  setStoredLanguagePreference,
  setStoredTenantPreference,
  setStoredThemePreference,
  TENANT_PREFERENCE_STORAGE_KEY,
  THEME_PREFERENCE_STORAGE_KEY,
} from './appPreferences';

describe('appPreferences', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('stores explicit preferences in separate keys', () => {
    setStoredTenantPreference('qhvac');
    setStoredThemePreference('harbor');
    setStoredFontPreference('Tahoma');
    setStoredLanguagePreference('es');

    expect(localStorage.getItem(TENANT_PREFERENCE_STORAGE_KEY)).toBe('qhvac');
    expect(localStorage.getItem(THEME_PREFERENCE_STORAGE_KEY)).toBe('harbor');
    expect(localStorage.getItem(FONT_PREFERENCE_STORAGE_KEY)).toBe('Tahoma');
    expect(localStorage.getItem(LANGUAGE_PREFERENCE_STORAGE_KEY)).toBe('es');
  });

  it('migrates values from the legacy customization blob on read', () => {
    localStorage.setItem(
      LEGACY_CUSTOMIZATION_STORAGE_KEY,
      JSON.stringify({
        tenantId: 'opscentral',
        theme: 'sand',
        font: 'Georgia',
        language: 'es',
      })
    );

    expect(getStoredTenantPreference()).toBe('opscentral');
    expect(getStoredThemePreference()).toBe('sand');
    expect(getStoredFontPreference()).toBe('Georgia');
    expect(getStoredLanguagePreference()).toBe('es');
    expect(localStorage.getItem(TENANT_PREFERENCE_STORAGE_KEY)).toBe('opscentral');
    expect(localStorage.getItem(THEME_PREFERENCE_STORAGE_KEY)).toBe('sand');
    expect(localStorage.getItem(FONT_PREFERENCE_STORAGE_KEY)).toBe('Georgia');
    expect(localStorage.getItem(LANGUAGE_PREFERENCE_STORAGE_KEY)).toBe('es');
  });

  it('ignores invalid legacy language values', () => {
    localStorage.setItem(LEGACY_CUSTOMIZATION_STORAGE_KEY, JSON.stringify({ language: 'fr' }));

    expect(getStoredLanguagePreference()).toBeNull();
    expect(localStorage.getItem(LANGUAGE_PREFERENCE_STORAGE_KEY)).toBeNull();
  });
});
