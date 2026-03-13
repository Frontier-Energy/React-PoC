import { FormType, UploadStatus, type InspectionSession } from '../types';
import { filterInspections, getInspectionsByUploadStatus } from './inspectionList';

const inspections: InspectionSession[] = [
  {
    id: 'a',
    name: 'A',
    formType: FormType.HVAC,
    tenantId: 'tenant-a',
    uploadStatus: UploadStatus.Failed,
  },
  {
    id: 'b',
    name: 'B',
    formType: FormType.Electrical,
    tenantId: 'tenant-a',
    uploadStatus: UploadStatus.Uploaded,
  },
  {
    id: 'c',
    name: 'C',
    formType: FormType.HVAC,
    tenantId: 'tenant-a',
  },
];

describe('inspectionList domain helpers', () => {
  it('filters by form type and status without UI dependencies', () => {
    expect(filterInspections(inspections, { formType: FormType.HVAC }).map((item) => item.id)).toEqual(['a', 'c']);
    expect(filterInspections(inspections, { status: UploadStatus.Failed }).map((item) => item.id)).toEqual(['a']);
    expect(filterInspections(inspections, { formType: FormType.HVAC, status: UploadStatus.Local }).map((item) => item.id)).toEqual(['c']);
  });

  it('groups inspections by upload status', () => {
    expect(getInspectionsByUploadStatus(inspections, UploadStatus.Failed).map((item) => item.id)).toEqual(['a']);
    expect(getInspectionsByUploadStatus(inspections, UploadStatus.Local).map((item) => item.id)).toEqual(['c']);
  });
});
