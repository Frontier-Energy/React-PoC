import { en } from './en';
import { es } from './es';

export const translations = { en, es };

export type LanguageCode = keyof typeof translations;
export type Labels = typeof en | typeof es;

export const defaultLanguage: LanguageCode = 'en';

export const isLanguageCode = (value: unknown): value is LanguageCode =>
  typeof value === 'string' && Object.prototype.hasOwnProperty.call(translations, value);

export const getTranslations = (language: LanguageCode): Labels => translations[language] ?? translations.en;
