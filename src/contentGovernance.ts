import electricalSchemaAsset from '../.tmp-import-static/form-electrical.json';
import electricalSfSchemaAsset from '../.tmp-import-static/form-electrical-sf.json';
import hvacSchemaAsset from '../.tmp-import-static/form-hvac.json';
import safetyChecklistSchemaAsset from '../.tmp-import-static/form-safety-checklist.json';
import { getActiveTenant } from './config';
import { getFallbackLabels } from './resources/translations/fallback';
import { isLabels, type Labels, type LanguageCode } from './resources/translations';
import {
  FormType,
  UploadStatus,
  type ConditionalVisibility,
  type FormField,
  type FormFieldOption,
  type FormSchema,
  type FormSection,
  type ValidationRule,
} from './types';

export const CONTENT_GOVERNANCE_SCHEMA_VERSION = '2026-03-09';
export const CONTENT_RUNTIME_COMPATIBILITY_VERSION = 1;
export const CONTENT_ARTIFACT_CACHE_STORAGE_KEY = 'tenantContentArtifactCache';

type ContentKind = 'form-schema' | 'translations';

interface RuntimeCompatibilityEnvelope {
  minRuntimeVersion?: number;
  maxRuntimeVersion?: number;
}

interface ContentEnvelope<T> {
  schemaVersion?: string;
  artifactVersion?: string;
  compatibility?: RuntimeCompatibilityEnvelope;
  schema?: T;
  labels?: T;
}

interface CachedContentArtifactRecord {
  tenantId: string;
  kind: ContentKind;
  subject: string;
  schemaVersion: string;
  artifactVersion: string;
  cachedAt: string;
  payload: unknown;
}

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

const FORM_FIELD_TYPES = new Set<FormField['type']>([
  'text',
  'number',
  'checkbox',
  'radio',
  'select',
  'multiselect',
  'textarea',
  'file',
  'signature',
]);
const VALIDATION_RULE_TYPES = new Set<ValidationRule['type']>([
  'minLength',
  'maxLength',
  'min',
  'max',
  'pattern',
  'custom',
]);
const VISIBILITY_OPERATORS = new Set<NonNullable<ConditionalVisibility['operator']>>([
  'equals',
  'notEquals',
  'contains',
  'greaterThan',
  'lessThan',
]);
const OPTION_FIELD_TYPES = new Set<FormField['type']>(['radio', 'select', 'multiselect']);
const FILE_FIELD_TYPES = new Set<FormField['type']>(['file']);
const UPLOAD_STATUSES = new Set<UploadStatus>(Object.values(UploadStatus));

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

const normalizeTenantId = (tenantId?: string) => (tenantId?.trim().toLowerCase() || getActiveTenant().tenantId.toLowerCase());
const buildCacheKey = (tenantId: string, kind: ContentKind, subject: string) => `${tenantId}::${kind}::${subject}`;

const unwrapContentEnvelope = <T>(payload: unknown, valueKey: 'schema' | 'labels') => {
  if (!isPlainObject(payload)) {
    return {
      artifactVersion: 'legacy',
      schemaVersion: CONTENT_GOVERNANCE_SCHEMA_VERSION,
      compatibility: undefined,
      payload,
    };
  }

  const envelope = payload as ContentEnvelope<T>;
  if (!(valueKey in envelope)) {
    return {
      artifactVersion: 'legacy',
      schemaVersion: CONTENT_GOVERNANCE_SCHEMA_VERSION,
      compatibility: undefined,
      payload,
    };
  }

  return {
    artifactVersion: typeof envelope.artifactVersion === 'string' && envelope.artifactVersion.trim()
      ? envelope.artifactVersion.trim()
      : 'legacy',
    schemaVersion: typeof envelope.schemaVersion === 'string' && envelope.schemaVersion.trim()
      ? envelope.schemaVersion.trim()
      : CONTENT_GOVERNANCE_SCHEMA_VERSION,
    compatibility: isPlainObject(envelope.compatibility) ? envelope.compatibility : undefined,
    payload: envelope[valueKey],
  };
};

