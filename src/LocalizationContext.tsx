import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { fetchTranslations } from './apiContent';
import { defaultLanguage, isLanguageCode, type LanguageCode, type Labels } from './resources/translations';
import {
  getStoredLanguagePreference,
  LANGUAGE_PREFERENCE_STORAGE_KEY,
  setStoredLanguagePreference,
} from './appPreferences';
import { getFallbackLabels } from './resources/translations/fallback';

interface LocalizationContextValue {
  language: LanguageCode;
  setLanguage: (language: LanguageCode) => void;
  labels: Labels;
}

const LocalizationContext = createContext<LocalizationContextValue | undefined>(undefined);

const readStoredLanguage = (): LanguageCode => {
  return getStoredLanguagePreference() ?? defaultLanguage;
};

export function LocalizationProvider({ children }: { children: ReactNode }) {
  const [language, setLanguage] = useState<LanguageCode>(() => readStoredLanguage());
  const [labels, setLabels] = useState<Labels>(() => getFallbackLabels(readStoredLanguage()));

  useEffect(() => {
    setStoredLanguagePreference(language);
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
      if (event.key !== LANGUAGE_PREFERENCE_STORAGE_KEY) {
        return;
      }
      if (!event.newValue) {
        setLanguage(defaultLanguage);
        return;
      }
      if (isLanguageCode(event.newValue)) {
        setLanguage(event.newValue);
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
