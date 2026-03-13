type RecordValue = Record<string, unknown>;

type StoreState = {
  keyPath: string;
  records: Map<string, RecordValue>;
  indexes: Map<string, string>;
};

type DatabaseState = {
  version: number;
  stores: Map<string, StoreState>;
};

const queueError = (request: IDBRequest<unknown>, error: Error) => {
  setTimeout(() => {
    (request as { error: Error }).error = error;
    request.onerror?.(new Event('error'));
  }, 0);
};

const asVersionChangeEvent = (type: string, oldVersion: number, newVersion: number | null) =>
  Object.assign(new Event(type), { oldVersion, newVersion }) as IDBVersionChangeEvent;

export const createIndexedDbMock = () => {
  const databases = new Map<string, DatabaseState>();
  let nextOpenFailure: Error | null = null;
  let writeFailure: Error | null = null;

  const ensureDatabase = (name: string) => {
    let database = databases.get(name);
    if (!database) {
      database = {
        version: 0,
        stores: new Map<string, StoreState>(),
      };
      databases.set(name, database);
    }

    return database;
  };

  const indexedDB = {
    open: (name: string, version?: number) => {
      const request = {} as IDBOpenDBRequest;
      const database = ensureDatabase(name);
      const stores = database.stores;

      if (nextOpenFailure) {
        const failure = nextOpenFailure;
        nextOpenFailure = null;
        queueError(request as IDBRequest<unknown>, failure);
        return request;
      }

      const requestedVersion = version ?? Math.max(database.version, 1);
      const oldVersion = database.version;
      const shouldUpgrade = requestedVersion > oldVersion;

      if (requestedVersion < oldVersion) {
        queueError(request as IDBRequest<unknown>, new Error('VersionError'));
        return request;
      }

      const db = {
        get version() {
          return database.version;
        },
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
          let pendingOperations = 0;
          let completionQueued = false;

          const completeIfIdle = () => {
            if (completionQueued || pendingOperations > 0) {
              return;
            }

            completionQueued = true;
            setTimeout(() => {
              transaction.oncomplete?.(new Event('complete'));
            }, 0);
          };

          const queueOperation = <T>(request: IDBRequest<T>, operation: () => void) => {
            pendingOperations += 1;
            setTimeout(() => {
              operation();
              pendingOperations -= 1;
              completeIfIdle();
            }, 0);
            return request;
          };

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
                  if (writeFailure) {
                    pendingOperations += 1;
                    setTimeout(() => {
                      (request as { error: Error }).error = writeFailure!;
                      request.onerror?.(new Event('error'));
                      pendingOperations -= 1;
                      (transaction as { error?: Error }).error = writeFailure!;
                      transaction.onerror?.(new Event('error'));
                      transaction.onabort?.(new Event('abort'));
                    }, 0);
                    return request;
                  }
                  const key = String(value[storeState.keyPath]);
                  return queueOperation(request, () => {
                    storeState.records.set(key, structuredClone(value));
                    (request as { result: unknown }).result = key;
                    request.onsuccess?.(new Event('success'));
                  });
                },
                get: (key: string) => {
                  const request = {} as IDBRequest<RecordValue | undefined>;
                  return queueOperation(request, () => {
                    (request as { result: RecordValue | undefined }).result = structuredClone(
                      storeState.records.get(String(key))
                    );
                    request.onsuccess?.(new Event('success'));
                  });
                },
                getAll: () => {
                  const request = {} as IDBRequest<RecordValue[]>;
                  return queueOperation(request, () => {
                    (request as { result: RecordValue[] }).result = Array.from(storeState.records.values()).map((value) =>
                      structuredClone(value)
                    );
                    request.onsuccess?.(new Event('success'));
                  });
                },
                delete: (key: string) => {
                  const request = {} as IDBRequest<undefined>;
                  return queueOperation(request, () => {
                    storeState.records.delete(String(key));
                    (request as { result: undefined }).result = undefined;
                    request.onsuccess?.(new Event('success'));
                  });
                },
                index: (indexName: string) => {
                  const indexKeyPath = storeState.indexes.get(indexName);
                  if (!indexKeyPath) {
                    throw new Error(`Index ${indexName} does not exist on ${storeName}.`);
                  }

                  return {
                    getAll: (query: IDBValidKey) => {
                      const request = {} as IDBRequest<RecordValue[]>;
                      return queueOperation(request, () => {
                        (request as { result: RecordValue[] }).result = Array.from(storeState.records.values())
                          .filter((value) => String(value[indexKeyPath]) === String(query))
                          .map((value) => structuredClone(value));
                        request.onsuccess?.(new Event('success'));
                      });
                    },
                  } as unknown as IDBIndex;
                },
              } as unknown as IDBObjectStore;

              return store;
            },
          } as IDBTransaction;
          setTimeout(() => {
            completeIfIdle();
          }, 0);

          return transaction;
        },
        close: () => undefined,
      } as unknown as IDBDatabase;

      setTimeout(() => {
        if (shouldUpgrade) {
          database.version = requestedVersion;
        }
        (request as { result: IDBDatabase }).result = db;
        if (shouldUpgrade) {
          request.onupgradeneeded?.(asVersionChangeEvent('upgradeneeded', oldVersion, requestedVersion));
        }
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
      nextOpenFailure = null;
      writeFailure = null;
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
    failNextOpen(errorMessage: string, errorName = 'UnknownError') {
      nextOpenFailure = Object.assign(new Error(errorMessage), { name: errorName });
      return this;
    },
    failWrites(errorMessage: string, errorName = 'QuotaExceededError') {
      writeFailure = Object.assign(new Error(errorMessage), { name: errorName });
      return this;
    },
  };
};