const assertRuntimeCompatibility = (compatibility: RuntimeCompatibilityEnvelope | undefined, subject: string) => {
  if (!compatibility) {
    return;
  }

  const min = compatibility.minRuntimeVersion;
  const max = compatibility.maxRuntimeVersion;
  if (min !== undefined && (!Number.isInteger(min) || min > CONTENT_RUNTIME_COMPATIBILITY_VERSION)) {
    throw new Error(`${subject} requires runtime version ${String(min)} or newer`);
  }
  if (max !== undefined && (!Number.isInteger(max) || max < CONTENT_RUNTIME_COMPATIBILITY_VERSION)) {
    throw new Error(`${subject} only supports runtime version ${String(max)} or older`);
  }
};

const assertString = (value: unknown, path: string, options?: { allowEmpty?: boolean }) => {
  if (typeof value !== 'string') {
    throw new Error(`${path} must be a string`);
  }
  if (!options?.allowEmpty && value.trim().length === 0) {
    throw new Error(`${path} must not be empty`);
  }
};

const assertBoolean = (value: unknown, path: string) => {
  if (typeof value !== 'boolean') {
    throw new Error(`${path} must be a boolean`);
  }
};

const validateOption = (option: unknown, path: string): FormFieldOption => {
  if (!isPlainObject(option)) {
    throw new Error(`${path} must be an object`);
  }
  assertString(option.label, `${path}.label`);
  assertString(option.value, `${path}.value`);
  return {
    label: option.label as string,
    value: option.value as string,
  };
};

const validateRule = (rule: unknown, path: string): ValidationRule => {
  if (!isPlainObject(rule)) {
    throw new Error(`${path} must be an object`);
  }
  if (typeof rule.type !== 'string' || !VALIDATION_RULE_TYPES.has(rule.type as ValidationRule['type'])) {
    throw new Error(`${path}.type is not supported`);
  }
  assertString(rule.message, `${path}.message`);
  if (rule.value !== undefined && typeof rule.value !== 'string' && typeof rule.value !== 'number') {
    throw new Error(`${path}.value must be a string or number`);
  }

  return {
    type: rule.type as ValidationRule['type'],
    value: rule.value as string | number | undefined,
    message: rule.message as string,
  };
};

const validateVisibilityRule = (rule: unknown, path: string): ConditionalVisibility => {
  if (!isPlainObject(rule)) {
    throw new Error(`${path} must be an object`);
  }
  assertString(rule.fieldId, `${path}.fieldId`);
  if (
    typeof rule.value !== 'string'
    && typeof rule.value !== 'boolean'
    && !(Array.isArray(rule.value) && rule.value.every((entry) => typeof entry === 'string'))
  ) {
    throw new Error(`${path}.value must be a string, boolean, or string array`);
  }
  if (
    rule.operator !== undefined
    && (typeof rule.operator !== 'string' || !VISIBILITY_OPERATORS.has(rule.operator as NonNullable<ConditionalVisibility['operator']>))
  ) {
    throw new Error(`${path}.operator is not supported`);
  }

  return {
    fieldId: rule.fieldId as string,
    value: rule.value as ConditionalVisibility['value'],
    operator: rule.operator as ConditionalVisibility['operator'],
  };
};

