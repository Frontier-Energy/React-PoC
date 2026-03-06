import { en } from './en';
import { es } from './es';

export const localTranslations = { en, es };

export type LanguageCode = keyof typeof localTranslations;
export type Labels = typeof en | typeof es;

export const defaultLanguage: LanguageCode = 'en';

export const isLanguageCode = (value: unknown): value is LanguageCode =>
  typeof value === 'string' && Object.prototype.hasOwnProperty.call(localTranslations, value);

export const getLocalTranslations = (language: LanguageCode): Labels =>
  localTranslations[language] ?? localTranslations.en;

export const getTranslations = getLocalTranslations;
