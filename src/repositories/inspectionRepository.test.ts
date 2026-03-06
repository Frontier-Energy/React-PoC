import { describe, expect, it, vi, afterEach } from 'vitest';
import { inspectionRepository } from './inspectionRepository';
import { FormType, UploadStatus, type FormDataValue, type InspectionSession } from '../types';

const { getActiveTenantId, setActiveTenantId } = vi.hoisted(() => {
  let tenantId = 'tenant-a';
  return {
    getActiveTenantId: () => tenantId,
    setActiveTenantId: (next: string) => {
      tenantId = next;
    },
  };
});

vi.mock('../auth', () => ({
  getUserId: () => 'user-123',
}));

vi.mock('../config', async () => {
  const actual = await vi.importActual<typeof import('../config')>('../config');
  return {
    ...actual,
    getActiveTenant: () => ({ tenantId: getActiveTenantId() }),
  };
});

const makeInspection = (id: string, overrides?: Partial<InspectionSession>): InspectionSession => ({
  id,
  name: `Inspection ${id}`,
  formType: FormType.HVAC,
  tenantId: 'tenant-a',
  uploadStatus: UploadStatus.Local,
  ...overrides,
});

const getInspectionStorageKey = (inspectionId: string, tenantId = 'tenant-a', userId = 'user-123') =>
  `${tenantId}:${userId}:inspection_${inspectionId}`;

const getFormDataStorageKey = (inspectionId: string, tenantId = 'tenant-a', userId = 'user-123') =>
  `${tenantId}:${userId}:formData_${inspectionId}`;

const getCurrentSessionStorageKey = (tenantId = 'tenant-a', userId = 'user-123') =>
  `${tenantId}:${userId}:currentSession`;