const validateField = (
  field: unknown,
  path: string,
  fieldIds: Set<string>,
  externalIds: Set<string>
): FormField => {
  if (!isPlainObject(field)) {
    throw new Error(`${path} must be an object`);
  }
  assertString(field.id, `${path}.id`);
  const fieldId = field.id as string;
  if (fieldIds.has(fieldId)) {
    throw new Error(`Duplicate field id "${fieldId}"`);
  }
  fieldIds.add(fieldId);
  assertString(field.label, `${path}.label`);
  if (typeof field.type !== 'string' || !FORM_FIELD_TYPES.has(field.type as FormField['type'])) {
    throw new Error(`${path}.type is not supported`);
  }
  assertBoolean(field.required, `${path}.required`);

  if (field.externalID !== undefined) {
    assertString(field.externalID, `${path}.externalID`);
    const externalId = field.externalID as string;
    if (externalIds.has(externalId)) {
      throw new Error(`Duplicate external field id "${externalId}"`);
    }
    externalIds.add(externalId);
  }
  if (field.placeholder !== undefined) {
    assertString(field.placeholder, `${path}.placeholder`, { allowEmpty: true });
  }
  if (field.description !== undefined) {
    assertString(field.description, `${path}.description`, { allowEmpty: true });
  }
  if (field.options !== undefined) {
    if (!OPTION_FIELD_TYPES.has(field.type as FormField['type'])) {
      throw new Error(`${path}.options are only supported for choice fields`);
    }
    if (!Array.isArray(field.options) || field.options.length === 0) {
      throw new Error(`${path}.options must be a non-empty array`);
    }
  }
  if (field.options === undefined && OPTION_FIELD_TYPES.has(field.type as FormField['type'])) {
    throw new Error(`${path}.options are required for choice fields`);
  }
  if (field.accept !== undefined) {
    if (!FILE_FIELD_TYPES.has(field.type as FormField['type'])) {
      throw new Error(`${path}.accept is only supported for file fields`);
    }
    assertString(field.accept, `${path}.accept`, { allowEmpty: true });
  }
  if (field.multiple !== undefined) {
    if (!FILE_FIELD_TYPES.has(field.type as FormField['type'])) {
      throw new Error(`${path}.multiple is only supported for file fields`);
    }
    assertBoolean(field.multiple, `${path}.multiple`);
  }
  if (field.capture !== undefined && field.capture !== 'user' && field.capture !== 'environment') {
    throw new Error(`${path}.capture is not supported`);
  }

  return {
    id: fieldId,
    label: field.label as string,
    type: field.type as FormField['type'],
    required: field.required as boolean,
    externalID: field.externalID as string | undefined,
    options: Array.isArray(field.options)
      ? field.options.map((option, index) => validateOption(option, `${path}.options[${index}]`))
      : undefined,
    placeholder: field.placeholder as string | undefined,
    description: field.description as string | undefined,
    validationRules: Array.isArray(field.validationRules)
      ? field.validationRules.map((rule, index) => validateRule(rule, `${path}.validationRules[${index}]`))
      : undefined,
    visibleWhen: Array.isArray(field.visibleWhen)
      ? field.visibleWhen.map((rule, index) => validateVisibilityRule(rule, `${path}.visibleWhen[${index}]`))
      : undefined,
    accept: field.accept as string | undefined,
    multiple: field.multiple as boolean | undefined,
    capture: field.capture as FormField['capture'],
  };
};

const validateSection = (
  section: unknown,
  path: string,
  fieldIds: Set<string>,
  externalIds: Set<string>
): FormSection => {
  if (!isPlainObject(section)) {
    throw new Error(`${path} must be an object`);
  }
  assertString(section.title, `${path}.title`);
  if (!Array.isArray(section.fields)) {
    throw new Error(`${path}.fields must be an array`);
  }

  return {
    title: section.title as string,
    fields: section.fields.map((field, index) => validateField(field, `${path}.fields[${index}]`, fieldIds, externalIds)),
  };
};

