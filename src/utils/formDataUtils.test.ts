import { describe, expect, it } from 'vitest';
import {
  formatFileValue,
  getFileReferences,
  isFileReference,
  isFileReferenceArray,
  isFormDataValueEmpty,
  serializeFormValue,
} from './formDataUtils';
import { type FileReference } from '../types';

const makeFile = (id = 'file-1', name = 'example.png'): FileReference => ({
  id,
  name,
  type: 'image/png',
  size: 123,
  lastModified: 456,
});

describe('formDataUtils', () => {
  it('detects file reference values', () => {
    expect(isFileReference(makeFile())).toBe(true);
    expect(isFileReference(null)).toBe(false);
    expect(isFileReference(['not-a-file'])).toBe(false);
    expect(isFileReference({ id: 'x' })).toBe(false);
  });

  it('detects arrays of file references', () => {
    expect(isFileReferenceArray([makeFile('1'), makeFile('2')])).toBe(true);
    expect(isFileReferenceArray([])).toBe(true);
    expect(isFileReferenceArray([makeFile('1'), { not: 'a-file' }])).toBe(false);
    expect(isFileReferenceArray('not-an-array')).toBe(false);
  });

  it('returns normalized file references from form values', () => {
    const single = makeFile('single');
    const multi = [makeFile('1'), makeFile('2')];

    expect(getFileReferences(undefined)).toEqual([]);
    expect(getFileReferences(single)).toEqual([single]);
    expect(getFileReferences(multi)).toEqual(multi);
    expect(getFileReferences('plain text')).toEqual([]);
  });

  it('detects empty form values correctly', () => {
    expect(isFormDataValueEmpty(undefined)).toBe(true);
    expect(isFormDataValueEmpty(null)).toBe(true);
    expect(isFormDataValueEmpty('   ')).toBe(true);
    expect(isFormDataValueEmpty('value')).toBe(false);
    expect(isFormDataValueEmpty(false)).toBe(false);
    expect(isFormDataValueEmpty([])).toBe(true);
    expect(isFormDataValueEmpty(['a'])).toBe(false);
    expect(isFormDataValueEmpty(makeFile('   '))).toBe(true);
    expect(isFormDataValueEmpty(makeFile('valid-id'))).toBe(false);
  });

  it('formats file values for display', () => {
    const single = makeFile('single', 'one.png');
    const multi = [makeFile('1', 'one.png'), makeFile('2', 'two.png')];

    expect(formatFileValue(undefined)).toBeNull();
    expect(formatFileValue(single)).toBe('one.png');
    expect(formatFileValue(multi)).toBe('one.png, two.png');
    expect(formatFileValue('not-a-file')).toBeNull();
  });

  it('serializes scalar, array, and file values', () => {
    const single = makeFile('single', 'one.png');
    const multi = [makeFile('1', 'one.png'), makeFile('2', 'two.png')];

    expect(serializeFormValue(single)).toBe(JSON.stringify(single));
    expect(serializeFormValue(multi)).toBe(JSON.stringify(multi));
    expect(serializeFormValue(['a', 'b'])).toBe('a,b');
    expect(serializeFormValue(true)).toBe('true');
    expect(serializeFormValue('text')).toBe('text');
  });
});
