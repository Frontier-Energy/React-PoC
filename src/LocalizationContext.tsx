import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { defaultLanguage, getTranslations, isLanguageCode, type LanguageCode, type Labels } from './resources/translations';

interface LocalizationContextValue {
  language: LanguageCode;
  setLanguage: (language: LanguageCode) => void;
  labels: Labels;
}

const LocalizationContext = createContext<LocalizationContextValue | undefined>(undefined);

const readStoredLanguage = (): LanguageCode => {
  if (typeof window === 'undefined') {
    return defaultLanguage;
  }
  const stored = localStorage.getItem('appCustomization');
  if (!stored) {
    return defaultLanguage;
  }
  try {
    const parsed = JSON.parse(stored) as { language?: string };
    if (parsed.language && isLanguageCode(parsed.language)) {
      return parsed.language;
    }
  } catch (error) {
    // Fall back to default language.
  }
  return defaultLanguage;
};

export function LocalizationProvider({ children }: { children: ReactNode }) {
  const [language, setLanguage] = useState<LanguageCode>(() => readStoredLanguage());

  useEffect(() => {
    const stored = localStorage.getItem('appCustomization');
    let existing: Record<string, unknown> = {};
    if (stored) {
      try {
        existing = JSON.parse(stored) as Record<string, unknown>;
      } catch (error) {
        existing = {};
      }
    }
    const updated = { ...existing, language };
    localStorage.setItem('appCustomization', JSON.stringify(updated));
  }, [language]);

  useEffect(() => {
    const handleStorage = (event: StorageEvent) => {
      if (event.key !== 'appCustomization' || !event.newValue) {
        return;
      }
      try {
        const parsed = JSON.parse(event.newValue) as { language?: string };
        if (parsed.language && isLanguageCode(parsed.language)) {
          setLanguage(parsed.language);
        }
      } catch (error) {
        // Ignore invalid storage data.
      }
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  const labels = useMemo(() => getTranslations(language), [language]);

  return (
    <LocalizationContext.Provider value={{ language, setLanguage, labels }}>
      {children}
    </LocalizationContext.Provider>
  );
}

export function useLocalization() {
  const context = useContext(LocalizationContext);
  if (!context) {
    throw new Error('useLocalization must be used within a LocalizationProvider');
  }
  return context;
}

