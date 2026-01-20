import { FileReference } from '../types';

const DB_NAME = 'react-poc-form-files';
const STORE_NAME = 'files';
const DB_VERSION = 1;

interface StoredFile extends FileReference {
  blob: Blob;
  sessionId?: string;
  fieldId?: string;
}

const openDatabase = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
};

const runTransaction = async <T>(
  mode: IDBTransactionMode,
  callback: (store: IDBObjectStore) => IDBRequest<T>
): Promise<T> => {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, mode);
    const store = transaction.objectStore(STORE_NAME);
    const request = callback(store);

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    transaction.onabort = () => reject(transaction.error);
  });
};

const generateId = (): string => {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

export const saveFile = async (
  file: File,
  context?: { sessionId?: string; fieldId?: string }
): Promise<FileReference> => {
  const id = generateId();
  const record: StoredFile = {
    id,
    name: file.name,
    type: file.type,
    size: file.size,
    lastModified: file.lastModified,
    blob: file,
    sessionId: context?.sessionId,
    fieldId: context?.fieldId,
  };

  await runTransaction('readwrite', (store) => store.put(record));

  return {
    id,
    name: record.name,
    type: record.type,
    size: record.size,
    lastModified: record.lastModified,
  };
};

export const saveFiles = async (
  files: File[],
  context?: { sessionId?: string; fieldId?: string }
): Promise<FileReference[]> => {
  return Promise.all(files.map((file) => saveFile(file, context)));
};

export const getFile = async (id: string): Promise<StoredFile | null> => {
  const result = await runTransaction('readonly', (store) => store.get(id));
  return (result as StoredFile | undefined) || null;
};

export const deleteFile = async (id: string): Promise<void> => {
  await runTransaction('readwrite', (store) => store.delete(id));
};

export const deleteFiles = async (ids: string[]): Promise<void> => {
  await Promise.all(ids.map((id) => deleteFile(id)));
};
