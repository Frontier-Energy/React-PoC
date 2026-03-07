import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import {
  LANGUAGE_PREFERENCE_STORAGE_KEY,
  LEGACY_CUSTOMIZATION_STORAGE_KEY,
  TENANT_PREFERENCE_STORAGE_KEY,
  THEME_PREFERENCE_STORAGE_KEY,
} from './appPreferences';
import { LocalizationProvider, useLocalization } from './LocalizationContext';
import type { Labels } from './resources/translations';
import { getFallbackLabels } from './resources/translations/fallback';

const makeLabels = (language: 'en' | 'es'): Labels =>
  ({
    ...getFallbackLabels(language),
    languageName: language === 'en' ? 'English' : 'Espanol',
    home: {
      title: language === 'en' ? 'Inspection Forms' : 'Formularios de inspeccion',
    },
    common: {
      loading: language === 'en' ? 'Loading...' : 'Cargando...',
    },
  } as unknown as Labels);

function LocalizationProbe() {
  const { language, labels, setLanguage } = useLocalization();
  return (
    <div>
      <div data-testid="language">{language}</div>
      <h1>{labels.home.title}</h1>
      <button type="button" onClick={() => setLanguage('es')}>
        set-es
      </button>
    </div>
  );
}

describe('LocalizationContext', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      const language = url.endsWith('/translations/es') ? 'es' : 'en';
      return Promise.resolve(
        new Response(JSON.stringify(makeLabels(language)), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      );
    }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('throws when useLocalization is used outside provider', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(() => render(<LocalizationProbe />)).toThrow('useLocalization must be used within a LocalizationProvider');
    expect(errorSpy).toHaveBeenCalled();
  });

  it('uses default language when no storage exists', () => {
    render(
      <LocalizationProvider>
        <LocalizationProbe />
      </LocalizationProvider>
    );

    return waitFor(() => {
      expect(screen.getByTestId('language')).toHaveTextContent('en');
      expect(screen.getByRole('heading', { name: 'Inspection Forms' })).toBeInTheDocument();
      expect(localStorage.getItem(LANGUAGE_PREFERENCE_STORAGE_KEY)).toBe('en');
    });
  });

  it('reads stored valid language and labels', () => {
    localStorage.setItem(LANGUAGE_PREFERENCE_STORAGE_KEY, 'es');

    render(
      <LocalizationProvider>
        <LocalizationProbe />
      </LocalizationProvider>
    );

    return waitFor(() => {
      expect(screen.getByTestId('language')).toHaveTextContent('es');
      expect(screen.getByRole('heading', { name: 'Formularios de inspeccion' })).toBeInTheDocument();
    });
  });

  it('falls back to default language for invalid stored values', () => {
    localStorage.setItem(LANGUAGE_PREFERENCE_STORAGE_KEY, 'fr');

    render(
      <LocalizationProvider>
        <LocalizationProbe />
      </LocalizationProvider>
    );

    return waitFor(() => {
      expect(screen.getByTestId('language')).toHaveTextContent('en');
    });
  });

  it('handles invalid legacy customization in initial storage', () => {
    localStorage.setItem(LEGACY_CUSTOMIZATION_STORAGE_KEY, '{invalid');

    render(
      <LocalizationProvider>
        <LocalizationProbe />
      </LocalizationProvider>
    );

    return waitFor(() => {
      expect(screen.getByTestId('language')).toHaveTextContent('en');
      expect(localStorage.getItem(LANGUAGE_PREFERENCE_STORAGE_KEY)).toBe('en');
    });
  });

  it('updates only the language preference when language changes', async () => {
    localStorage.setItem(TENANT_PREFERENCE_STORAGE_KEY, 'qhvac');
    localStorage.setItem(THEME_PREFERENCE_STORAGE_KEY, 'harbor');
    localStorage.setItem(LANGUAGE_PREFERENCE_STORAGE_KEY, 'en');

    render(
      <LocalizationProvider>
        <LocalizationProbe />
      </LocalizationProvider>
    );

    await screen.findByRole('button', { name: 'set-es' });
    fireEvent.click(screen.getByRole('button', { name: 'set-es' }));

    await waitFor(() => {
      expect(screen.getByTestId('language')).toHaveTextContent('es');
    });

    expect(localStorage.getItem(TENANT_PREFERENCE_STORAGE_KEY)).toBe('qhvac');
    expect(localStorage.getItem(THEME_PREFERENCE_STORAGE_KEY)).toBe('harbor');
    expect(localStorage.getItem(LANGUAGE_PREFERENCE_STORAGE_KEY)).toBe('es');
  });

  it('updates language from storage events with valid data', async () => {
    render(
      <LocalizationProvider>
        <LocalizationProbe />
      </LocalizationProvider>
    );

    act(() => {
      window.dispatchEvent(
        new StorageEvent('storage', {
          key: LANGUAGE_PREFERENCE_STORAGE_KEY,
          newValue: 'es',
        })
      );
    });

    await waitFor(() => {
      expect(screen.getByTestId('language')).toHaveTextContent('es');
    });
  });

  it('ignores unrelated and invalid storage events', async () => {
    render(
      <LocalizationProvider>
        <LocalizationProbe />
      </LocalizationProvider>
    );

    act(() => {
      window.dispatchEvent(
        new StorageEvent('storage', {
          key: 'other-key',
          newValue: 'es',
        })
      );
      window.dispatchEvent(
        new StorageEvent('storage', {
          key: LANGUAGE_PREFERENCE_STORAGE_KEY,
          newValue: '{invalid',
        })
      );
      window.dispatchEvent(
        new StorageEvent('storage', {
          key: LANGUAGE_PREFERENCE_STORAGE_KEY,
          newValue: 'fr',
        })
      );
    });

    await waitFor(() => {
      expect(screen.getByTestId('language')).toHaveTextContent('en');
    });
  });

  it('renders bundled fallback labels when translation fetch fails', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('network down'))));

    render(
      <LocalizationProvider>
        <LocalizationProbe />
      </LocalizationProvider>
    );

    expect(screen.getByTestId('language')).toHaveTextContent('en');
    expect(screen.getByRole('heading', { name: 'Inspection Forms' })).toBeInTheDocument();

    await waitFor(() => {
      expect(warnSpy).toHaveBeenCalled();
    });
  });
});
