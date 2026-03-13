import type { InspectionSession } from '../types';
import { UploadStatus } from '../types';

export const filterInspections = (
  inspections: InspectionSession[],
  filters: {
    formType?: string | null;
    status?: string | null;
  }
) =>
  inspections.filter((inspection) => {
    if (filters.formType && inspection.formType !== filters.formType) {
      return false;
    }

    if (filters.status && (inspection.uploadStatus ?? UploadStatus.Local) !== filters.status) {
      return false;
    }

    return true;
  });

export const getInspectionsByUploadStatus = (inspections: InspectionSession[], status: UploadStatus) =>
  inspections.filter((inspection) => (inspection.uploadStatus ?? UploadStatus.Local) === status);
