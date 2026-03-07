import {
  clearFontPreference,
  clearThemePreference,
  getAppPreferenceState,
  setFontPreference,
  setLanguagePreference,
  setSelectedTenantId,
  setThemePreference,
  subscribeToAppPreferenceState,
} from './appState';

describe('appState', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('reads the split preference state from explicit keys', () => {
    localStorage.setItem('appTenantPreference', 'qhvac');
    localStorage.setItem('appThemePreference', 'harbor');
    localStorage.setItem('appFontPreference', 'Tahoma');
    localStorage.setItem('appLanguagePreference', 'es');

    expect(getAppPreferenceState()).toEqual({
      tenantId: 'qhvac',
      theme: 'harbor',
      font: 'Tahoma',
      language: 'es',
    });
  });

  it('publishes same-tab change events for explicit preference updates', () => {
    const listener = vi.fn();
    const unsubscribe = subscribeToAppPreferenceState(listener);

    setSelectedTenantId('opscentral');
    setThemePreference('sand');
    setFontPreference('Georgia');
    setLanguagePreference('es');
    clearThemePreference();
    clearFontPreference();

    expect(listener).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: 'opscentral' }),
      ['tenantId']
    );
    expect(listener).toHaveBeenCalledWith(
      expect.objectContaining({ theme: 'sand' }),
      ['theme']
    );
    expect(listener).toHaveBeenCalledWith(
      expect.objectContaining({ font: 'Georgia' }),
      ['font']
    );
    expect(listener).toHaveBeenCalledWith(
      expect.objectContaining({ language: 'es' }),
      ['language']
    );
    expect(listener).toHaveBeenCalledWith(
      expect.objectContaining({ theme: null }),
      ['theme']
    );
    expect(listener).toHaveBeenCalledWith(
      expect.objectContaining({ font: null }),
      ['font']
    );

    unsubscribe();
  });

  it('maps storage events back to explicit preference fields', () => {
    const listener = vi.fn();
    const unsubscribe = subscribeToAppPreferenceState(listener);

    localStorage.setItem('appLanguagePreference', 'es');
    window.dispatchEvent(
      new StorageEvent('storage', {
        key: 'appLanguagePreference',
        newValue: 'es',
      })
    );

    expect(listener).toHaveBeenCalledWith(
      expect.objectContaining({ language: 'es' }),
      ['language']
    );

    unsubscribe();
  });

  it('maps tenant storage events and stops notifying after unsubscribe', () => {
    const listener = vi.fn();
    const unsubscribe = subscribeToAppPreferenceState(listener);

    window.dispatchEvent(
      new StorageEvent('storage', {
        key: 'appTenantPreference',
        newValue: 'tenant-b',
      })
    );

    expect(listener).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: 'tenant-b' }),
      ['tenantId']
    );

    unsubscribe();
    listener.mockClear();

    window.dispatchEvent(
      new StorageEvent('storage', {
        key: 'appTenantPreference',
        newValue: 'tenant-c',
      })
    );

    expect(listener).not.toHaveBeenCalled();
  });

  it('normalizes storage-event values and ignores unrelated keys', () => {
    const listener = vi.fn();
    const unsubscribe = subscribeToAppPreferenceState(listener);

    window.dispatchEvent(
      new StorageEvent('storage', {
        key: 'unrelated',
        newValue: 'value',
      })
    );

    window.dispatchEvent(
      new StorageEvent('storage', {
        key: 'appThemePreference',
        newValue: '  harbor  ',
      })
    );

    window.dispatchEvent(
      new StorageEvent('storage', {
        key: 'appFontPreference',
        newValue: '   ',
      })
    );

    window.dispatchEvent(
      new StorageEvent('storage', {
        key: 'appLanguagePreference',
        newValue: 'fr',
      })
    );

    expect(listener).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ theme: 'harbor' }),
      ['theme']
    );
    expect(listener).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ font: null }),
      ['font']
    );
    expect(listener).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({ language: null }),
      ['language']
    );

    unsubscribe();
  });

  it('no-ops when window is unavailable', () => {
    const originalWindow = globalThis.window;
    vi.stubGlobal('window', undefined);

    const listener = vi.fn();
    const unsubscribe = subscribeToAppPreferenceState(listener);

    setThemePreference('night');
    unsubscribe();

    expect(unsubscribe).toBeTypeOf('function');
    expect(listener).not.toHaveBeenCalled();

    vi.stubGlobal('window', originalWindow);
  });
});
