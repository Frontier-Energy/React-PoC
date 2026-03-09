import type { FormDataValue, InspectionSession } from '../types';
import type { SyncQueueEntry } from '../domain/syncQueue';

const DB_NAME = 'react-poc-app-data';
const DB_VERSION = 2;

const META_STORE = 'meta';
const INSPECTIONS_STORE = 'inspections';
const CURRENT_SESSIONS_STORE = 'currentSessions';
const FORM_DATA_STORE = 'formData';
const SYNC_QUEUE_STORE = 'syncQueue';
const WORKER_LEASE_STORE = 'workerLeases';

const MIGRATION_KEY = 'localStorageMigrationComplete';
const SCHEMA_VERSION_KEY = 'schemaVersion';
const SCHEMA_UPDATED_AT_KEY = 'schemaUpdatedAt';
const LAST_RECOVERY_REASON_KEY = 'lastRecoveryReason';
const LAST_RECOVERY_AT_KEY = 'lastRecoveryAt';
const DATA_CHANGE_EVENT = 'app-data-changed';
const DATA_CHANGE_CHANNEL = 'react-poc-app-data';

const INSPECTION_PREFIX = 'inspection_';
const CURRENT_SESSION_KEY = 'currentSession';
const FORM_DATA_PREFIX = 'formData_';
const SYNC_QUEUE_PREFIX = 'syncQueue_';
const SYNC_WORKER_LEASE_KEY = 'syncQueueWorkerLease';

export type StorageScope = {
  tenantId: string;
  userId: string;
};

type ScopeRecord = {
  scopeKey: string;
};

type KeyedRecord<T> = ScopeRecord & {
  storageKey: string;
  value: T;
};

type CurrentSessionRecord = ScopeRecord & {
  value: InspectionSession;
};

type WorkerLease = {
  ownerId: string;
  expiresAt: number;
};

type MetaRecord = {
  key: string;
  value: boolean | number | string;
};

type DataChangeDetail = {
  scopeKey: string;
  entity: 'inspections' | 'currentSession' | 'formData' | 'syncQueue' | 'workerLease';
};

let dbPromise: Promise<IDBDatabase> | null = null;
let migrationPromise: Promise<void> | null = null;
let broadcastChannel: BroadcastChannel | null = null;
let recoveryPromise: Promise<void> | null = null;

type SchemaMigration = {
  version: number;
  description: string;
  up: (db: IDBDatabase) => void;
};

const createScopedStore = (db: IDBDatabase, storeName: string) => {
  const store = db.createObjectStore(storeName, { keyPath: 'storageKey' });
  store.createIndex('scopeKey', 'scopeKey', { unique: false });
};

const ensureStore = (db: IDBDatabase, storeName: string, create: () => void) => {
  if (!db.objectStoreNames.contains(storeName)) {
    create();
  }
};

const schemaMigrations: SchemaMigration[] = [
  {
    version: 1,
    description: 'Create initial scoped stores.',
    up: (db) => {
      ensureStore(db, META_STORE, () => {
        db.createObjectStore(META_STORE, { keyPath: 'key' });
      });
      ensureStore(db, INSPECTIONS_STORE, () => {
        createScopedStore(db, INSPECTIONS_STORE);
      });
      ensureStore(db, CURRENT_SESSIONS_STORE, () => {
        db.createObjectStore(CURRENT_SESSIONS_STORE, { keyPath: 'scopeKey' });
      });
      ensureStore(db, FORM_DATA_STORE, () => {
        createScopedStore(db, FORM_DATA_STORE);
      });
      ensureStore(db, SYNC_QUEUE_STORE, () => {
        createScopedStore(db, SYNC_QUEUE_STORE);
      });
      ensureStore(db, WORKER_LEASE_STORE, () => {
        db.createObjectStore(WORKER_LEASE_STORE, { keyPath: 'scopeKey' });
      });
    },
  },
  {
    version: 2,
    description: 'Adopt explicit schema versioning and recovery metadata.',
    up: (db) => {
      ensureStore(db, META_STORE, () => {
        db.createObjectStore(META_STORE, { keyPath: 'key' });
      });
    },
  },
];

