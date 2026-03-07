import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FormType, UploadStatus, type InspectionSession } from '../types';
import { createIndexedDbMock } from '../test/indexedDbMock';
import { appDataStore, type StorageScope } from './appDataStore';

const scope: StorageScope = { tenantId: 'tenant-a', userId: 'user-1' };
const otherScope: StorageScope = { tenantId: 'tenant-b', userId: 'user-2' };

const makeInspection = (id: string, overrides?: Partial<InspectionSession>): InspectionSession => ({
  id,
  name: `Inspection ${id}`,
  formType: FormType.HVAC,
  tenantId: scope.tenantId,
  userId: scope.userId,
  uploadStatus: UploadStatus.Local,
  ...overrides,
});

const makeQueueEntry = (inspectionId: string) => ({
  inspectionId,
  tenantId: scope.tenantId,
  userId: scope.userId,
  status: 'pending' as const,
  fingerprint: `fingerprint-${inspectionId}`,
  idempotencyKey: `idempotency-${inspectionId}`,
  attemptCount: 0,
  nextAttemptAt: 1,
  createdAt: 1,
  updatedAt: 1,
});

class BroadcastChannelMock {
  static channels = new Map<string, Set<BroadcastChannelMock>>();

  readonly listeners = new Set<(event: MessageEvent) => void>();

  constructor(public readonly name: string) {
    const existing = BroadcastChannelMock.channels.get(name) ?? new Set<BroadcastChannelMock>();
    existing.add(this);
    BroadcastChannelMock.channels.set(name, existing);
  }

  postMessage(data: unknown) {
    const subscribers = BroadcastChannelMock.channels.get(this.name) ?? new Set<BroadcastChannelMock>();
    subscribers.forEach((channel) => {
      channel.listeners.forEach((listener) => {
        listener({ data } as MessageEvent);
      });
    });
  }

  addEventListener(_type: string, listener: EventListener) {
    this.listeners.add(listener as (event: MessageEvent) => void);
  }

  removeEventListener(_type: string, listener: EventListener) {
    this.listeners.delete(listener as (event: MessageEvent) => void);
  }

  static reset() {
    BroadcastChannelMock.channels.clear();
  }
}

const loadFreshAppDataStore = async () => {
  vi.resetModules();
  return import('./appDataStore');
};

