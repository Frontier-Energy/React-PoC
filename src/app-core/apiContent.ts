import { apiFetch } from './apiClient';
import { getFormSchemaUrl, getTranslationsUrl } from './config';
import type { FormSchemaPayloadDto, TranslationsPayloadDto } from './contracts/backend';
import { type Labels, type LanguageCode } from './resources/translations';
import { resolveGovernedFormSchema, resolveGovernedTranslations } from './contentGovernance';
import type { FormSchema, FormType } from './types';

export const fetchFormSchema = async (formType: FormType): Promise<FormSchema> => {
  const result = await resolveGovernedFormSchema(formType, async () => {
    const response = await apiFetch(getFormSchemaUrl(formType));
    if (!response.ok) {
      throw new Error(`Form schema request failed with status ${response.status}`);
    }

    return (await response.json()) as FormSchemaPayloadDto;
  });

  return result.payload;
};

export const fetchTranslations = async (language: LanguageCode): Promise<Labels> => {
  const result = await resolveGovernedTranslations(language, async () => {
    const response = await apiFetch(getTranslationsUrl(language));
    if (!response.ok) {
      throw new Error(`Translations request failed with status ${response.status}`);
    }

    return (await response.json()) as TranslationsPayloadDto;
  });

  return result.payload;
};
