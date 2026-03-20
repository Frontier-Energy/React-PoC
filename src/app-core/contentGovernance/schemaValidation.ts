import {
  UploadStatus,
  type ConditionalVisibility,
  type FormField,
  type FormFieldOption,
  type FormSchema,
  type FormSection,
  type ValidationRule,
} from '../types';

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


const normalizeOptionalText = (value: unknown, path: string): string | undefined => {
  if (value === undefined || value === null) {
    return undefined;
  }

  if (typeof value === 'string') {
    return value;
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }

  throw new Error(`${path} must be a string`);
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
    typeof rule.value !== 'string' &&
    typeof rule.value !== 'boolean' &&
    !(Array.isArray(rule.value) && rule.value.every((entry) => typeof entry === 'string'))
  ) {
    throw new Error(`${path}.value must be a string, boolean, or string array`);
  }
  if (
    rule.operator !== undefined &&
    (typeof rule.operator !== 'string' ||
      !VISIBILITY_OPERATORS.has(rule.operator as NonNullable<ConditionalVisibility['operator']>))
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

  const placeholder = normalizeOptionalText(field.placeholder, `${path}.placeholder`);
  const description = normalizeOptionalText(field.description, `${path}.description`);
  const options = OPTION_FIELD_TYPES.has(field.type as FormField['type'])
    ? (() => {
        if (field.options === undefined) {
          throw new Error(`${path}.options are required for choice fields`);
        }
        if (!Array.isArray(field.options) || field.options.length === 0) {
          throw new Error(`${path}.options must be a non-empty array`);
        }
        return field.options.map((option, index) => validateOption(option, `${path}.options[${index}]`));
      })()
    : undefined;
  const accept = FILE_FIELD_TYPES.has(field.type as FormField['type'])
    ? (() => {
        if (field.accept === undefined) {
          return undefined;
        }
        assertString(field.accept, `${path}.accept`, { allowEmpty: true });
        return field.accept as string;
      })()
    : undefined;
  const multiple = FILE_FIELD_TYPES.has(field.type as FormField['type'])
    ? (() => {
        if (field.multiple === undefined) {
          return undefined;
        }
        assertBoolean(field.multiple, `${path}.multiple`);
        return field.multiple as boolean;
      })()
    : undefined;
  const capture = field.capture === 'user' || field.capture === 'environment'
    ? field.capture
    : undefined;

  return {
    id: fieldId,
    label: field.label as string,
    type: field.type as FormField['type'],
    required: field.required as boolean,
    externalID: field.externalID as string | undefined,
    options,
    placeholder,
    description,
    validationRules: Array.isArray(field.validationRules)
      ? field.validationRules.map((rule, index) => validateRule(rule, `${path}.validationRules[${index}]`))
      : undefined,
    visibleWhen: Array.isArray(field.visibleWhen)
      ? field.visibleWhen.map((rule, index) => validateVisibilityRule(rule, `${path}.visibleWhen[${index}]`))
      : undefined,
    accept,
    multiple,
    capture,
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
    fields: section.fields.map((field, index) =>
      validateField(field, `${path}.fields[${index}]`, fieldIds, externalIds)
    ),
  };
};

export const normalizeFormSchema = (payload: unknown, subject: string): FormSchema => {
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






