export interface StoragePressureEventDetail {
  tenantId: string;
  userId: string;
  scopeKey: string;
  message: string;
  at: number;
}

const STORAGE_PRESSURE_EVENT = 'app-storage-pressure';

export const emitStoragePressureEvent = (detail: StoragePressureEventDetail) => {
  window.dispatchEvent(new CustomEvent<StoragePressureEventDetail>(STORAGE_PRESSURE_EVENT, { detail }));
};

export const subscribeToStoragePressure = (listener: (detail: StoragePressureEventDetail) => void) => {
  const handleEvent = (event: Event) => {
    const detail = (event as CustomEvent<StoragePressureEventDetail>).detail;
    if (!detail) {
      return;
    }
    listener(detail);
  };

  window.addEventListener(STORAGE_PRESSURE_EVENT, handleEvent as EventListener);
  return () => {
    window.removeEventListener(STORAGE_PRESSURE_EVENT, handleEvent as EventListener);
  };
};
