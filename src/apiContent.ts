import { getFormSchemaUrl, getTranslationsUrl } from './config';
import { getLocalTranslations, type Labels, type LanguageCode } from './resources/translations';
import type { FormSchema, FormType } from './types';

interface TranslationAppResponse {
  title?: string;
  poweredBy?: string;
  brand?: string;
}

interface TranslationsResponse {
  languageName?: string;
  app?: TranslationAppResponse;
}

const loadLocalFormSchema = async (formType: FormType): Promise<FormSchema> => {
  const schemaModule = await import(`./resources/${formType}.json`);
  return schemaModule.default as FormSchema;
};

export const fetchFormSchema = async (formType: FormType): Promise<FormSchema> => {
  try {
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
  } catch {
    return loadLocalFormSchema(formType);
  }
};

export const fetchTranslations = async (language: LanguageCode): Promise<Labels> => {
  const localLabels = getLocalTranslations(language);

  try {
    const response = await fetch(getTranslationsUrl(language));
    if (!response.ok) {
      throw new Error(`Translations request failed with status ${response.status}`);
    }

    const payload = (await response.json()) as TranslationsResponse;
    return {
      ...localLabels,
      languageName: payload.languageName || localLabels.languageName,
      app: {
        ...localLabels.app,
        ...payload.app,
      },
    } as Labels;
  } catch {
    return localLabels;
  }
};
