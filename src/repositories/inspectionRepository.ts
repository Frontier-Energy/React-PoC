import { FormDataValue, InspectionSession } from '../types';

const INSPECTION_PREFIX = 'inspection_';
const CURRENT_SESSION_KEY = 'currentSession';
const FORM_DATA_PREFIX = 'formData_';

const getInspectionKey = (inspectionId: string) => `${INSPECTION_PREFIX}${inspectionId}`;
const getFormDataKey = (inspectionId: string) => `${FORM_DATA_PREFIX}${inspectionId}`;

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

export const inspectionRepository = {
  loadAll(): InspectionSession[] {
    const sessionMap: Record<string, InspectionSession> = {};
    const keys = Object.keys(localStorage);

    keys.forEach((key) => {
      if (!key.startsWith(INSPECTION_PREFIX)) {
        return;
      }

      const session = parseJson<InspectionSession>(
        localStorage.getItem(key),
        `Failed to parse session ${key}:`
      );
      if (session) {
        sessionMap[session.id] = session;
      }
    });

    return Object.values(sessionMap);
  },

  loadById(inspectionId: string): InspectionSession | null {
    return parseJson<InspectionSession>(
      localStorage.getItem(getInspectionKey(inspectionId)),
      `Failed to parse session ${inspectionId}:`
    );
  },

  loadCurrent(): InspectionSession | null {
    return parseJson<InspectionSession>(
      localStorage.getItem(CURRENT_SESSION_KEY),
      'Failed to parse current inspection session:'
    );
  },

  save(inspection: InspectionSession): void {
    localStorage.setItem(getInspectionKey(inspection.id), JSON.stringify(inspection));
  },

  saveCurrent(inspection: InspectionSession): void {
    localStorage.setItem(CURRENT_SESSION_KEY, JSON.stringify(inspection));
  },

  update(inspection: InspectionSession): InspectionSession {
    this.save(inspection);
    return inspection;
  },

  delete(inspectionId: string, options?: { removeFormData?: boolean; removeCurrentIfMatch?: boolean }): void {
    const removeFormData = options?.removeFormData ?? true;
    const removeCurrentIfMatch = options?.removeCurrentIfMatch ?? true;

    localStorage.removeItem(getInspectionKey(inspectionId));
    if (removeFormData) {
      localStorage.removeItem(getFormDataKey(inspectionId));
    }

    if (!removeCurrentIfMatch) {
      return;
    }

    const currentSession = this.loadCurrent();
    if (currentSession?.id === inspectionId) {
      localStorage.removeItem(CURRENT_SESSION_KEY);
    }
  },

  loadFormData(inspectionId: string): Record<string, FormDataValue> | null {
    return parseJson<Record<string, FormDataValue>>(
      localStorage.getItem(getFormDataKey(inspectionId)),
      `Failed to parse form data for session ${inspectionId}:`
    );
  },

  saveFormData(inspectionId: string, formData: Record<string, FormDataValue>): void {
    localStorage.setItem(getFormDataKey(inspectionId), JSON.stringify(formData));
  },
};

