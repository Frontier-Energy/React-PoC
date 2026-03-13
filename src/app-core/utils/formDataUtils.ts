import { FileReference, FormDataValue } from '../types';

export const isFileReference = (value: unknown): value is FileReference => {
  return Boolean(
    value &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      'id' in value &&
      'name' in value
  );
};

export const isFileReferenceArray = (value: unknown): value is FileReference[] => {
  return Array.isArray(value) && value.every(isFileReference);
};

export const getFileReferences = (value: FormDataValue | undefined): FileReference[] => {
  if (!value) {
    return [];
  }
  if (isFileReference(value)) {
    return [value];
  }
  if (isFileReferenceArray(value)) {
    return value;
  }
  return [];
};

export const isFormDataValueEmpty = (value: FormDataValue | undefined | null): boolean => {
  if (value === undefined || value === null) {
    return true;
  }
  if (typeof value === 'string') {
    return value.trim().length === 0;
  }
  if (typeof value === 'boolean') {
    return false;
  }
  if (Array.isArray(value)) {
    return value.length === 0;
  }
  if (isFileReference(value)) {
    return value.id.trim().length === 0;
  }
  return false;
};

export const formatFileValue = (value: FormDataValue | undefined): string | null => {
  if (!value) {
    return null;
  }
  if (isFileReference(value)) {
    return value.name;
  }
  if (isFileReferenceArray(value)) {
    return value.map((file) => file.name).join(', ');
  }
  return null;
};

export const serializeFormValue = (value: FormDataValue): string => {
  if (isFileReference(value)) {
    return JSON.stringify({
      id: value.id,
      name: value.name,
      type: value.type,
      size: value.size,
      lastModified: value.lastModified,
    });
  }
  if (isFileReferenceArray(value)) {
    return JSON.stringify(
      value.map((file) => ({
        id: file.id,
        name: file.name,
        type: file.type,
        size: file.size,
        lastModified: file.lastModified,
      }))
    );
  }
  if (Array.isArray(value)) {
    return value.join(',');
  }
  return String(value);
};
