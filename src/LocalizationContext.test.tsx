import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { CUSTOMIZATION_STORAGE_KEY } from './config';
import { LocalizationProvider, useLocalization } from './LocalizationContext';

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
  });

  it('throws when useLocalization is used outside provider', () => {
    expect(() => render(<LocalizationProbe />)).toThrow(
      'useLocalization must be used within a LocalizationProvider'
    );
  });

  it('uses default language when no storage exists', () => {
    render(
      <LocalizationProvider>
        <LocalizationProbe />
      </LocalizationProvider>
    );

    expect(screen.getByTestId('language')).toHaveTextContent('en');
    expect(screen.getByRole('heading', { name: 'Inspection Forms' })).toBeInTheDocument();
    expect(localStorage.getItem(CUSTOMIZATION_STORAGE_KEY)).toBe(JSON.stringify({ language: 'en' }));
  });

  it('reads stored valid language and labels', () => {
    localStorage.setItem(CUSTOMIZATION_STORAGE_KEY, JSON.stringify({ language: 'es' }));

    render(
      <LocalizationProvider>
        <LocalizationProbe />
      </LocalizationProvider>
    );

    expect(screen.getByTestId('language')).toHaveTextContent('es');
    expect(screen.getByRole('heading', { name: 'Formularios de inspeccion' })).toBeInTheDocument();
  });

  it('falls back to default language for invalid stored values', () => {
    localStorage.setItem(CUSTOMIZATION_STORAGE_KEY, JSON.stringify({ language: 'fr' }));

    render(
      <LocalizationProvider>
        <LocalizationProbe />
      </LocalizationProvider>
    );

    expect(screen.getByTestId('language')).toHaveTextContent('en');
  });

  it('handles invalid JSON in initial storage', () => {
    localStorage.setItem(CUSTOMIZATION_STORAGE_KEY, '{invalid');

    render(
      <LocalizationProvider>
        <LocalizationProbe />
      </LocalizationProvider>
    );

    expect(screen.getByTestId('language')).toHaveTextContent('en');
    expect(localStorage.getItem(CUSTOMIZATION_STORAGE_KEY)).toBe(JSON.stringify({ language: 'en' }));
  });

  it('preserves existing customization fields when language changes', async () => {
    localStorage.setItem(
      CUSTOMIZATION_STORAGE_KEY,
      JSON.stringify({ tenantId: 'qhvac', theme: 'harbor', language: 'en' })
    );

    render(
      <LocalizationProvider>
        <LocalizationProbe />
      </LocalizationProvider>
    );

    fireEvent.click(screen.getByRole('button', { name: 'set-es' }));

    await waitFor(() => {
      expect(screen.getByTestId('language')).toHaveTextContent('es');
    });

    expect(JSON.parse(localStorage.getItem(CUSTOMIZATION_STORAGE_KEY) || '{}')).toMatchObject({
      tenantId: 'qhvac',
      theme: 'harbor',
      language: 'es',
    });
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
          key: CUSTOMIZATION_STORAGE_KEY,
          newValue: JSON.stringify({ language: 'es' }),
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
          newValue: JSON.stringify({ language: 'es' }),
        })
      );
      window.dispatchEvent(
        new StorageEvent('storage', {
          key: CUSTOMIZATION_STORAGE_KEY,
          newValue: '{invalid',
        })
      );
      window.dispatchEvent(
        new StorageEvent('storage', {
          key: CUSTOMIZATION_STORAGE_KEY,
          newValue: JSON.stringify({ language: 'fr' }),
        })
      );
    });

    await waitFor(() => {
      expect(screen.getByTestId('language')).toHaveTextContent('en');
    });
  });
});
