import electricalSchemaAsset from '../.tmp-import-static/form-electrical.json';
import electricalSfSchemaAsset from '../.tmp-import-static/form-electrical-sf.json';
import hvacSchemaAsset from '../.tmp-import-static/form-hvac.json';
import safetyChecklistSchemaAsset from '../.tmp-import-static/form-safety-checklist.json';
import { type Labels, type LanguageCode } from './resources/translations';
import { FormType, type FormSchema } from './types';
import {
  cacheArtifact,
  clearCachedContentArtifacts,
  CONTENT_ARTIFACT_CACHE_STORAGE_KEY,
  readCachedArtifact,
} from './contentGovernance/cache';
import {
  assertRuntimeCompatibility,
  CONTENT_GOVERNANCE_SCHEMA_VERSION,
  CONTENT_RUNTIME_COMPATIBILITY_VERSION,
  unwrapContentEnvelope,
} from './contentGovernance/runtimeCompatibility';
import { normalizeFormSchema } from './contentGovernance/schemaValidation';
import { getBundledTranslations, normalizeTranslations } from './contentGovernance/translationValidation';

interface GovernedArtifactResult<T> {
  payload: T;
  source: 'network' | 'cache' | 'bundled';
}

const bundledFormSchemas: Record<FormType, unknown> = {
  [FormType.Electrical]: electricalSchemaAsset,
  [FormType.ElectricalSF]: electricalSfSchemaAsset,
  [FormType.HVAC]: hvacSchemaAsset,
  [FormType.SafetyChecklist]: safetyChecklistSchemaAsset,
};

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

export {
  clearCachedContentArtifacts,
  CONTENT_ARTIFACT_CACHE_STORAGE_KEY,
  CONTENT_GOVERNANCE_SCHEMA_VERSION,
  CONTENT_RUNTIME_COMPATIBILITY_VERSION,
  getBundledTranslations,
};

export const getBundledFormSchema = (formType: FormType): FormSchema =>
  normalizeFormSchema(clone(bundledFormSchemas[formType]), `bundled-form-schema.${formType}`);

export const resolveGovernedFormSchema = async (
  formType: FormType,
  loader: () => Promise<unknown>,
  tenantId?: string
): Promise<GovernedArtifactResult<FormSchema>> => {
  try {
    const rawPayload = await loader();
    const envelope = unwrapContentEnvelope<FormSchema>(rawPayload, 'schema');
    assertRuntimeCompatibility(envelope.compatibility, `Form schema "${formType}"`);
    const schema = normalizeFormSchema(envelope.payload, `form-schema.${formType}`);
    cacheArtifact(tenantId, 'form-schema', formType, schema, envelope.schemaVersion, envelope.artifactVersion);
    return { payload: schema, source: 'network' };
  } catch (error) {
    const cached = readCachedArtifact(tenantId, 'form-schema', formType, (payload) =>
      normalizeFormSchema(payload, `cached-form-schema.${formType}`)
    );
    if (cached) {
      console.warn(`Falling back to cached form schema for "${formType}".`, error);
      return { payload: cached, source: 'cache' };
    }

    console.warn(`Falling back to bundled form schema for "${formType}".`, error);
    return { payload: getBundledFormSchema(formType), source: 'bundled' };
  }
};

export const resolveGovernedTranslations = async (
  language: LanguageCode,
  loader: () => Promise<unknown>,
  tenantId?: string
): Promise<GovernedArtifactResult<Labels>> => {
  try {
    const rawPayload = await loader();
    const envelope = unwrapContentEnvelope<Partial<Labels>>(rawPayload, 'labels');
    assertRuntimeCompatibility(envelope.compatibility, `Translations "${language}"`);
    const labels = normalizeTranslations(envelope.payload, language);
    cacheArtifact(tenantId, 'translations', language, labels, envelope.schemaVersion, envelope.artifactVersion);
    return { payload: labels, source: 'network' };
  } catch (error) {
    const cached = readCachedArtifact(tenantId, 'translations', language, (payload) =>
      normalizeTranslations(payload, language)
    );
    if (cached) {
      console.warn(`Falling back to cached translations for "${language}".`, error);
      return { payload: cached, source: 'cache' };
    }

    console.warn(`Falling back to bundled translations for "${language}".`, error);
    return { payload: getBundledTranslations(language), source: 'bundled' };
  }
};
