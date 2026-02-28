import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { deleteFile, deleteFiles, getFile, saveFile, saveFiles } from './fileStorage';

type Operation = 'put' | 'get' | 'delete';

type IndexedDbMockOptions = {
  openError?: boolean;
  requestErrorOn?: Operation;
  abortOn?: Operation;
  existingStore?: boolean;
  forceUpgradeEvent?: boolean;
};

const flushAsync = async () => {
  await new Promise((resolve) => setTimeout(resolve, 0));
};

const createIndexedDbMock = (options: IndexedDbMockOptions = {}) => {
  const records = new Map<string, unknown>();
  let storeCreated = options.existingStore ?? false;

  const open = vi.fn(() => {
    const request = {} as IDBOpenDBRequest;

    const db = {
      objectStoreNames: {
        contains: (storeName: string) => storeCreated && storeName === 'files',
      },
      createObjectStore: vi.fn(() => {
        storeCreated = true;
        return {} as IDBObjectStore;
      }),
      transaction: vi.fn((_storeName: string, _mode: IDBTransactionMode) => {
        const transaction = {} as IDBTransaction;

        const makeRequest = <T>(op: Operation, compute: () => T): IDBRequest<T> => {
          const opRequest = {} as IDBRequest<T>;
          setTimeout(() => {
            if (options.requestErrorOn === op) {
              (opRequest as { error: Error }).error = new Error(`${op} failed`);
              opRequest.onerror?.(new Event('error'));
              return;
            }

            if (options.abortOn === op) {
              (transaction as { error: Error }).error = new Error(`${op} aborted`);
              transaction.onabort?.(new Event('abort'));
              return;
            }

            (opRequest as { result: T }).result = compute();
            opRequest.onsuccess?.(new Event('success'));
          }, 0);
          return opRequest;
        };

        const store = {
          put: vi.fn((value: { id: string }) =>
            makeRequest('put', () => {
              records.set(value.id, value);
              return value.id;
            })
          ),
          get: vi.fn((id: string) => makeRequest('get', () => records.get(id))),
          delete: vi.fn((id: string) =>
            makeRequest('delete', () => {
              records.delete(id);
              return undefined;
            })
          ),
        } as unknown as IDBObjectStore;

        transaction.objectStore = vi.fn(() => store);
        return transaction;
      }),
    } as unknown as IDBDatabase;

    setTimeout(() => {
      if (options.openError) {
        (request as { error: Error }).error = new Error('open failed');
        request.onerror?.(new Event('error'));
        return;
      }

      if (!storeCreated || options.forceUpgradeEvent) {
        (request as { result: IDBDatabase }).result = db;
        request.onupgradeneeded?.(new Event('upgradeneeded'));
      }

      (request as { result: IDBDatabase }).result = db;
      request.onsuccess?.(new Event('success'));
    }, 0);

    return request;
  });

  return {
    indexedDB: { open } as unknown as IDBFactory,
    records,
    open,
  };
};

const makeFile = (name: string) => new File(['file-content'], name, { type: 'text/plain' });

