import type { InspectionSession } from '../types';

export const INSPECTION_STATUS_CHANGED_EVENT = 'inspection-status-changed';

export const publishInspectionStatusChanged = (inspection: InspectionSession) => {
  window.dispatchEvent(new CustomEvent(INSPECTION_STATUS_CHANGED_EVENT, { detail: inspection }));
};

export const subscribeToInspectionStatusChanged = (listener: () => void) => {
  window.addEventListener(INSPECTION_STATUS_CHANGED_EVENT, listener as EventListener);
  return () => {
    window.removeEventListener(INSPECTION_STATUS_CHANGED_EVENT, listener as EventListener);
  };
};
