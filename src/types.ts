export enum FormType {
  Electrical = 'electrical',
  HVAC = 'hvac',
}

export const FormTypeLabels: Record<FormType, string> = {
  [FormType.Electrical]: 'Electrical',
  [FormType.HVAC]: 'HVAC'
};

export interface FormFieldOption {
  label: string;
  value: string;
}

export interface FormField {
  id: string;
  label: string;
  type: 'text' | 'number' | 'checkbox' | 'radio' | 'select' | 'multiselect' | 'textarea';
  required: boolean;
  externalID?: string;
  options?: FormFieldOption[];
  placeholder?: string;
  description?: string;
}

export interface FormData {
  [fieldId: string]: string | boolean | string[];
}

export interface FormSection {
  title: string;
  fields: FormField[];
}

export interface FormSchema {
  formName: string;
  sections: FormSection[];
}

export interface InspectionSession {
  id: string;
  name: string;
  formType: FormType;
}
