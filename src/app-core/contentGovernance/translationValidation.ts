import { isLabels, type Labels, type LanguageCode } from '../resources/translations';
import { getFallbackLabels } from '../resources/translations/fallback';

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const mergeDeep = <T>(base: T, override: unknown): T => {
  if (!isPlainObject(base) || !isPlainObject(override)) {
    return (override ?? base) as T;
  }

  const result: Record<string, unknown> = { ...base };
  Object.entries(override).forEach(([key, value]) => {
    const baseValue = result[key];
    if (Array.isArray(value)) {
      result[key] = value;
      return;
    }
    if (isPlainObject(baseValue) && isPlainObject(value)) {
      result[key] = mergeDeep(baseValue, value);
      return;
    }
    result[key] = value;
  });

  return result as T;
};

const validateTranslationOverride = (override: unknown, baseline: unknown, path: string) => {
  if (override === undefined) {
    return;
  }
  if (typeof baseline === 'string') {
    if (typeof override !== 'string') {
      throw new Error(`${path} must be a string`);
    }
    return;
  }
  if (Array.isArray(baseline)) {
    if (!Array.isArray(override)) {
      throw new Error(`${path} must be an array`);
    }
    return;
  }
  if (!isPlainObject(baseline)) {
    throw new Error(`${path} baseline is not supported`);
  }
  if (!isPlainObject(override)) {
    throw new Error(`${path} must be an object`);
  }

  Object.keys(override).forEach((key) => {
    if (!(key in baseline)) {
      throw new Error(`${path}.${key} is not a supported translation key`);
    }
  });

  Object.entries(override).forEach(([key, value]) => {
    validateTranslationOverride(value, (baseline as Record<string, unknown>)[key], `${path}.${key}`);
  });
};

export const normalizeTranslations = (payload: unknown, language: LanguageCode): Labels => {
  const baseline = getFallbackLabels(language);
  validateTranslationOverride(payload, baseline, `translations.${language}`);
  const merged = mergeDeep(clone(baseline), payload);
  if (!isLabels(merged)) {
    throw new Error(`translations.${language} did not satisfy the full labels contract`);
  }
  return merged;
};

export const getBundledTranslations = (language: LanguageCode): Labels => clone(getFallbackLabels(language));