const wrapStoreError = (error: unknown, operation: string): Error => {
  if (
    error instanceof Error &&
    (error.name === 'QuotaExceededError' || /quota|disk full|storage/i.test(error.message))
  ) {
    return new Error(`IndexedDB quota was exceeded while ${operation}. Clear some offline data and retry.`);
  }

  if (error instanceof Error) {
    return error;
  }

  return new Error(`IndexedDB failed while ${operation}.`);
};

const waitForTransaction = (transaction: IDBTransaction) =>
  new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error('IndexedDB transaction failed.'));
    transaction.onabort = () => reject(transaction.error ?? new Error('IndexedDB transaction was aborted.'));
  });

const applySchemaMigrations = (db: IDBDatabase, oldVersion: number, newVersion: number) => {
  schemaMigrations
    .filter((migration) => migration.version > oldVersion && migration.version <= newVersion)
    .forEach((migration) => {
      migration.up(db);
    });
};

const resetConnectionState = () => {
  dbPromise = null;
  migrationPromise = null;
};

const deleteDatabase = () =>
  new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(DB_NAME);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('Failed to clear IndexedDB because the database is blocked.'));
  });

const canRecoverFromOpenError = (error: unknown) => {
  if (!(error instanceof Error)) {
    return false;
  }

  return ['AbortError', 'InvalidStateError', 'NotFoundError', 'UnknownError'].includes(error.name);
};

const recoverCorruptedDatabase = async (reason: Error) => {
  if (!recoveryPromise) {
    recoveryPromise = (async () => {
      console.error('Recovering corrupted IndexedDB database.', reason);
      resetConnectionState();
      await deleteDatabase();
    })().finally(() => {
      recoveryPromise = null;
    });
  }

  await recoveryPromise;
};

const openDatabaseOnce = (): Promise<IDBDatabase> =>
  new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = request.result;
      applySchemaMigrations(db, event.oldVersion ?? 0, event.newVersion ?? DB_VERSION);
    };

    request.onblocked = () => reject(new Error('Failed to open IndexedDB because the database upgrade is blocked.'));
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => {
        db.close();
        resetConnectionState();
      };
      resolve(db);
    };
    request.onerror = () => reject(request.error ?? new Error('Failed to open IndexedDB.'));
  });

const openDatabase = async (): Promise<IDBDatabase> => {
  try {
    return await openDatabaseOnce();
  } catch (error) {
    if (!canRecoverFromOpenError(error)) {
      throw wrapStoreError(error, 'opening the app data database');
    }

    await recoverCorruptedDatabase(wrapStoreError(error, 'opening the app data database'));
    const reopened = await openDatabaseOnce();
    await putMetaEntriesToDb(reopened, [
      { key: LAST_RECOVERY_REASON_KEY, value: `${(error as Error).name}: ${(error as Error).message}` },
      { key: LAST_RECOVERY_AT_KEY, value: Date.now() },
    ]);
    return reopened;
  }
};

const getDatabase = () => {
  if (!dbPromise) {
    dbPromise = openDatabase();
  }

  return dbPromise;
};

const runTransaction = async <T>(
  storeNames: string[],
  mode: IDBTransactionMode,
  callback: (transaction: IDBTransaction) => Promise<T> | T
): Promise<T> => {
  const db = await getDatabase();
  const transaction = db.transaction(storeNames, mode);
  try {
    const result = await Promise.resolve(callback(transaction));
    await waitForTransaction(transaction);
    return result;
  } catch (error) {
    throw wrapStoreError(error, `${mode} transaction on ${storeNames.join(', ')}`);
  }
};

const requestToPromise = <T>(request: IDBRequest<T>) =>
  new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed.'));
  });

const putMetaEntriesToDb = async (db: IDBDatabase, entries: MetaRecord[]) => {
  const transaction = db.transaction([META_STORE], 'readwrite');
  const store = transaction.objectStore(META_STORE);
  entries.forEach((entry) => {
    store.put(entry);
  });
  try {
    await waitForTransaction(transaction);
  } catch (error) {
    throw wrapStoreError(error, 'updating IndexedDB schema metadata');
  }
};

const getMetaValue = async <T extends MetaRecord['value']>(key: string): Promise<T | null> => {
  const record = (await runTransaction([META_STORE], 'readonly', async (transaction) =>
    requestToPromise<MetaRecord | undefined>(transaction.objectStore(META_STORE).get(key))
  )) as MetaRecord | undefined;

  return (record?.value as T | undefined) ?? null;
};

