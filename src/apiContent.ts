import { getFormSchemaUrl, getTranslationsUrl } from './config';
import { isLabels, type Labels, type LanguageCode } from './resources/translations';
import { getFallbackLabels } from './resources/translations/fallback';
import type { FormSchema, FormType } from './types';

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

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

export const fetchFormSchema = async (formType: FormType): Promise<FormSchema> => {
  const response = await fetch(getFormSchemaUrl(formType));
  if (!response.ok) {
    throw new Error(`Form schema request failed with status ${response.status}`);
  }

  const payload = (await response.json()) as Partial<FormSchema>;
  if (!payload.formName || !Array.isArray(payload.sections)) {
    throw new Error('Form schema response is missing required fields');
  }

  return {
    formName: payload.formName,
    sections: payload.sections,
    uploadStatus: payload.uploadStatus,
  } as FormSchema;
};

export const fetchTranslations = async (language: LanguageCode): Promise<Labels> => {
  const response = await fetch(getTranslationsUrl(language));
  if (!response.ok) {
    throw new Error(`Translations request failed with status ${response.status}`);
  }

  const payload = await response.json();
  if (!isLabels(payload)) {
    throw new Error('Translations response is missing required fields');
  }

  return mergeDeep(getFallbackLabels(language), payload);
};
