import { afterEach, describe, expect, it, vi } from 'vitest';
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

  it('loads all inspection records and de-duplicates by session id', async () => {
    const first = makeInspection('abc');
    const latest = makeInspection('abc', { name: 'Latest', uploadStatus: UploadStatus.Uploaded });
    const second = makeInspection('def');

    localStorage.setItem(getInspectionStorageKey('abc'), JSON.stringify(first));
    localStorage.setItem(getInspectionStorageKey('def'), JSON.stringify(second));
    localStorage.setItem(getInspectionStorageKey('duplicate'), JSON.stringify(latest));
    localStorage.setItem(getInspectionStorageKey('tenant-b', 'tenant-b', 'user-123'), JSON.stringify(makeInspection('tenant-b')));
    localStorage.setItem(getInspectionStorageKey('user-b', 'tenant-a', 'user-b'), JSON.stringify(makeInspection('user-b')));
    localStorage.setItem('unrelated_key', JSON.stringify({ foo: 'bar' }));

    const loaded = await inspectionRepository.loadAll();

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
    expect(localStorage.getItem(getInspectionStorageKey('abc'))).toBeNull();
  });

  it('ignores malformed inspections while loading all', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    localStorage.setItem(getInspectionStorageKey('valid'), JSON.stringify(makeInspection('valid')));
    localStorage.setItem(getInspectionStorageKey('bad'), '{bad-json');

    const loaded = await inspectionRepository.loadAll();

    expect(loaded).toHaveLength(1);
    expect(loaded[0].id).toBe('valid');
    expect(consoleSpy).toHaveBeenCalled();
  });

  it('loads inspection by id and returns null when missing or malformed', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const inspection = makeInspection('by-id');

    const normalizedInspection = { ...inspection, tenantId: 'tenant-a', userId: 'user-123' };
    localStorage.setItem(getInspectionStorageKey('by-id'), JSON.stringify(inspection));
    localStorage.setItem(getInspectionStorageKey('bad-id'), 'not-json');
    expect(await inspectionRepository.loadById('by-id')).toEqual(normalizedInspection);
    expect(await inspectionRepository.loadById('missing')).toBeNull();
    expect(await inspectionRepository.loadById('bad-id')).toBeNull();
    expect(consoleSpy).toHaveBeenCalled();
  });

  it('loads inspection by id from an explicit inspection scope', async () => {
    const inspection = makeInspection('scoped-id', {
      tenantId: 'tenant-a',
      userId: 'impersonated-user',
    });

    localStorage.setItem(
      getInspectionStorageKey('scoped-id', 'tenant-a', 'impersonated-user'),
      JSON.stringify(inspection)
    );

    setActiveTenantId('tenant-b');

    expect(
      await inspectionRepository.loadById('scoped-id', {
        tenantId: 'tenant-a',
        userId: 'impersonated-user',
      })
    ).toEqual({
      ...inspection,
      tenantId: 'tenant-a',
      userId: 'impersonated-user',
    });
    expect(await inspectionRepository.loadById('scoped-id')).toBeNull();
  });

  it('saves inspection and current session records', async () => {
    const inspection = makeInspection('save-test', { uploadStatus: UploadStatus.InProgress });
    const normalizedInspection = { ...inspection, tenantId: 'tenant-a', userId: 'user-123' };

    await inspectionRepository.save(inspection);
    await inspectionRepository.saveCurrent(inspection);

    expect(await inspectionRepository.loadById('save-test')).toEqual(normalizedInspection);
    expect(await inspectionRepository.loadCurrent()).toEqual(normalizedInspection);
  });

  it('saves inspection as current in a single operation', async () => {
    const inspection = makeInspection('save-as-current-test', { uploadStatus: UploadStatus.InProgress });
    const normalizedInspection = { ...inspection, tenantId: 'tenant-a', userId: 'user-123' };

    await inspectionRepository.saveAsCurrent(inspection);

    expect(await inspectionRepository.loadById('save-as-current-test')).toEqual(normalizedInspection);
    expect(await inspectionRepository.loadCurrent()).toEqual(normalizedInspection);
  });

  it('updates inspection and returns the updated object', async () => {
    const inspection = makeInspection('update-test', { uploadStatus: UploadStatus.Uploading });

    const result = await inspectionRepository.update(inspection);

    expect(result).toEqual(inspection);
    expect(await inspectionRepository.loadById('update-test')).toEqual({
      ...inspection,
      tenantId: 'tenant-a',
      userId: 'user-123',
    });
  });

  it('keeps inspection and form data in the inspection tenant after the active tenant changes', async () => {
    const inspection = makeInspection('tenant-pinned', { tenantId: 'tenant-a' });

    await inspectionRepository.saveAsCurrent(inspection);
    await inspectionRepository.updateFormDataEntry(inspection.id, 'ext.note', 'before switch', inspection);

    setActiveTenantId('tenant-b');

    await inspectionRepository.saveCurrent({ ...inspection, name: 'Updated after switch' });
    await inspectionRepository.updateFormDataEntry(inspection.id, 'ext.note', 'after switch', inspection);

    expect(await inspectionRepository.loadById('tenant-pinned', { tenantId: 'tenant-a', userId: 'user-123' })).toEqual({
      ...inspection,
      tenantId: 'tenant-a',
      userId: 'user-123',
    });
    expect(await inspectionRepository.loadCurrent({ tenantId: 'tenant-a', userId: 'user-123' })).toEqual({
      ...inspection,
      name: 'Updated after switch',
      tenantId: 'tenant-a',
      userId: 'user-123',
    });
    expect(await inspectionRepository.loadCurrent({ tenantId: 'tenant-b', userId: 'user-123' })).toBeNull();
    expect(await inspectionRepository.loadFormData('tenant-pinned', { tenantId: 'tenant-a', userId: 'user-123' })).toEqual({
      'ext.note': 'after switch',
    });
  });

  it('loads current session and handles malformed current session', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const inspection = makeInspection('current');
    const normalizedInspection = { ...inspection, tenantId: 'tenant-a', userId: 'user-123' };

    localStorage.setItem(getCurrentSessionStorageKey(), JSON.stringify(inspection));
    expect(await inspectionRepository.loadCurrent()).toEqual(normalizedInspection);
    expect(localStorage.getItem(getCurrentSessionStorageKey())).toBeNull();
  });

  it('returns null and logs when the migrated current session payload is malformed', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    localStorage.setItem(getCurrentSessionStorageKey(), 'bad-json');
    expect(await inspectionRepository.loadCurrent()).toBeNull();
    expect(consoleSpy).toHaveBeenCalled();
  });

  it('loads current session by id and falls back to inspection when current does not match', async () => {
    const current = makeInspection('current-session');
    const fallback = makeInspection('fallback-session');
    const normalizedCurrent = { ...current, tenantId: 'tenant-a', userId: 'user-123' };
    const normalizedFallback = { ...fallback, tenantId: 'tenant-a', userId: 'user-123' };

    localStorage.setItem(getCurrentSessionStorageKey(), JSON.stringify(current));
    localStorage.setItem(getInspectionStorageKey('fallback-session'), JSON.stringify(fallback));

    expect(await inspectionRepository.loadCurrentOrById('current-session')).toEqual(normalizedCurrent);
    expect(await inspectionRepository.loadCurrentOrById('fallback-session')).toEqual(normalizedFallback);
    expect(await inspectionRepository.loadCurrentOrById('missing-session')).toBeNull();
  });

  it('loads inspection by id from explicit scope when current scope differs', async () => {
    const scopedInspection = makeInspection('scoped-fallback', {
      tenantId: 'tenant-a',
      userId: 'impersonated-user',
    });

    localStorage.setItem(
      getInspectionStorageKey('scoped-fallback', 'tenant-a', 'impersonated-user'),
      JSON.stringify(scopedInspection)
    );

    setActiveTenantId('tenant-b');

    expect(
      await inspectionRepository.loadCurrentOrById('scoped-fallback', {
        tenantId: 'tenant-a',
        userId: 'impersonated-user',
      })
    ).toEqual({
      ...scopedInspection,
      tenantId: 'tenant-a',
      userId: 'impersonated-user',
    });
  });

  it('deletes inspection, form data, and current session when matching', async () => {
    const inspection = makeInspection('delete-me');

    await inspectionRepository.save(inspection);
    await inspectionRepository.saveFormData('delete-me', { extId: 'value' });
    await inspectionRepository.saveCurrent(inspection);

    await inspectionRepository.delete('delete-me');

    expect(await inspectionRepository.loadById('delete-me')).toBeNull();
    expect(await inspectionRepository.loadFormData('delete-me')).toBeNull();
    expect(await inspectionRepository.loadCurrent()).toBeNull();
  });

  it('supports delete options for preserving related storage entries', async () => {
    const inspection = makeInspection('keep-data');
    const otherCurrent = makeInspection('other-current');
    await inspectionRepository.save(inspection);
    await inspectionRepository.saveFormData('keep-data', { extId: 'value' });
    await inspectionRepository.saveCurrent(otherCurrent);

    await inspectionRepository.delete('keep-data', {
      removeFormData: false,
      removeCurrentIfMatch: false,
    });

    expect(await inspectionRepository.loadById('keep-data')).toBeNull();
    expect(await inspectionRepository.loadFormData('keep-data')).toEqual({ extId: 'value' });
    expect(await inspectionRepository.loadCurrent()).toEqual({
      ...otherCurrent,
      tenantId: 'tenant-a',
      userId: 'user-123',
    });
  });

  it('loads and saves form data payloads', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const formData: Record<string, FormDataValue> = {
      yesNo: true,
      comment: 'hello',
      multi: ['a', 'b'],
    };

    await inspectionRepository.saveFormData('form-session', formData);
    expect(await inspectionRepository.loadFormData('form-session')).toEqual(formData);
    expect(await inspectionRepository.loadFormData('missing-form')).toBeNull();
  });

  it('returns null and logs when migrated form data is malformed', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    localStorage.setItem(getFormDataStorageKey('bad-form'), '{bad-json');
    expect(await inspectionRepository.loadFormData('bad-form')).toBeNull();
    expect(consoleSpy).toHaveBeenCalled();
  });

  it('updates and clears individual form data entries', async () => {
    await inspectionRepository.updateFormDataEntry('entry-session', 'ext.foo', 'value');
    await inspectionRepository.updateFormDataEntry('entry-session', 'ext.bar', true);
    expect(await inspectionRepository.loadFormData('entry-session')).toEqual({
      'ext.foo': 'value',
      'ext.bar': true,
    });

    await inspectionRepository.updateFormDataEntry('entry-session', 'ext.foo', undefined);
    expect(await inspectionRepository.loadFormData('entry-session')).toEqual({
      'ext.bar': true,
    });

    await inspectionRepository.clearFormData('entry-session');
    expect(await inspectionRepository.loadFormData('entry-session')).toBeNull();
  });
});
