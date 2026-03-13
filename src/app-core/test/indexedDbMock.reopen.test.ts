import { describe, expect, it } from 'vitest';
import { createIndexedDbMock } from './indexedDbMock';

const openDatabase = async (indexedDBFactory: IDBFactory, name: string, onUpgrade?: (db: IDBDatabase) => void) => {
  const request = indexedDBFactory.open(name, 1);

  return new Promise<IDBDatabase>((resolve, reject) => {
    request.onupgradeneeded = () => {
      onUpgrade?.(request.result);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
};

describe('createIndexedDbMock reopen behavior', () => {
  it('reuses an existing database when opened again with the same name', async () => {
    const mock = createIndexedDbMock();

    await openDatabase(mock.indexedDB, 'shared-db', (db) => {
      db.createObjectStore('widgets');
    });

    const reopened = await openDatabase(mock.indexedDB, 'shared-db');

    expect(reopened.objectStoreNames.contains('widgets')).toBe(true);
  });
});
