import { FormData, ValidationRule, ConditionalVisibility } from '../types';

export interface ValidationError {
  fieldId: string;
  message: string;
}

export class FormValidator {
  /**
   * Validates form data against validation rules
   */
  static validateField(
    fieldId: string,
    value: string | boolean | string[],
    validationRules?: ValidationRule[]
  ): ValidationError | null {
    if (!validationRules || validationRules.length === 0) {
      return null;
    }

    for (const rule of validationRules) {
      const error = this.validateRule(fieldId, value, rule);
      if (error) {
        return error;
      }
    }

    return null;
  }

  /**
   * Validates a single rule
   */
  private static validateRule(
    fieldId: string,
    value: string | boolean | string[],
    rule: ValidationRule
  ): ValidationError | null {
    const stringValue = String(value);

    switch (rule.type) {
      case 'minLength':
        if (stringValue.length < (rule.value as number)) {
          return { fieldId, message: rule.message };
        }
        break;

      case 'maxLength':
        if (stringValue.length > (rule.value as number)) {
          return { fieldId, message: rule.message };
        }
        break;

      case 'min':
        if (Number(value) < (rule.value as number)) {
          return { fieldId, message: rule.message };
        }
        break;

      case 'max':
        if (Number(value) > (rule.value as number)) {
          return { fieldId, message: rule.message };
        }
        break;

      case 'pattern':
        if (!new RegExp(rule.value as string).test(stringValue)) {
          return { fieldId, message: rule.message };
        }
        break;

      case 'custom':
        // Custom validation would be handled by custom logic
        break;
    }

    return null;
  }

  /**
   * Validates all form data
   */
  static validateForm(
    formData: FormData,
    validationRulesMap: Record<string, ValidationRule[] | undefined>,
    requiredFields?: string[]
  ): ValidationError[] {
    const errors: ValidationError[] = [];

    // Check required fields
    if (requiredFields) {
      for (const fieldId of requiredFields) {
        const value = formData[fieldId];
        if (value === undefined || value === null || value === '' || (Array.isArray(value) && value.length === 0)) {
          errors.push({
            fieldId,
            message: 'This field is required',
          });
        }
      }
    }

    // Check validation rules
    for (const [fieldId, rules] of Object.entries(validationRulesMap)) {
      const value = formData[fieldId];
      if (value !== undefined && value !== null && value !== '') {
        const error = this.validateField(fieldId, value, rules);
        if (error) {
          errors.push(error);
        }
      }
    }

    return errors;
  }

  /**
   * Checks if a field should be visible based on conditional visibility rules
   */
  static isFieldVisible(
    fieldId: string,
    formData: FormData,
    visibilityRules?: ConditionalVisibility[]
  ): boolean {
    if (!visibilityRules || visibilityRules.length === 0) {
      return true;
    }

    // If there are visibility rules, at least one must match for the field to be visible
    for (const rule of visibilityRules) {
      if (this.checkVisibilityCondition(formData, rule)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Checks a single visibility condition
   */
  private static checkVisibilityCondition(
    formData: FormData,
    condition: ConditionalVisibility
  ): boolean {
    const dependentValue = formData[condition.fieldId];
    const operator = condition.operator || 'equals';

    switch (operator) {
      case 'equals':
        return dependentValue === condition.value;

      case 'notEquals':
        return dependentValue !== condition.value;

      case 'contains':
        if (Array.isArray(dependentValue)) {
          return dependentValue.includes(condition.value as string);
        }
        return String(dependentValue).includes(String(condition.value));

      case 'greaterThan':
        return Number(dependentValue) > Number(condition.value);

      case 'lessThan':
        return Number(dependentValue) < Number(condition.value);

      default:
        return true;
    }
  }
}
