type RecordValue = Record<string, unknown>;

type StoreState = {
  keyPath: string;
  records: Map<string, RecordValue>;
  indexes: Map<string, string>;
};

const queueSuccess = <T>(request: IDBRequest<T>, result: T) => {
  setTimeout(() => {
    (request as { result: T }).result = result;
    request.onsuccess?.(new Event('success'));
  }, 0);
};

const queueError = (request: IDBRequest<unknown>, error: Error) => {
  setTimeout(() => {
    (request as { error: Error }).error = error;
    request.onerror?.(new Event('error'));
  }, 0);
};

const asVersionChangeEvent = (type: string) => new Event(type) as IDBVersionChangeEvent;

export const createIndexedDbMock = () => {
  const databases = new Map<string, Map<string, StoreState>>();

  const ensureDatabase = (name: string) => {
    let stores = databases.get(name);
    if (!stores) {
      stores = new Map<string, StoreState>();
      databases.set(name, stores);
    }

    return stores;
  };

  const indexedDB = {
    open: (name: string, _version?: number) => {
      const request = {} as IDBOpenDBRequest;
      const stores = ensureDatabase(name);

      const db = {
        objectStoreNames: {
          contains: (storeName: string) => stores.has(storeName),
        },
        createObjectStore: (storeName: string, options?: IDBObjectStoreParameters) => {
          const keyPath = String(options?.keyPath ?? 'id');
          const storeState: StoreState = {
            keyPath,
            records: new Map<string, RecordValue>(),
            indexes: new Map<string, string>(),
          };
          stores.set(storeName, storeState);

          return {
            createIndex: (indexName: string, keyPathValue: string) => {
              storeState.indexes.set(indexName, keyPathValue);
            },
          } as unknown as IDBObjectStore;
        },
        transaction: (storeNames: string | string[], _mode: IDBTransactionMode) => {
          const names = Array.isArray(storeNames) ? storeNames : [storeNames];
          const transaction = {
            objectStore: (storeName: string) => {
              if (!names.includes(storeName)) {
                throw new Error(`Store ${storeName} is not part of this transaction.`);
              }

              const storeState = stores.get(storeName);
              if (!storeState) {
                throw new Error(`Store ${storeName} does not exist.`);
              }

              const store = {
                put: (value: RecordValue) => {
                  const request = {} as IDBRequest<unknown>;
                  const key = String(value[storeState.keyPath]);
                  storeState.records.set(key, structuredClone(value));
                  queueSuccess(request, key);
                  return request;
                },
                get: (key: string) => {
                  const request = {} as IDBRequest<RecordValue | undefined>;
                  queueSuccess(request, structuredClone(storeState.records.get(String(key))));
                  return request;
                },
                getAll: () => {
                  const request = {} as IDBRequest<RecordValue[]>;
                  queueSuccess(request, Array.from(storeState.records.values()).map((value) => structuredClone(value)));
                  return request;
                },
                delete: (key: string) => {
                  const request = {} as IDBRequest<undefined>;
                  storeState.records.delete(String(key));
                  queueSuccess(request, undefined);
                  return request;
                },
                index: (indexName: string) => {
                  const indexKeyPath = storeState.indexes.get(indexName);
                  if (!indexKeyPath) {
                    throw new Error(`Index ${indexName} does not exist on ${storeName}.`);
                  }

                  return {
                    getAll: (query: IDBValidKey) => {
                      const request = {} as IDBRequest<RecordValue[]>;
                      const values = Array.from(storeState.records.values())
                        .filter((value) => String(value[indexKeyPath]) === String(query))
                        .map((value) => structuredClone(value));
                      queueSuccess(request, values);
                      return request;
                    },
                  } as unknown as IDBIndex;
                },
              } as unknown as IDBObjectStore;

              return store;
            },
          } as IDBTransaction;

          setTimeout(() => {
            transaction.oncomplete?.(new Event('complete'));
          }, 0);

          return transaction;
        },
        close: () => undefined,
      } as unknown as IDBDatabase;

      setTimeout(() => {
        (request as { result: IDBDatabase }).result = db;
        request.onupgradeneeded?.(asVersionChangeEvent('upgradeneeded'));
        request.onsuccess?.(new Event('success'));
      }, 0);

      return request;
    },
    deleteDatabase: (name: string) => {
      const request = {} as IDBOpenDBRequest;

      setTimeout(() => {
        databases.delete(name);
        request.onsuccess?.(new Event('success'));
      }, 0);

      return request;
    },
  } as unknown as IDBFactory;

  return {
    indexedDB,
    reset() {
      databases.clear();
    },
    fail(errorMessage: string) {
      return {
        indexedDB: {
          open: () => {
            const request = {} as IDBOpenDBRequest;
            queueError(request as IDBRequest<unknown>, new Error(errorMessage));
            return request;
          },
          deleteDatabase: indexedDB.deleteDatabase.bind(indexedDB),
        } as unknown as IDBFactory,
      };
    },
  };
};
