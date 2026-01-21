export enum FormType {
  Electrical = 'electrical',
  HVAC = 'hvac',
}

export enum UploadStatus {
  Local = 'local',
  InProgress = 'in-progress',
  Uploading = 'uploading',
  Uploaded = 'uploaded',
  Failed = 'failed',
}

export const FormTypeLabels: Record<FormType, string> = {
  [FormType.Electrical]: 'Electrical',
  [FormType.HVAC]: 'HVAC'
};

export interface FormFieldOption {
  label: string;
  value: string;
}

export interface ValidationRule {
  type: 'minLength' | 'maxLength' | 'min' | 'max' | 'pattern' | 'custom';
  value?: string | number;
  message: string;
}

export interface ConditionalVisibility {
  fieldId: string;
  value: string | boolean | string[];
  operator?: 'equals' | 'notEquals' | 'contains' | 'greaterThan' | 'lessThan';
}

export interface FormField {
  id: string;
  label: string;
  type: 'text' | 'number' | 'checkbox' | 'radio' | 'select' | 'multiselect' | 'textarea' | 'file' | 'signature';
  required: boolean;
  externalID?: string;
  options?: FormFieldOption[];
  placeholder?: string;
  description?: string;
  validationRules?: ValidationRule[];
  visibleWhen?: ConditionalVisibility[];
  accept?: string;
  multiple?: boolean;
  capture?: 'user' | 'environment';
}

export interface FileReference {
  id: string;
  name: string;
  type: string;
  size: number;
  lastModified: number;
}

export type FormDataValue = string | boolean | string[] | FileReference | FileReference[];

export interface FormData {
  [fieldId: string]: FormDataValue;
}

export interface FormSection {
  title: string;
  fields: FormField[];
}

export interface FormSchema {
  formName: string;
  uploadStatus: UploadStatus;
  sections: FormSection[];
}

export interface InspectionSession {
  id: string;
  name: string;
  formType: FormType;
  uploadStatus?: UploadStatus;
  userId?: string;
}