describe('appDataStore', () => {
  beforeEach(() => {
    vi.stubGlobal('BroadcastChannel', BroadcastChannelMock);
  });

  afterEach(() => {
    BroadcastChannelMock.reset();
  });

  it('migrates scoped localStorage records into IndexedDB and skips invalid payloads', async () => {
    const inspection = makeInspection('legacy-1');
    const currentSession = makeInspection('current-1');
    const queueEntry = makeQueueEntry('legacy-1');
    const workerLease = { ownerId: 'worker-a', expiresAt: 1234 };
    const formData = { note: 'saved' };
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    localStorage.setItem(
      `${scope.tenantId}:${scope.userId}:inspection_${inspection.id}`,
      JSON.stringify(inspection)
    );
    localStorage.setItem(
      `${scope.tenantId}:${scope.userId}:currentSession`,
      JSON.stringify(currentSession)
    );
    localStorage.setItem(
      `${scope.tenantId}:${scope.userId}:formData_${inspection.id}`,
      JSON.stringify(formData)
    );
    localStorage.setItem(
      `${scope.tenantId}:${scope.userId}:syncQueue_${inspection.id}`,
      JSON.stringify(queueEntry)
    );
    localStorage.setItem(
      `${scope.tenantId}:${scope.userId}:syncQueueWorkerLease`,
      JSON.stringify(workerLease)
    );
    localStorage.setItem(`${scope.tenantId}:${scope.userId}:inspection_broken`, '{');
    localStorage.setItem('not-a-scoped-record', 'ignored');

    expect(await appDataStore.listInspections(scope)).toEqual([inspection]);
    expect(
      await appDataStore.getInspection(`${scope.tenantId}:${scope.userId}:inspection_${inspection.id}`)
    ).toEqual(inspection);
    expect(await appDataStore.getCurrentSession(scope)).toEqual(currentSession);
    expect(
      await appDataStore.getFormData(`${scope.tenantId}:${scope.userId}:formData_${inspection.id}`)
    ).toEqual(formData);
    expect(await appDataStore.listQueueEntries(scope)).toEqual([queueEntry]);
    expect(
      await appDataStore.getQueueEntry(`${scope.tenantId}:${scope.userId}:syncQueue_${inspection.id}`)
    ).toEqual(queueEntry);
    expect(await appDataStore.getWorkerLease(scope)).toEqual({
      scopeKey: `${scope.tenantId}:${scope.userId}`,
      ...workerLease,
    });

    expect(localStorage.getItem(`${scope.tenantId}:${scope.userId}:inspection_${inspection.id}`)).toBeNull();
    expect(localStorage.getItem(`${scope.tenantId}:${scope.userId}:currentSession`)).toBeNull();
    expect(localStorage.getItem(`${scope.tenantId}:${scope.userId}:formData_${inspection.id}`)).toBeNull();
    expect(localStorage.getItem(`${scope.tenantId}:${scope.userId}:syncQueue_${inspection.id}`)).toBeNull();
    expect(localStorage.getItem(`${scope.tenantId}:${scope.userId}:syncQueueWorkerLease`)).toBeNull();
    expect(localStorage.getItem(`${scope.tenantId}:${scope.userId}:inspection_broken`)).toBe('{');
    expect(localStorage.getItem('not-a-scoped-record')).toBe('ignored');
    expect(errorSpy).toHaveBeenCalled();
  });

  it('supports CRUD operations across all scoped stores', async () => {
    const inspection = makeInspection('live-1');
    const storageKey = `${scope.tenantId}:${scope.userId}:inspection_${inspection.id}`;
    const formStorageKey = `${scope.tenantId}:${scope.userId}:formData_${inspection.id}`;
    const queueStorageKey = `${scope.tenantId}:${scope.userId}:syncQueue_${inspection.id}`;
    const formData = { ready: true, note: 'hello' };
    const queueEntry = makeQueueEntry(inspection.id);
    const workerLease = { ownerId: 'worker-b', expiresAt: 9999 };

    expect(appDataStore.getScopeKey(scope)).toBe('tenant-a:user-1');

    await appDataStore.putInspection(scope, storageKey, inspection);
    await appDataStore.putInspection(otherScope, `${otherScope.tenantId}:${otherScope.userId}:inspection_other`, makeInspection('other', {
      tenantId: otherScope.tenantId,
      userId: otherScope.userId,
    }));
    expect(await appDataStore.listInspections(scope)).toEqual([inspection]);
    expect(await appDataStore.getInspection(storageKey)).toEqual(inspection);

    await appDataStore.putCurrentSession(scope, inspection);
    expect(await appDataStore.getCurrentSession(scope)).toEqual(inspection);

    await appDataStore.putFormData(scope, formStorageKey, formData);
    expect(await appDataStore.getFormData(formStorageKey)).toEqual(formData);

    await appDataStore.putQueueEntry(scope, queueStorageKey, queueEntry);
    expect(await appDataStore.listQueueEntries(scope)).toEqual([queueEntry]);
    expect(await appDataStore.getQueueEntry(queueStorageKey)).toEqual(queueEntry);

    await appDataStore.putWorkerLease(scope, workerLease);
    expect(await appDataStore.getWorkerLease(scope)).toEqual({
      scopeKey: 'tenant-a:user-1',
      ...workerLease,
    });

    await appDataStore.deleteInspection(scope, storageKey);
    await appDataStore.deleteCurrentSession(scope);
    await appDataStore.deleteFormData(scope, formStorageKey);
    await appDataStore.deleteQueueEntry(scope, queueStorageKey);
    await appDataStore.deleteWorkerLease(scope);

    expect(await appDataStore.getInspection(storageKey)).toBeNull();
    expect(await appDataStore.getCurrentSession(scope)).toBeNull();
    expect(await appDataStore.getFormData(formStorageKey)).toBeNull();
    expect(await appDataStore.getQueueEntry(queueStorageKey)).toBeNull();
    expect(await appDataStore.getWorkerLease(scope)).toBeNull();
  });

  it('notifies subscribers for matching window events and unsubscribes cleanly', async () => {
    const scopedListener = vi.fn();
    const otherListener = vi.fn();
    const unsubscribeScoped = appDataStore.subscribe('tenant-a:user-1', scopedListener);
    const unsubscribeOther = appDataStore.subscribe('tenant-b:user-2', otherListener);

    await appDataStore.putInspection(
      scope,
      `${scope.tenantId}:${scope.userId}:inspection_subscribed`,
      makeInspection('subscribed')
    );

    expect(scopedListener).toHaveBeenCalledTimes(1);
    expect(otherListener).not.toHaveBeenCalled();

    scopedListener.mockClear();
    window.dispatchEvent(new CustomEvent('app-data-changed', { detail: { scopeKey: 'tenant-b:user-2', entity: 'inspections' } }));
    window.dispatchEvent(new CustomEvent('app-data-changed', { detail: { scopeKey: 'tenant-a:user-1', entity: 'inspections' } }));

    expect(scopedListener).toHaveBeenCalledTimes(1);
    expect(otherListener).toHaveBeenCalledTimes(1);

    unsubscribeScoped();
    unsubscribeOther();
    scopedListener.mockClear();
    otherListener.mockClear();

    await appDataStore.putInspection(
      scope,
      `${scope.tenantId}:${scope.userId}:inspection_after-unsubscribe`,
      makeInspection('after-unsubscribe')
    );

    expect(scopedListener).not.toHaveBeenCalled();
    expect(otherListener).not.toHaveBeenCalled();
  });

  it('rejects when clearing the database is blocked', async () => {
    await appDataStore.listInspections(scope);

    const deleteDatabase = vi.fn(() => {
      const request = {} as IDBOpenDBRequest;
      setTimeout(() => {
        request.onblocked?.(new Event('blocked'));
      }, 0);
      return request;
    });

    const originalDeleteDatabase = indexedDB.deleteDatabase.bind(indexedDB);
    indexedDB.deleteDatabase = deleteDatabase;

    await expect(appDataStore.clearAll()).rejects.toThrow(
      'Failed to clear IndexedDB because the database is blocked.'
    );

    indexedDB.deleteDatabase = originalDeleteDatabase;
  });

  it('works without BroadcastChannel support and ignores localStorage after migration is complete', async () => {
    const originalBroadcastChannel = globalThis.BroadcastChannel;
    vi.stubGlobal('BroadcastChannel', undefined);

    await appDataStore.putInspection(
      scope,
      `${scope.tenantId}:${scope.userId}:inspection_first`,
      makeInspection('first')
    );

    localStorage.setItem(
      `${scope.tenantId}:${scope.userId}:inspection_second`,
      JSON.stringify(makeInspection('second'))
    );

    expect(await appDataStore.listInspections(scope)).toEqual([
      expect.objectContaining({ id: 'first' }),
    ]);

    vi.stubGlobal('BroadcastChannel', originalBroadcastChannel);
  });

  it('reopens an initialized database without remigrating localStorage data', async () => {
    await appDataStore.putInspection(
      scope,
      `${scope.tenantId}:${scope.userId}:inspection_existing`,
      makeInspection('existing')
    );

    localStorage.setItem(
      `${scope.tenantId}:${scope.userId}:inspection_late`,
      JSON.stringify(makeInspection('late'))
    );

    const { appDataStore: freshStore } = await loadFreshAppDataStore();

    expect(await freshStore.listInspections(scope)).toEqual([
      expect.objectContaining({ id: 'existing' }),
    ]);
  });

  it('notifies subscribers for matching BroadcastChannel messages only', async () => {
    const { appDataStore: freshStore } = await loadFreshAppDataStore();
    const listener = vi.fn();
    const unsubscribe = freshStore.subscribe('tenant-a:user-1', listener);
    const externalChannel = new BroadcastChannelMock('react-poc-app-data');

    externalChannel.postMessage({ scopeKey: 'tenant-b:user-2', entity: 'inspections' });
    externalChannel.postMessage({ scopeKey: 'tenant-a:user-1', entity: 'inspections' });

    expect(listener).toHaveBeenCalledTimes(1);

    unsubscribe();
  });

  it('rejects when opening the database or a request fails', async () => {
    const failingOpen = createIndexedDbMock().fail('open failed').indexedDB;
    vi.stubGlobal('indexedDB', failingOpen);

    const { appDataStore: failingStore } = await loadFreshAppDataStore();
    await expect(failingStore.listInspections(scope)).rejects.toThrow('open failed');

    const requestErrorIndexedDb = {
      open: () => {
        const request = {} as IDBOpenDBRequest;
        const db = {
          objectStoreNames: {
            contains: () => true,
          },
          createObjectStore: () => ({ createIndex: () => undefined }),
          transaction: () =>
            ({
              objectStore: () => ({
                get: () => {
                  const failingRequest = {} as IDBRequest<unknown>;
                  setTimeout(() => {
                    (failingRequest as { error: Error }).error = new Error('request failed');
                    failingRequest.onerror?.(new Event('error'));
                  }, 0);
                  return failingRequest;
                },
              }),
            }) as IDBTransaction,
          close: () => undefined,
        } as unknown as IDBDatabase;

        setTimeout(() => {
          (request as { result: IDBDatabase }).result = db;
          request.onupgradeneeded?.(new Event('upgradeneeded'));
          request.onsuccess?.(new Event('success'));
        }, 0);

        return request;
      },
      deleteDatabase: indexedDB.deleteDatabase.bind(indexedDB),
    } as IDBFactory;

    vi.stubGlobal('indexedDB', requestErrorIndexedDb);
    const { appDataStore: requestFailingStore } = await loadFreshAppDataStore();
    await expect(requestFailingStore.listInspections(scope)).rejects.toThrow('request failed');
  });

  it('rejects when deleting the database errors', async () => {
    await appDataStore.listInspections(scope);

    const originalDeleteDatabase = indexedDB.deleteDatabase.bind(indexedDB);
    indexedDB.deleteDatabase = (() => {
      const request = {} as IDBOpenDBRequest;
      setTimeout(() => {
        (request as { error: Error }).error = new Error('delete failed');
        request.onerror?.(new Event('error'));
      }, 0);
      return request;
    }) as typeof indexedDB.deleteDatabase;

    await expect(appDataStore.clearAll()).rejects.toThrow('delete failed');

    indexedDB.deleteDatabase = originalDeleteDatabase;
  });
});