const putMetaEntries = async (entries: MetaRecord[]) => {
  const db = await getDatabase();
  await putMetaEntriesToDb(db, entries);
};

const parseJson = <T>(raw: string | null, errorMessage: string): T | null => {
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as T;
  } catch (error) {
    console.error(errorMessage, error);
    return null;
  }
};

const getScopeKey = (scope: StorageScope) => `${scope.tenantId}:${scope.userId}`;

const getBroadcastChannel = () => {
  if (typeof BroadcastChannel === 'undefined') {
    return null;
  }

  if (!broadcastChannel) {
    broadcastChannel = new BroadcastChannel(DATA_CHANGE_CHANNEL);
  }

  return broadcastChannel;
};

const emitDataChange = (detail: DataChangeDetail) => {
  window.dispatchEvent(new CustomEvent(DATA_CHANGE_EVENT, { detail }));
  getBroadcastChannel()?.postMessage(detail);
};

const migrateLocalStorageData = async () => {
  const parsedInspections: KeyedRecord<InspectionSession>[] = [];
  const parsedFormData: KeyedRecord<Record<string, FormDataValue>>[] = [];
  const parsedQueueEntries: KeyedRecord<SyncQueueEntry>[] = [];
  const parsedCurrentSessions: CurrentSessionRecord[] = [];
  const parsedWorkerLeases: (ScopeRecord & WorkerLease)[] = [];
  const migratedKeys: string[] = [];

  Object.keys(localStorage).forEach((key) => {
    const [tenantId, userId, suffix] = key.split(':', 3);
    if (!tenantId || !userId || !suffix) {
      return;
    }

    const scopeKey = `${tenantId}:${userId}`;

    if (suffix.startsWith(INSPECTION_PREFIX)) {
      const value = parseJson<InspectionSession>(localStorage.getItem(key), `Failed to parse session ${key}:`);
      if (value) {
        parsedInspections.push({ storageKey: key, scopeKey, value });
        migratedKeys.push(key);
      }
      return;
    }

    if (suffix.startsWith(FORM_DATA_PREFIX)) {
      const value = parseJson<Record<string, FormDataValue>>(
        localStorage.getItem(key),
        `Failed to parse form data ${key}:`
      );
      if (value) {
        parsedFormData.push({ storageKey: key, scopeKey, value });
        migratedKeys.push(key);
      }
      return;
    }

    if (suffix.startsWith(SYNC_QUEUE_PREFIX)) {
      const value = parseJson<SyncQueueEntry>(localStorage.getItem(key), `Failed to parse sync queue entry ${key}:`);
      if (value) {
        parsedQueueEntries.push({ storageKey: key, scopeKey, value });
        migratedKeys.push(key);
      }
      return;
    }

    if (suffix === CURRENT_SESSION_KEY) {
      const value = parseJson<InspectionSession>(localStorage.getItem(key), 'Failed to parse current inspection session:');
      if (value) {
        parsedCurrentSessions.push({ scopeKey, value });
        migratedKeys.push(key);
      }
      return;
    }

    if (suffix === SYNC_WORKER_LEASE_KEY) {
      const value = parseJson<WorkerLease>(localStorage.getItem(key), 'Failed to parse sync worker lease:');
      if (value) {
        parsedWorkerLeases.push({ scopeKey, ...value });
        migratedKeys.push(key);
      }
    }
  });

  await runTransaction(
    [META_STORE, INSPECTIONS_STORE, CURRENT_SESSIONS_STORE, FORM_DATA_STORE, SYNC_QUEUE_STORE, WORKER_LEASE_STORE],
    'readwrite',
    async (transaction) => {
      const metaStore = transaction.objectStore(META_STORE);
      const inspectionsStore = transaction.objectStore(INSPECTIONS_STORE);
      const currentSessionsStore = transaction.objectStore(CURRENT_SESSIONS_STORE);
      const formDataStore = transaction.objectStore(FORM_DATA_STORE);
      const syncQueueStore = transaction.objectStore(SYNC_QUEUE_STORE);
      const workerLeaseStore = transaction.objectStore(WORKER_LEASE_STORE);

      parsedInspections.forEach((record) => inspectionsStore.put(record));
      parsedCurrentSessions.forEach((record) => currentSessionsStore.put(record));
      parsedFormData.forEach((record) => formDataStore.put(record));
      parsedQueueEntries.forEach((record) => syncQueueStore.put(record));
      parsedWorkerLeases.forEach((record) => workerLeaseStore.put(record));
      metaStore.put({ key: MIGRATION_KEY, value: true } satisfies MetaRecord);
    }
  );

  migratedKeys.forEach((key) => localStorage.removeItem(key));
};

