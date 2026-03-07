import { describe, expect, it } from 'vitest';
import { createIndexedDbMock } from './indexedDbMock';

const requestToPromise = <T>(request: IDBRequest<T>) =>
  new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

const openDatabase = async (indexedDBFactory: IDBFactory, name: string) => {
  const request = indexedDBFactory.open(name, 1);

  return new Promise<IDBDatabase>((resolve, reject) => {
    request.onupgradeneeded = () => {
      const db = request.result;
      const widgets = db.createObjectStore('widgets');
      widgets.createIndex('scopeKey', 'scopeKey');
      db.createObjectStore('items', { keyPath: 'customKey' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
};

describe('createIndexedDbMock', () => {
  it('supports object stores, indexes, cloning, and database reset', async () => {
    const mock = createIndexedDbMock();
    const db = await openDatabase(mock.indexedDB, 'mock-db');
    const widgets = db.transaction(['widgets', 'items'], 'readwrite').objectStore('widgets');
    const items = db.transaction('items', 'readwrite').objectStore('items');

    const record = { id: 'widget-1', scopeKey: 'tenant-a:user-1', nested: { value: 1 } };
    await requestToPromise(widgets.put(record));
    await requestToPromise(items.put({ customKey: 'item-1', label: 'Item 1' }));

    record.nested.value = 99;

    expect(await requestToPromise(widgets.get('widget-1'))).toEqual({
      id: 'widget-1',
      scopeKey: 'tenant-a:user-1',
      nested: { value: 1 },
    });
    expect(await requestToPromise(widgets.getAll())).toEqual([
      { id: 'widget-1', scopeKey: 'tenant-a:user-1', nested: { value: 1 } },
    ]);
    expect(await requestToPromise(widgets.index('scopeKey').getAll('tenant-a:user-1'))).toEqual([
      { id: 'widget-1', scopeKey: 'tenant-a:user-1', nested: { value: 1 } },
    ]);

    await requestToPromise(widgets.delete('widget-1'));
    expect(await requestToPromise(widgets.getAll())).toEqual([]);

    mock.reset();

    const reopened = await openDatabase(mock.indexedDB, 'mock-db');
    expect(await requestToPromise(reopened.transaction('widgets', 'readonly').objectStore('widgets').getAll())).toEqual([]);
  });

  it('throws for invalid transaction store access and missing indexes', async () => {
    const mock = createIndexedDbMock();
    const db = await openDatabase(mock.indexedDB, 'errors-db');
    const transaction = db.transaction('widgets', 'readonly');

    expect(() => transaction.objectStore('items')).toThrow('Store items is not part of this transaction.');
    expect(() => db.transaction('missing', 'readonly').objectStore('missing')).toThrow('Store missing does not exist.');
    expect(() => transaction.objectStore('widgets').index('missing')).toThrow(
      'Index missing does not exist on widgets.'
    );
  });

  it('can simulate open failures', async () => {
    const failingIndexedDb = createIndexedDbMock().fail('open failed').indexedDB;
    const request = failingIndexedDb.open('broken-db', 1);

    await expect(requestToPromise(request)).rejects.toThrow('open failed');
  });
});
