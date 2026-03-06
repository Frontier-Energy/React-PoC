import { getFormSchemaUrl, getTranslationsUrl } from './config';
import { isLabels, type Labels, type LanguageCode } from './resources/translations';
import type { FormSchema, FormType } from './types';

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

  return payload;
};
