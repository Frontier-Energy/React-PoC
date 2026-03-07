import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { fetchTranslations } from './apiContent';
import { defaultLanguage, isLanguageCode, type LanguageCode, type Labels } from './resources/translations';
import { getAppPreferenceState, setLanguagePreference, subscribeToAppPreferenceState } from './appState';
import { getFallbackLabels } from './resources/translations/fallback';

interface LocalizationContextValue {
  language: LanguageCode;
  setLanguage: (language: LanguageCode) => void;
  labels: Labels;
}

const LocalizationContext = createContext<LocalizationContextValue | undefined>(undefined);

const readStoredLanguage = (): LanguageCode => {
  return getAppPreferenceState().language ?? defaultLanguage;
};

export function LocalizationProvider({ children }: { children: ReactNode }) {
  const [language, setLanguage] = useState<LanguageCode>(() => readStoredLanguage());
  const [labels, setLabels] = useState<Labels>(() => getFallbackLabels(readStoredLanguage()));
  const updateLanguage = useCallback((nextLanguage: LanguageCode) => {
    setLanguagePreference(nextLanguage);
  }, []);

  useEffect(() => {
    if (getAppPreferenceState().language !== language) {
      setLanguagePreference(language);
    }
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
    return subscribeToAppPreferenceState((state, changedKeys) => {
      if (!changedKeys.includes('language')) {
        return;
      }

      if (!state.language) {
        setLanguage(defaultLanguage);
        return;
      }

      if (isLanguageCode(state.language)) {
        setLanguage(state.language);
      }
    });
  }, []);

  const value = useMemo(() => ({ language, setLanguage: updateLanguage, labels }), [language, labels, updateLanguage]);

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