const ensureMigration = async () => {
  if (!migrationPromise) {
    migrationPromise = (async () => {
      const db = await getDatabase();
      await putMetaEntries([
        { key: SCHEMA_VERSION_KEY, value: DB_VERSION },
        { key: SCHEMA_UPDATED_AT_KEY, value: Date.now() },
      ]);
      const migrationComplete = await getMetaValue<boolean>(MIGRATION_KEY);

      if (migrationComplete) {
        return;
      }

      if (db.objectStoreNames.contains(META_STORE)) {
        await migrateLocalStorageData();
      }
    })();
  }

  return migrationPromise;
};

const getAllByScope = async <T>(storeName: string, scopeKey: string): Promise<T[]> => {
  await ensureMigration();

  return runTransaction([storeName], 'readonly', async (transaction) => {
    const store = transaction.objectStore(storeName);
    const index = store.index('scopeKey');
    const records = await requestToPromise(index.getAll(scopeKey));
    return (records as Array<{ value: T }>).map((record) => record.value);
  });
};

const getByStorageKey = async <T>(storeName: string, storageKey: string): Promise<T | null> => {
  await ensureMigration();

  return runTransaction([storeName], 'readonly', async (transaction) => {
    const record = await requestToPromise<KeyedRecord<T> | undefined>(transaction.objectStore(storeName).get(storageKey));
    return record?.value ?? null;
  });
};

const putScopedValue = async <T>(storeName: string, scope: StorageScope, storageKey: string, value: T) => {
  await ensureMigration();

  await runTransaction([storeName], 'readwrite', async (transaction) => {
    transaction.objectStore(storeName).put({
      storageKey,
      scopeKey: getScopeKey(scope),
      value,
    } satisfies KeyedRecord<T>);
  });
};

const deleteScopedValue = async (storeName: string, storageKey: string) => {
  await ensureMigration();

  await runTransaction([storeName], 'readwrite', async (transaction) => {
    transaction.objectStore(storeName).delete(storageKey);
  });
};

