import { UploadStatus } from '../types';
import {
  buildDebugInspectionFileItems,
  formatDebugDuration,
  formatDebugFileSize,
  isPreviewableDebugFile,
  resolveInspectionScope,
} from './debugInspection';

describe('debugInspection domain helpers', () => {
  it('resolves a valid inspection scope from route state', () => {
    expect(
      resolveInspectionScope({
        inspectionScope: {
          tenantId: 'tenant-a',
          userId: 'user-1',
        },
      })
    ).toEqual({
      tenantId: 'tenant-a',
      userId: 'user-1',
    });
  });

  it('ignores invalid route state and missing tenant ids', () => {
    expect(resolveInspectionScope(undefined)).toBeUndefined();
    expect(resolveInspectionScope('invalid')).toBeUndefined();
    expect(resolveInspectionScope({ inspectionScope: { userId: 'user-1' } })).toBeUndefined();
  });

  it('builds file items from schema fields with stored references', () => {
    expect(
      buildDebugInspectionFileItems(
        {
          formName: 'Schema',
          uploadStatus: UploadStatus.Local,
          sections: [
            {
              title: 'Evidence',
              fields: [
                { id: 'photo', label: 'Photo', type: 'file', required: false, externalID: 'ext.photo' },
                { id: 'note', label: 'Note', type: 'text', required: false },
              ],
            },
          ],
        },
        {
          'ext.photo': { id: 'file-1', name: 'proof.jpg', type: 'image/jpeg', size: 128, lastModified: 1 },
        },
        (value) => (value ? [value as any] : [])
      )
    ).toEqual([
      {
        fieldId: 'photo',
        label: 'Photo',
        type: 'file',
        files: [{ id: 'file-1', name: 'proof.jpg', type: 'image/jpeg', size: 128, lastModified: 1 }],
      },
    ]);
  });

  it('formats sizes, durations, and previewable file checks', () => {
    expect(formatDebugFileSize(128)).toBe('128 B');
    expect(formatDebugFileSize(1536)).toBe('1.5 KB');
    expect(formatDebugDuration(61_000, 'Not provided')).toBe('1.0 min');
    expect(formatDebugDuration(null, 'Not provided')).toBe('Not provided');
    expect(isPreviewableDebugFile({ id: 'file-1', name: 'proof.jpg', type: 'image/jpeg', size: 128, lastModified: 1 })).toBe(true);
    expect(isPreviewableDebugFile({ id: 'file-2', name: 'proof.pdf', type: 'application/pdf', size: 128, lastModified: 1 })).toBe(false);
  });
});
