import { en } from './en';
import { es } from './es';

export const translations = { en, es };

export type LanguageCode = keyof typeof translations;
export type Labels = typeof en;

export const defaultLanguage: LanguageCode = 'en';

export const isLanguageCode = (value: string): value is LanguageCode =>
  Object.prototype.hasOwnProperty.call(translations, value);

export const getTranslations = (language: LanguageCode): Labels => translations[language] ?? translations.en;
