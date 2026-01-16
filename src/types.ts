export enum FormType {
  Electrical = 'electrical',
  HVAC = 'hvac',
}

export const FormTypeLabels: Record<FormType, string> = {
  [FormType.Electrical]: 'Electrical',
  [FormType.HVAC]: 'HVAC'
};

export interface FormField {
  id: string;
  label: string;
  type: 'text' | 'number' | 'checkbox' | 'textarea' | 'select';
  required: boolean;
  options?: string[];
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
