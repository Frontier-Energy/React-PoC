import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { fetchTranslations } from './apiContent';
import { defaultLanguage, isLanguageCode, type LanguageCode, type Labels } from './resources/translations';
import { CUSTOMIZATION_STORAGE_KEY } from './config';
import { getFallbackLabels } from './resources/translations/fallback';

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
  const stored = localStorage.getItem(CUSTOMIZATION_STORAGE_KEY);
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
  const [labels, setLabels] = useState<Labels>(() => getFallbackLabels(readStoredLanguage()));

  useEffect(() => {
    const stored = localStorage.getItem(CUSTOMIZATION_STORAGE_KEY);
    let existing: Record<string, unknown> = {};
    if (stored) {
      try {
        existing = JSON.parse(stored) as Record<string, unknown>;
      } catch (error) {
        existing = {};
      }
    }
    const updated = { ...existing, language };
    localStorage.setItem(CUSTOMIZATION_STORAGE_KEY, JSON.stringify(updated));
  }, [language]);

  useEffect(() => {
    let active = true;
    setLabels(getFallbackLabels(language));

    const load = async () => {
      try {
        const resolvedLabels = await fetchTranslations(language);
        if (active) {
          setLabels(resolvedLabels);
        }
      } catch (error) {
        if (active) {
          console.warn(`Failed to load translations for language "${language}". Falling back to bundled labels.`, error);
        }
      }
    };

    void load();

    return () => {
      active = false;
    };
  }, [language]);

  useEffect(() => {
    const handleStorage = (event: StorageEvent) => {
      if (event.key !== CUSTOMIZATION_STORAGE_KEY || !event.newValue) {
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
 
  const value = useMemo(() => ({ language, setLanguage, labels }), [language, labels]);

  return (
    <LocalizationContext.Provider value={value}>
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