describe('fileStorage', () => {
  const originalCrypto = globalThis.crypto;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.stubGlobal('crypto', originalCrypto);
  });

  it('saves and fetches a file with context metadata', async () => {
    const idb = createIndexedDbMock();
    vi.stubGlobal('indexedDB', idb.indexedDB);
    vi.stubGlobal('crypto', { randomUUID: () => 'fixed-id' } as Crypto);

    const file = makeFile('doc.txt');
    const reference = await saveFile(file, { sessionId: 'session-1', fieldId: 'field-1' });

    expect(reference).toEqual({
      id: 'fixed-id',
      name: 'doc.txt',
      type: 'text/plain',
      size: file.size,
      lastModified: file.lastModified,
    });

    const stored = await getFile(reference.id);
    expect(stored).toMatchObject({
      id: 'fixed-id',
      name: 'doc.txt',
      sessionId: 'session-1',
      fieldId: 'field-1',
    });
    expect(stored?.blob).toBeInstanceOf(File);
    expect(idb.open).toHaveBeenCalled();
  });

  it('falls back to generated id when crypto.randomUUID is unavailable', async () => {
    const idb = createIndexedDbMock();
    vi.stubGlobal('indexedDB', idb.indexedDB);
    vi.stubGlobal('crypto', {} as Crypto);

    const reference = await saveFile(makeFile('fallback.txt'));

    expect(reference.id).toMatch(/^\d+-[0-9a-f]+$/);
  });

  it('saves and deletes multiple files', async () => {
    const idb = createIndexedDbMock();
    vi.stubGlobal('indexedDB', idb.indexedDB);
    vi.stubGlobal('crypto', { randomUUID: () => `id-${Math.random()}` } as Crypto);

    const [first, second] = await saveFiles([makeFile('one.txt'), makeFile('two.txt')]);
    expect(await getFile(first.id)).not.toBeNull();
    expect(await getFile(second.id)).not.toBeNull();

    await deleteFiles([first.id, second.id]);

    expect(await getFile(first.id)).toBeNull();
    expect(await getFile(second.id)).toBeNull();
  });

  it('deletes a single file', async () => {
    const idb = createIndexedDbMock();
    vi.stubGlobal('indexedDB', idb.indexedDB);
    vi.stubGlobal('crypto', { randomUUID: () => 'single-delete-id' } as Crypto);

    const saved = await saveFile(makeFile('delete-me.txt'));
    expect(await getFile(saved.id)).not.toBeNull();

    await deleteFile(saved.id);
    expect(await getFile(saved.id)).toBeNull();
  });

  it('returns null when fetching a missing file', async () => {
    const idb = createIndexedDbMock();
    vi.stubGlobal('indexedDB', idb.indexedDB);

    expect(await getFile('missing-id')).toBeNull();
  });

  it('rejects when opening the database fails', async () => {
    const idb = createIndexedDbMock({ openError: true });
    vi.stubGlobal('indexedDB', idb.indexedDB);

    await expect(saveFile(makeFile('fail-open.txt'))).rejects.toThrow('open failed');
  });

  it('rejects when the request errors', async () => {
    const idb = createIndexedDbMock({ requestErrorOn: 'put' });
    vi.stubGlobal('indexedDB', idb.indexedDB);

    await expect(saveFile(makeFile('fail-put.txt'))).rejects.toThrow('put failed');
  });

  it('rejects when the transaction aborts', async () => {
    const idb = createIndexedDbMock({ abortOn: 'delete' });
    vi.stubGlobal('indexedDB', idb.indexedDB);
    vi.stubGlobal('crypto', { randomUUID: () => 'abort-id' } as Crypto);

    const saved = await saveFile(makeFile('abort-delete.txt'));
    await expect(deleteFile(saved.id)).rejects.toThrow('delete aborted');
  });

  it('rejects when read request errors', async () => {
    const idb = createIndexedDbMock({ requestErrorOn: 'get' });
    vi.stubGlobal('indexedDB', idb.indexedDB);

    await expect(getFile('any-id')).rejects.toThrow('get failed');
  });

  it('rejects when delete request errors', async () => {
    const idb = createIndexedDbMock({ requestErrorOn: 'delete' });
    vi.stubGlobal('indexedDB', idb.indexedDB);

    await expect(deleteFile('any-id')).rejects.toThrow('delete failed');
  });

  it('skips creating object store when it already exists during upgrade event', async () => {
    const idb = createIndexedDbMock({ existingStore: true, forceUpgradeEvent: true });
    vi.stubGlobal('indexedDB', idb.indexedDB);
    vi.stubGlobal('crypto', { randomUUID: () => 'existing-store-id' } as Crypto);

    const saved = await saveFile(makeFile('existing.txt'));
    expect(saved.id).toBe('existing-store-id');
  });
});