export const appDataStore = {
  getScopeKey,

  async listInspections(scope: StorageScope) {
    return getAllByScope<InspectionSession>(INSPECTIONS_STORE, getScopeKey(scope));
  },

  async getInspection(storageKey: string) {
    return getByStorageKey<InspectionSession>(INSPECTIONS_STORE, storageKey);
  },

  async putInspection(scope: StorageScope, storageKey: string, value: InspectionSession) {
    await putScopedValue(INSPECTIONS_STORE, scope, storageKey, value);
    emitDataChange({ scopeKey: getScopeKey(scope), entity: 'inspections' });
  },

  async deleteInspection(scope: StorageScope, storageKey: string) {
    await deleteScopedValue(INSPECTIONS_STORE, storageKey);
    emitDataChange({ scopeKey: getScopeKey(scope), entity: 'inspections' });
  },

  async getCurrentSession(scope: StorageScope) {
    await ensureMigration();

    return runTransaction([CURRENT_SESSIONS_STORE], 'readonly', async (transaction) => {
      const record = await requestToPromise<CurrentSessionRecord | undefined>(
        transaction.objectStore(CURRENT_SESSIONS_STORE).get(getScopeKey(scope))
      );
      return record?.value ?? null;
    });
  },

  async putCurrentSession(scope: StorageScope, value: InspectionSession) {
    await ensureMigration();

    await runTransaction([CURRENT_SESSIONS_STORE], 'readwrite', async (transaction) => {
      transaction.objectStore(CURRENT_SESSIONS_STORE).put({
        scopeKey: getScopeKey(scope),
        value,
      } satisfies CurrentSessionRecord);
    });

    emitDataChange({ scopeKey: getScopeKey(scope), entity: 'currentSession' });
  },

  async deleteCurrentSession(scope: StorageScope) {
    await ensureMigration();

    await runTransaction([CURRENT_SESSIONS_STORE], 'readwrite', async (transaction) => {
      transaction.objectStore(CURRENT_SESSIONS_STORE).delete(getScopeKey(scope));
    });

    emitDataChange({ scopeKey: getScopeKey(scope), entity: 'currentSession' });
  },

  async getFormData(storageKey: string) {
    return getByStorageKey<Record<string, FormDataValue>>(FORM_DATA_STORE, storageKey);
  },

  async putFormData(scope: StorageScope, storageKey: string, value: Record<string, FormDataValue>) {
    await putScopedValue(FORM_DATA_STORE, scope, storageKey, value);
    emitDataChange({ scopeKey: getScopeKey(scope), entity: 'formData' });
  },

  async deleteFormData(scope: StorageScope, storageKey: string) {
    await deleteScopedValue(FORM_DATA_STORE, storageKey);
    emitDataChange({ scopeKey: getScopeKey(scope), entity: 'formData' });
  },

  async listQueueEntries(scope: StorageScope) {
    return getAllByScope<SyncQueueEntry>(SYNC_QUEUE_STORE, getScopeKey(scope));
  },

  async getQueueEntry(storageKey: string) {
    return getByStorageKey<SyncQueueEntry>(SYNC_QUEUE_STORE, storageKey);
  },

  async putQueueEntry(scope: StorageScope, storageKey: string, value: SyncQueueEntry) {
    await putScopedValue(SYNC_QUEUE_STORE, scope, storageKey, value);
    emitDataChange({ scopeKey: getScopeKey(scope), entity: 'syncQueue' });
  },

  async deleteQueueEntry(scope: StorageScope, storageKey: string) {
    await deleteScopedValue(SYNC_QUEUE_STORE, storageKey);
    emitDataChange({ scopeKey: getScopeKey(scope), entity: 'syncQueue' });
  },

  async getWorkerLease(scope: StorageScope) {
    await ensureMigration();

    return runTransaction([WORKER_LEASE_STORE], 'readonly', async (transaction) => {
      const record = await requestToPromise<(ScopeRecord & WorkerLease) | undefined>(
        transaction.objectStore(WORKER_LEASE_STORE).get(getScopeKey(scope))
      );
      return record ?? null;
    });
  },

  async putWorkerLease(scope: StorageScope, value: WorkerLease) {
    await ensureMigration();

    await runTransaction([WORKER_LEASE_STORE], 'readwrite', async (transaction) => {
      transaction.objectStore(WORKER_LEASE_STORE).put({
        scopeKey: getScopeKey(scope),
        ...value,
      } satisfies ScopeRecord & WorkerLease);
    });

    emitDataChange({ scopeKey: getScopeKey(scope), entity: 'workerLease' });
  },

  async deleteWorkerLease(scope: StorageScope) {
    await ensureMigration();

    await runTransaction([WORKER_LEASE_STORE], 'readwrite', async (transaction) => {
      transaction.objectStore(WORKER_LEASE_STORE).delete(getScopeKey(scope));
    });

    emitDataChange({ scopeKey: getScopeKey(scope), entity: 'workerLease' });
  },

  subscribe(scopeKey: string, listener: () => void) {
    const handleWindowEvent = (event: Event) => {
      const detail = (event as CustomEvent<DataChangeDetail>).detail;
      if (!detail || detail.scopeKey !== scopeKey) {
        return;
      }
      listener();
    };

    const channel = getBroadcastChannel();
    const handleChannelEvent = (event: MessageEvent<DataChangeDetail>) => {
      if (event.data?.scopeKey !== scopeKey) {
        return;
      }
      listener();
    };

    window.addEventListener(DATA_CHANGE_EVENT, handleWindowEvent as EventListener);
    channel?.addEventListener('message', handleChannelEvent as EventListener);

    return () => {
      window.removeEventListener(DATA_CHANGE_EVENT, handleWindowEvent as EventListener);
      channel?.removeEventListener('message', handleChannelEvent as EventListener);
    };
  },

  async clearAll() {
    const db = await getDatabase();
    db.close();
    resetConnectionState();
    await deleteDatabase();
  },
};
