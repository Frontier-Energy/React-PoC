import { describe, expect, it } from 'vitest';
import { FormValidator } from './FormValidator';
import { FormType, UploadStatus, type ConditionalVisibility, type FormData, type FileReference, type ValidationRule } from '../types';

const makeFile = (id = 'file-1', name = 'example.png'): FileReference => ({
  id,
  name,
  type: 'image/png',
  size: 123,
  lastModified: 456,
});

const rule = (type: ValidationRule['type'], value: ValidationRule['value'], message = 'invalid'): ValidationRule => ({
  type,
  value,
  message,
});

describe('FormValidator', () => {
  it('returns null when validation rules are missing', () => {
    expect(FormValidator.validateField('field', 'abc', undefined)).toBeNull();
    expect(FormValidator.validateField('field', 'abc', [])).toBeNull();
  });

  it('skips validation for file references', () => {
    expect(FormValidator.validateField('field', makeFile(), [rule('minLength', 999)])).toBeNull();
    expect(FormValidator.validateField('field', [makeFile()], [rule('minLength', 999)])).toBeNull();
  });

  it('validates minLength and maxLength', () => {
    expect(FormValidator.validateField('f', 'ab', [rule('minLength', 3, 'too short')])).toEqual({
      fieldId: 'f',
      message: 'too short',
    });
    expect(FormValidator.validateField('f', 'abcd', [rule('maxLength', 3, 'too long')])).toEqual({
      fieldId: 'f',
      message: 'too long',
    });
  });

  it('validates min and max numeric rules', () => {
    expect(FormValidator.validateField('f', '4', [rule('min', 5, 'too small')])).toEqual({
      fieldId: 'f',
      message: 'too small',
    });
    expect(FormValidator.validateField('f', 10 as unknown as string, [rule('max', 8, 'too big')])).toEqual({
      fieldId: 'f',
      message: 'too big',
    });
  });

  it('validates pattern rules and ignores custom rules', () => {
    expect(FormValidator.validateField('f', 'abc', [rule('pattern', '^\\d+$', 'digits only')])).toEqual({
      fieldId: 'f',
      message: 'digits only',
    });
    expect(FormValidator.validateField('f', 'abc', [rule('custom', undefined, 'custom')])).toBeNull();
  });

  it('returns first error from multiple rules', () => {
    const rules: ValidationRule[] = [
      rule('minLength', 5, 'first error'),
      rule('pattern', '^\\d+$', 'second error'),
    ];

    expect(FormValidator.validateField('f', 'ab', rules)).toEqual({ fieldId: 'f', message: 'first error' });
  });

  it('validates full form with required and conditional visibility', () => {
    const formData: FormData = {
      requiredVisible: ' ',
      requiredHiddenTrigger: 'no',
      requiredHidden: '',
      invalidVisible: 'abc',
      validVisible: '123',
    };

    const validationRulesMap: Record<string, ValidationRule[] | undefined> = {
      invalidVisible: [rule('pattern', '^\\d+$', 'must be numeric')],
      validVisible: [rule('pattern', '^\\d+$', 'must be numeric')],
      hiddenRule: [rule('minLength', 10, 'should not run')],
    };

    const visibilityRulesMap: Record<string, ConditionalVisibility[] | undefined> = {
      requiredHidden: [{ fieldId: 'requiredHiddenTrigger', operator: 'equals', value: 'yes' }],
      hiddenRule: [{ fieldId: 'requiredHiddenTrigger', operator: 'equals', value: 'yes' }],
    };

    const errors = FormValidator.validateForm(
      formData,
      validationRulesMap,
      ['requiredVisible', 'requiredHidden'],
      visibilityRulesMap
    );

    expect(errors).toEqual([
      { fieldId: 'requiredVisible', message: 'This field is required' },
      { fieldId: 'invalidVisible', message: 'must be numeric' },
    ]);
  });

  it('evaluates visibility rules across supported operators', () => {
    const formData: FormData = {
      equalsField: 'yes',
      textField: 'abc123',
      numberField: '10',
      arrField: ['a', 'b'],
      fileArrField: [makeFile('1', 'one.png')],
    };

    expect(
      FormValidator.isFieldVisible('x', formData, [{ fieldId: 'equalsField', operator: 'equals', value: 'yes' }])
    ).toBe(true);
    expect(
      FormValidator.isFieldVisible('x', formData, [{ fieldId: 'equalsField', operator: 'notEquals', value: 'yes' }])
    ).toBe(false);
    expect(
      FormValidator.isFieldVisible('x', formData, [{ fieldId: 'arrField', operator: 'contains', value: 'a' }])
    ).toBe(true);
    expect(
      FormValidator.isFieldVisible('x', formData, [{ fieldId: 'textField', operator: 'contains', value: '123' }])
    ).toBe(true);
    expect(
      FormValidator.isFieldVisible('x', formData, [{ fieldId: 'fileArrField', operator: 'contains', value: 'one' }])
    ).toBe(false);
    expect(
      FormValidator.isFieldVisible('x', formData, [{ fieldId: 'numberField', operator: 'greaterThan', value: '9' }])
    ).toBe(true);
    expect(
      FormValidator.isFieldVisible('x', formData, [{ fieldId: 'numberField', operator: 'lessThan', value: '9' }])
    ).toBe(false);
    expect(
      FormValidator.isFieldVisible('x', formData, [{ fieldId: 'equalsField', operator: 'unknown' as never, value: 'ignored' }])
    ).toBe(true);
  });

  it('returns true when no visibility rules are provided and false when none match', () => {
    const formData: FormData = { status: 'closed', uploadStatus: UploadStatus.Local, formType: FormType.HVAC } as unknown as FormData;

    expect(FormValidator.isFieldVisible('x', formData, undefined)).toBe(true);
    expect(FormValidator.isFieldVisible('x', formData, [])).toBe(true);
    expect(
      FormValidator.isFieldVisible('x', formData, [
        { fieldId: 'status', operator: 'equals', value: 'open' },
        { fieldId: 'status', operator: 'equals', value: 'pending' },
      ])
    ).toBe(false);
  });
});
