import { en } from './en';

export const translations = { en };

export type LanguageCode = keyof typeof translations;
export type Labels = typeof en;

export const defaultLanguage: LanguageCode = 'en';

export const isLanguageCode = (value: string): value is LanguageCode =>
  Object.prototype.hasOwnProperty.call(translations, value);

export const getTranslations = (language: LanguageCode): Labels => translations[language] ?? translations.en;

