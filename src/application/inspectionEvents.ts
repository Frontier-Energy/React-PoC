import type { InspectionSession } from '../types';
import { platform } from '../platform';

export const INSPECTION_STATUS_CHANGED_EVENT = 'inspection-status-changed';

export const publishInspectionStatusChanged = (inspection: InspectionSession) => {
  platform.runtime.dispatchWindowEvent(new CustomEvent(INSPECTION_STATUS_CHANGED_EVENT, { detail: inspection }));
};

export const subscribeToInspectionStatusChanged = (listener: () => void) => {
  platform.runtime.addWindowEventListener(INSPECTION_STATUS_CHANGED_EVENT, listener as EventListener);
  return () => {
    platform.runtime.removeWindowEventListener(INSPECTION_STATUS_CHANGED_EVENT, listener as EventListener);
  };
};
