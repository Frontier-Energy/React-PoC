import type { FormDataValue, InspectionSession } from '../types';
import type { SyncQueueEntry } from '../syncQueue';

const DB_NAME = 'react-poc-app-data';
const DB_VERSION = 1;

const META_STORE = 'meta';
const INSPECTIONS_STORE = 'inspections';
const CURRENT_SESSIONS_STORE = 'currentSessions';
const FORM_DATA_STORE = 'formData';
const SYNC_QUEUE_STORE = 'syncQueue';
const WORKER_LEASE_STORE = 'workerLeases';

const MIGRATION_KEY = 'localStorageMigrationComplete';
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
  value: boolean;
};

type DataChangeDetail = {
  scopeKey: string;
  entity: 'inspections' | 'currentSession' | 'formData' | 'syncQueue' | 'workerLease';
};

let dbPromise: Promise<IDBDatabase> | null = null;
let migrationPromise: Promise<void> | null = null;
let broadcastChannel: BroadcastChannel | null = null;

const openDatabase = (): Promise<IDBDatabase> =>
  new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;

      if (!db.objectStoreNames.contains(META_STORE)) {
        db.createObjectStore(META_STORE, { keyPath: 'key' });
      }

      if (!db.objectStoreNames.contains(INSPECTIONS_STORE)) {
        const store = db.createObjectStore(INSPECTIONS_STORE, { keyPath: 'storageKey' });
        store.createIndex('scopeKey', 'scopeKey', { unique: false });
      }

      if (!db.objectStoreNames.contains(CURRENT_SESSIONS_STORE)) {
        db.createObjectStore(CURRENT_SESSIONS_STORE, { keyPath: 'scopeKey' });
      }

      if (!db.objectStoreNames.contains(FORM_DATA_STORE)) {
        const store = db.createObjectStore(FORM_DATA_STORE, { keyPath: 'storageKey' });
        store.createIndex('scopeKey', 'scopeKey', { unique: false });
      }

      if (!db.objectStoreNames.contains(SYNC_QUEUE_STORE)) {
        const store = db.createObjectStore(SYNC_QUEUE_STORE, { keyPath: 'storageKey' });
        store.createIndex('scopeKey', 'scopeKey', { unique: false });
      }

      if (!db.objectStoreNames.contains(WORKER_LEASE_STORE)) {
        db.createObjectStore(WORKER_LEASE_STORE, { keyPath: 'scopeKey' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

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
  return Promise.resolve(callback(transaction));
};

const requestToPromise = <T>(request: IDBRequest<T>) =>
  new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

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
      const migrationRecord = (await runTransaction([META_STORE], 'readonly', async (transaction) =>
        requestToPromise<MetaRecord | undefined>(transaction.objectStore(META_STORE).get(MIGRATION_KEY))
      )) as MetaRecord | undefined;

      if (migrationRecord?.value) {
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
    dbPromise = null;
    migrationPromise = null;

    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.deleteDatabase(DB_NAME);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
      request.onblocked = () => reject(new Error('Failed to clear IndexedDB because the database is blocked.'));
    });
  },
};