describe('inspectionRepository', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    setActiveTenantId('tenant-a');
  });

  it('loads all inspection records and de-duplicates by session id', () => {
    const first = makeInspection('abc');
    const latest = makeInspection('abc', { name: 'Latest', uploadStatus: UploadStatus.Uploaded });
    const second = makeInspection('def');

    localStorage.setItem(getInspectionStorageKey('abc'), JSON.stringify(first));
    localStorage.setItem(getInspectionStorageKey('def'), JSON.stringify(second));
    localStorage.setItem(getInspectionStorageKey('duplicate'), JSON.stringify(latest));
    localStorage.setItem(getInspectionStorageKey('tenant-b', 'tenant-b', 'user-123'), JSON.stringify(makeInspection('tenant-b')));
    localStorage.setItem(getInspectionStorageKey('user-b', 'tenant-a', 'user-b'), JSON.stringify(makeInspection('user-b')));
    localStorage.setItem('unrelated_key', JSON.stringify({ foo: 'bar' }));

    const loaded = inspectionRepository.loadAll();

    expect(loaded).toHaveLength(2);
    expect(loaded.find((item) => item.id === 'abc')).toEqual({
      ...latest,
      tenantId: 'tenant-a',
      userId: 'user-123',
    });
    expect(loaded.find((item) => item.id === 'def')).toEqual({
      ...second,
      tenantId: 'tenant-a',
      userId: 'user-123',
    });
  });

  it('ignores malformed inspections while loading all', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    localStorage.setItem(getInspectionStorageKey('valid'), JSON.stringify(makeInspection('valid')));
    localStorage.setItem(getInspectionStorageKey('bad'), '{bad-json');

    const loaded = inspectionRepository.loadAll();

    expect(loaded).toHaveLength(1);
    expect(loaded[0].id).toBe('valid');
    expect(consoleSpy).toHaveBeenCalled();
  });

  it('loads inspection by id and returns null when missing or malformed', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const inspection = makeInspection('by-id');

    const normalizedInspection = { ...inspection, tenantId: 'tenant-a', userId: 'user-123' };
    localStorage.setItem(getInspectionStorageKey('by-id'), JSON.stringify(inspection));
    expect(inspectionRepository.loadById('by-id')).toEqual(normalizedInspection);
    expect(inspectionRepository.loadById('missing')).toBeNull();

    localStorage.setItem(getInspectionStorageKey('bad-id'), 'not-json');
    expect(inspectionRepository.loadById('bad-id')).toBeNull();
    expect(consoleSpy).toHaveBeenCalled();
  });

  it('saves inspection and current session records', () => {
    const inspection = makeInspection('save-test', { uploadStatus: UploadStatus.InProgress });
    const normalizedInspection = { ...inspection, tenantId: 'tenant-a', userId: 'user-123' };

    inspectionRepository.save(inspection);
    inspectionRepository.saveCurrent(inspection);

    expect(localStorage.getItem(getInspectionStorageKey('save-test'))).toBe(JSON.stringify(normalizedInspection));
    expect(localStorage.getItem(getCurrentSessionStorageKey())).toBe(JSON.stringify(normalizedInspection));
  });

  it('saves inspection as current in a single operation', () => {
    const inspection = makeInspection('save-as-current-test', { uploadStatus: UploadStatus.InProgress });
    const normalizedInspection = { ...inspection, tenantId: 'tenant-a', userId: 'user-123' };

    inspectionRepository.saveAsCurrent(inspection);

    expect(localStorage.getItem(getInspectionStorageKey('save-as-current-test'))).toBe(JSON.stringify(normalizedInspection));
    expect(localStorage.getItem(getCurrentSessionStorageKey())).toBe(JSON.stringify(normalizedInspection));
  });

  it('updates inspection and returns the updated object', () => {
    const inspection = makeInspection('update-test', { uploadStatus: UploadStatus.Uploading });

    const result = inspectionRepository.update(inspection);

    expect(result).toEqual(inspection);
    expect(localStorage.getItem(getInspectionStorageKey('update-test'))).toBe(
      JSON.stringify({ ...inspection, tenantId: 'tenant-a', userId: 'user-123' })
    );
  });

  it('keeps inspection and form data in the inspection tenant after the active tenant changes', () => {
    const inspection = makeInspection('tenant-pinned', { tenantId: 'tenant-a' });

    inspectionRepository.saveAsCurrent(inspection);
    inspectionRepository.updateFormDataEntry(inspection.id, 'ext.note', 'before switch', inspection);

    setActiveTenantId('tenant-b');

    inspectionRepository.saveCurrent({ ...inspection, name: 'Updated after switch' });
    inspectionRepository.updateFormDataEntry(inspection.id, 'ext.note', 'after switch', inspection);

    expect(localStorage.getItem(getInspectionStorageKey('tenant-pinned', 'tenant-a'))).toBe(
      JSON.stringify({
        ...inspection,
        name: 'Inspection tenant-pinned',
        tenantId: 'tenant-a',
        userId: 'user-123',
      })
    );
    expect(localStorage.getItem(getCurrentSessionStorageKey('tenant-a'))).toBe(
      JSON.stringify({
        ...inspection,
        name: 'Updated after switch',
        tenantId: 'tenant-a',
        userId: 'user-123',
      })
    );
    expect(localStorage.getItem(getCurrentSessionStorageKey('tenant-b'))).toBeNull();
    expect(localStorage.getItem(getFormDataStorageKey('tenant-pinned', 'tenant-a'))).toBe(
      JSON.stringify({ 'ext.note': 'after switch' })
    );
    expect(localStorage.getItem(getFormDataStorageKey('tenant-pinned', 'tenant-b'))).toBeNull();
  });

  it('loads current session and handles malformed current session', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const inspection = makeInspection('current');
    const normalizedInspection = { ...inspection, tenantId: 'tenant-a', userId: 'user-123' };

    localStorage.setItem(getCurrentSessionStorageKey(), JSON.stringify(inspection));
    expect(inspectionRepository.loadCurrent()).toEqual(normalizedInspection);

    localStorage.setItem(getCurrentSessionStorageKey(), 'bad-json');
    expect(inspectionRepository.loadCurrent()).toBeNull();
    expect(consoleSpy).toHaveBeenCalled();
  });

  it('loads current session by id and falls back to inspection when current does not match', () => {
    const current = makeInspection('current-session');
    const fallback = makeInspection('fallback-session');
    const normalizedCurrent = { ...current, tenantId: 'tenant-a', userId: 'user-123' };
    const normalizedFallback = { ...fallback, tenantId: 'tenant-a', userId: 'user-123' };

    localStorage.setItem(getCurrentSessionStorageKey(), JSON.stringify(current));
    localStorage.setItem(getInspectionStorageKey('fallback-session'), JSON.stringify(fallback));

    expect(inspectionRepository.loadCurrentOrById('current-session')).toEqual(normalizedCurrent);
    expect(inspectionRepository.loadCurrentOrById('fallback-session')).toEqual(normalizedFallback);
    expect(inspectionRepository.loadCurrentOrById('missing-session')).toBeNull();
  });

  it('deletes inspection, form data, and current session when matching', () => {
    const inspection = makeInspection('delete-me');

    localStorage.setItem(getInspectionStorageKey('delete-me'), JSON.stringify(inspection));
    localStorage.setItem(getFormDataStorageKey('delete-me'), JSON.stringify({ extId: 'value' }));
    localStorage.setItem(getCurrentSessionStorageKey(), JSON.stringify(inspection));

    inspectionRepository.delete('delete-me');

    expect(localStorage.getItem(getInspectionStorageKey('delete-me'))).toBeNull();
    expect(localStorage.getItem(getFormDataStorageKey('delete-me'))).toBeNull();
    expect(localStorage.getItem(getCurrentSessionStorageKey())).toBeNull();
  });

  it('supports delete options for preserving related storage entries', () => {
    const inspection = makeInspection('keep-data');
    const otherCurrent = makeInspection('other-current');
    localStorage.setItem(getInspectionStorageKey('keep-data'), JSON.stringify(inspection));
    localStorage.setItem(getFormDataStorageKey('keep-data'), JSON.stringify({ extId: 'value' }));
    localStorage.setItem(getCurrentSessionStorageKey(), JSON.stringify(otherCurrent));

    inspectionRepository.delete('keep-data', {
      removeFormData: false,
      removeCurrentIfMatch: false,
    });

    expect(localStorage.getItem(getInspectionStorageKey('keep-data'))).toBeNull();
    expect(localStorage.getItem(getFormDataStorageKey('keep-data'))).not.toBeNull();
    expect(localStorage.getItem(getCurrentSessionStorageKey())).toBe(JSON.stringify(otherCurrent));
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

    localStorage.setItem(getFormDataStorageKey('bad-form'), '{bad-json');
    expect(inspectionRepository.loadFormData('bad-form')).toBeNull();
    expect(consoleSpy).toHaveBeenCalled();
  });

  it('updates and clears individual form data entries', () => {
    inspectionRepository.updateFormDataEntry('entry-session', 'ext.foo', 'value');
    inspectionRepository.updateFormDataEntry('entry-session', 'ext.bar', true);
    expect(inspectionRepository.loadFormData('entry-session')).toEqual({
      'ext.foo': 'value',
      'ext.bar': true,
    });

    inspectionRepository.updateFormDataEntry('entry-session', 'ext.foo', undefined);
    expect(inspectionRepository.loadFormData('entry-session')).toEqual({
      'ext.bar': true,
    });

    inspectionRepository.clearFormData('entry-session');
    expect(inspectionRepository.loadFormData('entry-session')).toBeNull();
  });
});
