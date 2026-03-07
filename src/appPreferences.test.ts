import {
  clearStoredFontPreference,
  clearStoredLanguagePreference,
  clearStoredTenantPreference,
  clearStoredThemePreference,
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

  it('normalizes values, clears preferences, and prefers explicit values over legacy ones', () => {
    localStorage.setItem(
      LEGACY_CUSTOMIZATION_STORAGE_KEY,
      JSON.stringify({
        tenantId: 'legacy-tenant',
        theme: 'legacy-theme',
        font: 'legacy-font',
        language: 'es',
      })
    );

    setStoredTenantPreference('  explicit-tenant  ');
    setStoredThemePreference('   ');
    setStoredFontPreference('  Tahoma  ');
    setStoredLanguagePreference('en');

    expect(getStoredTenantPreference()).toBe('explicit-tenant');
    expect(getStoredThemePreference()).toBe('legacy-theme');
    expect(getStoredFontPreference()).toBe('Tahoma');
    expect(getStoredLanguagePreference()).toBe('en');

    clearStoredTenantPreference();
    clearStoredThemePreference();
    clearStoredFontPreference();
    clearStoredLanguagePreference();

    expect(localStorage.getItem(TENANT_PREFERENCE_STORAGE_KEY)).toBeNull();
    expect(localStorage.getItem(THEME_PREFERENCE_STORAGE_KEY)).toBeNull();
    expect(localStorage.getItem(FONT_PREFERENCE_STORAGE_KEY)).toBeNull();
    expect(localStorage.getItem(LANGUAGE_PREFERENCE_STORAGE_KEY)).toBeNull();
  });

  it('returns null for malformed legacy customization and no-ops without window', () => {
    localStorage.setItem(LEGACY_CUSTOMIZATION_STORAGE_KEY, '{invalid');

    expect(getStoredTenantPreference()).toBeNull();
    expect(getStoredThemePreference()).toBeNull();
    expect(getStoredFontPreference()).toBeNull();

    const originalWindow = globalThis.window;
    vi.stubGlobal('window', undefined);

    expect(getStoredTenantPreference()).toBeNull();
    expect(getStoredLanguagePreference()).toBeNull();

    setStoredTenantPreference('tenant');
    setStoredThemePreference('theme');
    setStoredFontPreference('font');
    setStoredLanguagePreference('es');

    vi.stubGlobal('window', originalWindow);
  });
});
