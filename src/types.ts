export enum FormType {
  Electrical = 'electrical',
}

export const FormTypeLabels: Record<FormType, string> = {
  [FormType.Electrical]: 'Electrical'
};

export interface InspectionSession {
  id: string;
  name: string;
  formType: FormType;
}
