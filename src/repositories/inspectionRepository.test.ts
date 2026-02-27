import { describe, expect, it, vi, afterEach } from 'vitest';
import { inspectionRepository } from './inspectionRepository';
import { FormType, UploadStatus, type FormDataValue, type InspectionSession } from '../types';

const makeInspection = (id: string, overrides?: Partial<InspectionSession>): InspectionSession => ({
  id,
  name: `Inspection ${id}`,
  formType: FormType.HVAC,
  uploadStatus: UploadStatus.Local,
  ...overrides,
});

describe('inspectionRepository', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('loads all inspection records and de-duplicates by session id', () => {
    const first = makeInspection('abc');
    const latest = makeInspection('abc', { name: 'Latest', uploadStatus: UploadStatus.Uploaded });
    const second = makeInspection('def');

    localStorage.setItem('inspection_abc', JSON.stringify(first));
    localStorage.setItem('inspection_def', JSON.stringify(second));
    localStorage.setItem('inspection_duplicate', JSON.stringify(latest));
    localStorage.setItem('unrelated_key', JSON.stringify({ foo: 'bar' }));

    const loaded = inspectionRepository.loadAll();

    expect(loaded).toHaveLength(2);
    expect(loaded.find((item) => item.id === 'abc')).toEqual(latest);
    expect(loaded.find((item) => item.id === 'def')).toEqual(second);
  });

  it('ignores malformed inspections while loading all', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    localStorage.setItem('inspection_valid', JSON.stringify(makeInspection('valid')));
    localStorage.setItem('inspection_bad', '{bad-json');

    const loaded = inspectionRepository.loadAll();

    expect(loaded).toHaveLength(1);
    expect(loaded[0].id).toBe('valid');
    expect(consoleSpy).toHaveBeenCalled();
  });

  it('loads inspection by id and returns null when missing or malformed', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const inspection = makeInspection('by-id');

    localStorage.setItem('inspection_by-id', JSON.stringify(inspection));
    expect(inspectionRepository.loadById('by-id')).toEqual(inspection);
    expect(inspectionRepository.loadById('missing')).toBeNull();

    localStorage.setItem('inspection_bad-id', 'not-json');
    expect(inspectionRepository.loadById('bad-id')).toBeNull();
    expect(consoleSpy).toHaveBeenCalled();
  });

  it('saves inspection and current session records', () => {
    const inspection = makeInspection('save-test', { uploadStatus: UploadStatus.InProgress });

    inspectionRepository.save(inspection);
    inspectionRepository.saveCurrent(inspection);

    expect(localStorage.getItem('inspection_save-test')).toBe(JSON.stringify(inspection));
    expect(localStorage.getItem('currentSession')).toBe(JSON.stringify(inspection));
  });

  it('updates inspection and returns the updated object', () => {
    const inspection = makeInspection('update-test', { uploadStatus: UploadStatus.Uploading });

    const result = inspectionRepository.update(inspection);

    expect(result).toEqual(inspection);
    expect(localStorage.getItem('inspection_update-test')).toBe(JSON.stringify(inspection));
  });

  it('loads current session and handles malformed current session', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const inspection = makeInspection('current');

    localStorage.setItem('currentSession', JSON.stringify(inspection));
    expect(inspectionRepository.loadCurrent()).toEqual(inspection);

    localStorage.setItem('currentSession', 'bad-json');
    expect(inspectionRepository.loadCurrent()).toBeNull();
    expect(consoleSpy).toHaveBeenCalled();
  });

  it('deletes inspection, form data, and current session when matching', () => {
    const inspection = makeInspection('delete-me');

    localStorage.setItem('inspection_delete-me', JSON.stringify(inspection));
    localStorage.setItem('formData_delete-me', JSON.stringify({ extId: 'value' }));
    localStorage.setItem('currentSession', JSON.stringify(inspection));

    inspectionRepository.delete('delete-me');

    expect(localStorage.getItem('inspection_delete-me')).toBeNull();
    expect(localStorage.getItem('formData_delete-me')).toBeNull();
    expect(localStorage.getItem('currentSession')).toBeNull();
  });

  it('supports delete options for preserving related storage entries', () => {
    const inspection = makeInspection('keep-data');
    const otherCurrent = makeInspection('other-current');

    localStorage.setItem('inspection_keep-data', JSON.stringify(inspection));
    localStorage.setItem('formData_keep-data', JSON.stringify({ extId: 'value' }));
    localStorage.setItem('currentSession', JSON.stringify(otherCurrent));

    inspectionRepository.delete('keep-data', {
      removeFormData: false,
      removeCurrentIfMatch: false,
    });

    expect(localStorage.getItem('inspection_keep-data')).toBeNull();
    expect(localStorage.getItem('formData_keep-data')).not.toBeNull();
    expect(localStorage.getItem('currentSession')).toBe(JSON.stringify(otherCurrent));
  });

  it('loads and saves form data payloads', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const formData: Record<string, FormDataValue> = {
      yesNo: true,
      comment: 'hello',
      multi: ['a', 'b'],
    };

    inspectionRepository.saveFormData('form-session', formData);
    expect(inspectionRepository.loadFormData('form-session')).toEqual(formData);
    expect(inspectionRepository.loadFormData('missing-form')).toBeNull();

    localStorage.setItem('formData_bad-form', '{bad-json');
    expect(inspectionRepository.loadFormData('bad-form')).toBeNull();
    expect(consoleSpy).toHaveBeenCalled();
  });
});

