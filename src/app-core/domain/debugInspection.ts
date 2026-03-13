import type { FileReference, FormData, FormSchema } from '../types';

export interface InspectionScope {
  tenantId: string;
  userId?: string;
}

export interface DebugInspectionFileItem {
  fieldId: string;
  label: string;
  type: 'file' | 'signature';
  files: FileReference[];
}

export const resolveInspectionScope = (state: unknown): InspectionScope | undefined => {
  if (!state || typeof state !== 'object' || !('inspectionScope' in state)) {
    return undefined;
  }

  const scope = (state as { inspectionScope?: unknown }).inspectionScope;
  if (!scope || typeof scope !== 'object' || !('tenantId' in scope)) {
    return undefined;
  }

  const tenantId = (scope as { tenantId?: unknown }).tenantId;
  if (typeof tenantId !== 'string' || tenantId.length === 0) {
    return undefined;
  }

  const userId = (scope as { userId?: unknown }).userId;
  return {
    tenantId,
    userId: typeof userId === 'string' && userId.length > 0 ? userId : undefined,
  };
};

export const buildDebugInspectionFileItems = (
  formSchema: FormSchema | null,
  formData: FormData | null | undefined,
  getFileReferences: (value: unknown) => FileReference[]
): DebugInspectionFileItem[] => {
  if (!formSchema || !formData) {
    return [];
  }

  return formSchema.sections
    .flatMap((section) => section.fields)
    .filter((field): field is typeof field & { type: 'file' | 'signature' } => field.type === 'file' || field.type === 'signature')
    .map((field) => {
      const key = field.externalID || field.id;
      return {
        fieldId: field.id,
        label: field.label,
        type: field.type,
        files: getFileReferences(formData[key]),
      };
    })
    .filter((item) => item.files.length > 0);
};

export const formatDebugFileSize = (size: number) => {
  if (size < 1024) {
    return `${size} B`;
  }
  if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(1)} KB`;
  }
  if (size < 1024 * 1024 * 1024) {
    return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  }
  return `${(size / (1024 * 1024 * 1024)).toFixed(1)} GB`;
};

export const formatDebugDuration = (value: number | null | undefined, notProvidedLabel: string) => {
  if (value == null) {
    return notProvidedLabel;
  }

  if (value < 1000) {
    return `${value} ms`;
  }

  if (value < 60_000) {
    return `${(value / 1000).toFixed(1)} s`;
  }

  return `${(value / 60_000).toFixed(1)} min`;
};

export const isPreviewableDebugFile = (file: FileReference) => file.type.startsWith('image/');