const normalizeFormSchema = (payload: unknown, subject: string): FormSchema => {
  if (!isPlainObject(payload)) {
    throw new Error(`${subject} must be an object`);
  }
  assertString(payload.formName, `${subject}.formName`);
  if (!Array.isArray(payload.sections)) {
    throw new Error(`${subject}.sections must be an array`);
  }
  const uploadStatus = payload.uploadStatus ?? UploadStatus.Local;
  if (typeof uploadStatus !== 'string' || !UPLOAD_STATUSES.has(uploadStatus as UploadStatus)) {
    throw new Error(`${subject}.uploadStatus is not supported`);
  }

  const fieldIds = new Set<string>();
  const externalIds = new Set<string>();
  const sections = payload.sections.map((section, index) =>
    validateSection(section, `${subject}.sections[${index}]`, fieldIds, externalIds)
  );

  sections.forEach((section, sectionIndex) => {
    section.fields.forEach((field, fieldIndex) => {
      field.visibleWhen?.forEach((rule, ruleIndex) => {
        if (!fieldIds.has(rule.fieldId)) {
          throw new Error(
            `${subject}.sections[${sectionIndex}].fields[${fieldIndex}].visibleWhen[${ruleIndex}] references unknown field "${rule.fieldId}"`
          );
        }
      });
    });
  });

  return {
    formName: payload.formName as string,
    sections,
    uploadStatus: uploadStatus as UploadStatus,
  };
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

const normalizeTranslations = (payload: unknown, language: LanguageCode): Labels => {
  const baseline = getFallbackLabels(language);
  validateTranslationOverride(payload, baseline, `translations.${language}`);
  const merged = mergeDeep(clone(baseline), payload);
  if (!isLabels(merged)) {
    throw new Error(`translations.${language} did not satisfy the full labels contract`);
  }
  return merged;
};

const readContentArtifactCache = (): Record<string, CachedContentArtifactRecord> => {
  const stored = localStorage.getItem(CONTENT_ARTIFACT_CACHE_STORAGE_KEY);
  if (!stored) {
    return {};
  }

  try {
    const parsed = JSON.parse(stored) as Record<string, CachedContentArtifactRecord>;
    return Object.entries(parsed).reduce<Record<string, CachedContentArtifactRecord>>((result, [key, value]) => {
      if (
        value
        && typeof value === 'object'
        && typeof value.tenantId === 'string'
        && (value.kind === 'form-schema' || value.kind === 'translations')
        && typeof value.subject === 'string'
        && typeof value.schemaVersion === 'string'
        && typeof value.artifactVersion === 'string'
        && typeof value.cachedAt === 'string'
      ) {
        result[key] = value;
      }
      return result;
    }, {});
  } catch {
    return {};
  }
};

const writeContentArtifactCache = (cache: Record<string, CachedContentArtifactRecord>) => {
  localStorage.setItem(CONTENT_ARTIFACT_CACHE_STORAGE_KEY, JSON.stringify(cache));
};

const readCachedArtifact = <T>(
  tenantId: string,
  kind: ContentKind,
  subject: string,
  normalize: (payload: unknown) => T
): T | null => {
  const cache = readContentArtifactCache();
  const record = cache[buildCacheKey(tenantId, kind, subject)];
  if (!record) {
    return null;
  }

  try {
    return normalize(record.payload);
  } catch {
    return null;
  }
};

const cacheArtifact = (
  tenantId: string,
  kind: ContentKind,
  subject: string,
  payload: unknown,
  schemaVersion: string,
  artifactVersion: string
) => {
  const cache = readContentArtifactCache();
  cache[buildCacheKey(tenantId, kind, subject)] = {
    tenantId,
    kind,
    subject,
    schemaVersion,
    artifactVersion,
    cachedAt: new Date().toISOString(),
    payload,
  };
  writeContentArtifactCache(cache);
};

export const clearCachedContentArtifacts = (tenantId?: string) => {
  const normalizedTenantId = normalizeTenantId(tenantId);
  const cache = readContentArtifactCache();
  Object.keys(cache).forEach((key) => {
    if (cache[key]?.tenantId === normalizedTenantId) {
      delete cache[key];
    }
  });
  writeContentArtifactCache(cache);
};

export const getBundledFormSchema = (formType: FormType): FormSchema =>
  normalizeFormSchema(clone(bundledFormSchemas[formType]), `bundled-form-schema.${formType}`);

export const getBundledTranslations = (language: LanguageCode): Labels =>
  clone(getFallbackLabels(language));

export const resolveGovernedFormSchema = async (
  formType: FormType,
  loader: () => Promise<unknown>,
  tenantId?: string
): Promise<GovernedArtifactResult<FormSchema>> => {
  const normalizedTenantId = normalizeTenantId(tenantId);

  try {
    const rawPayload = await loader();
    const envelope = unwrapContentEnvelope<FormSchema>(rawPayload, 'schema');
    assertRuntimeCompatibility(envelope.compatibility, `Form schema "${formType}"`);
    const schema = normalizeFormSchema(envelope.payload, `form-schema.${formType}`);
    cacheArtifact(normalizedTenantId, 'form-schema', formType, schema, envelope.schemaVersion, envelope.artifactVersion);
    return { payload: schema, source: 'network' };
  } catch (error) {
    const cached = readCachedArtifact(normalizedTenantId, 'form-schema', formType, (payload) =>
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
  const normalizedTenantId = normalizeTenantId(tenantId);

  try {
    const rawPayload = await loader();
    const envelope = unwrapContentEnvelope<Partial<Labels>>(rawPayload, 'labels');
    assertRuntimeCompatibility(envelope.compatibility, `Translations "${language}"`);
    const labels = normalizeTranslations(envelope.payload, language);
    cacheArtifact(normalizedTenantId, 'translations', language, labels, envelope.schemaVersion, envelope.artifactVersion);
    return { payload: labels, source: 'network' };
  } catch (error) {
    const cached = readCachedArtifact(normalizedTenantId, 'translations', language, (payload) =>
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
