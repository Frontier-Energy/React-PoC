import { createInspectionApplicationService } from './inspectionApplicationService';
import { UploadStatus, type InspectionSession } from '../types';
import type { SyncQueueEntry } from '../domain/syncQueue';

const makeInspection = (overrides: Partial<InspectionSession> = {}): InspectionSession => ({
  id: 'inspection-1',
  name: 'Inspection 1',
  formType: 'hvac',
  tenantId: 'tenant-a',
  userId: 'tech-1',
  uploadStatus: UploadStatus.Failed,
  ...overrides,
});

describe('inspectionApplicationService', () => {
  it('aggregates upload status counts across inspections', async () => {
    const service = createInspectionApplicationService({
      inspectionRepository: {
        loadAll: vi.fn(async () => [
          makeInspection({ id: 'local', uploadStatus: UploadStatus.Local }),
          makeInspection({ id: 'failed', uploadStatus: UploadStatus.Failed }),
          makeInspection({ id: 'failed-2', uploadStatus: UploadStatus.Failed }),
          makeInspection({ id: 'uploaded', uploadStatus: UploadStatus.Uploaded }),
        ]),
        loadCurrent: vi.fn(async () => null),
        loadFormData: vi.fn(async () => null),
        update: vi.fn(async (inspection) => inspection),
        saveCurrent: vi.fn(async () => undefined),
        saveAsCurrent: vi.fn(async () => undefined),
        updateFormDataEntry: vi.fn(async () => undefined),
        clearFormData: vi.fn(async () => undefined),
        delete: vi.fn(async () => undefined),
      },
      syncQueue: {
        enqueue: vi.fn(async () => undefined),
        retry: vi.fn(async () => undefined),
        moveToDeadLetter: vi.fn(async () => undefined),
        delete: vi.fn(async () => undefined),
      },
      saveFiles: vi.fn(async () => []),
      deleteFiles: vi.fn(async () => undefined),
      publishInspectionStatusChanged: vi.fn(),
    });

    await expect(service.getUploadStatusCounts()).resolves.toEqual({
      [UploadStatus.Local]: 1,
      [UploadStatus.InProgress]: 0,
      [UploadStatus.Uploading]: 0,
      [UploadStatus.Uploaded]: 1,
      [UploadStatus.Failed]: 2,
      [UploadStatus.Conflict]: 0,
    });
  });

  it('recovers failed uploads by resetting status, retrying the queue entry, and publishing a change', async () => {
    const inspection = makeInspection();
    const queueEntry: SyncQueueEntry = {
      inspectionId: inspection.id,
      tenantId: inspection.tenantId,
      userId: inspection.userId,
      status: 'failed',
      fingerprint: 'fp-1',
      idempotencyKey: 'idem-1',
      attemptCount: 2,
      nextAttemptAt: 10,
      createdAt: 1,
      updatedAt: 2,
    };
    const updateMock = vi.fn(async (next: InspectionSession) => next);
    const saveCurrentMock = vi.fn(async () => undefined);
    const retryMock = vi.fn(async () => undefined);
    const publishMock = vi.fn();

    const service = createInspectionApplicationService({
      inspectionRepository: {
        loadAll: vi.fn(async () => []),
        loadCurrent: vi.fn(async () => inspection),
        loadFormData: vi.fn(async () => ({ note: 'offline' })),
        update: updateMock,
        saveCurrent: saveCurrentMock,
        saveAsCurrent: vi.fn(async () => undefined),
        updateFormDataEntry: vi.fn(async () => undefined),
        clearFormData: vi.fn(async () => undefined),
        delete: vi.fn(async () => undefined),
      },
      syncQueue: {
        enqueue: vi.fn(async () => undefined),
        retry: retryMock,
        moveToDeadLetter: vi.fn(async () => undefined),
        delete: vi.fn(async () => undefined),
      },
      saveFiles: vi.fn(async () => []),
      deleteFiles: vi.fn(async () => undefined),
      publishInspectionStatusChanged: publishMock,
    });

    const recovered = await service.recoverUpload(inspection, queueEntry);

    expect(recovered.uploadStatus).toBe(UploadStatus.Local);
    expect(updateMock).toHaveBeenCalledWith(expect.objectContaining({ id: inspection.id, uploadStatus: UploadStatus.Local }));
    expect(retryMock).toHaveBeenCalledWith(queueEntry);
    expect(saveCurrentMock).toHaveBeenCalledWith(expect.objectContaining({ id: inspection.id, uploadStatus: UploadStatus.Local }));
    expect(publishMock).toHaveBeenCalledWith(expect.objectContaining({ id: inspection.id, uploadStatus: UploadStatus.Local }));
  });

  it('replaces draft files by deleting old references, saving new files, and persisting the new value', async () => {
    const updateFormDataEntryMock = vi.fn(async () => undefined);
    const deleteFilesMock = vi.fn(async () => undefined);
    const saveFilesMock = vi.fn(async () => [
      { id: 'file-2', name: 'updated.txt', type: 'text/plain', size: 1, lastModified: 1 },
    ]);
    const service = createInspectionApplicationService({
      inspectionRepository: {
        loadAll: vi.fn(async () => []),
        loadCurrent: vi.fn(async () => null),
        loadFormData: vi.fn(async () => null),
        update: vi.fn(async (inspection) => inspection),
        saveCurrent: vi.fn(async () => undefined),
        saveAsCurrent: vi.fn(async () => undefined),
        updateFormDataEntry: updateFormDataEntryMock,
        clearFormData: vi.fn(async () => undefined),
        delete: vi.fn(async () => undefined),
      },
      syncQueue: {
        enqueue: vi.fn(async () => undefined),
        retry: vi.fn(async () => undefined),
        moveToDeadLetter: vi.fn(async () => undefined),
        delete: vi.fn(async () => undefined),
      },
      saveFiles: saveFilesMock,
      deleteFiles: deleteFilesMock,
      publishInspectionStatusChanged: vi.fn(),
    });

    const nextValue = await service.replaceDraftFiles({
      sessionId: 'inspection-1',
      inspection: makeInspection(),
      fieldId: 'photo',
      currentValue: { id: 'file-1', name: 'old.txt', type: 'text/plain', size: 1, lastModified: 1 },
      files: [new File(['next'], 'updated.txt', { type: 'text/plain' })],
      externalId: 'ext.photo',
    });

    expect(deleteFilesMock).toHaveBeenCalledWith(['file-1']);
    expect(saveFilesMock).toHaveBeenCalledTimes(1);
    expect(nextValue).toEqual(expect.objectContaining({ id: 'file-2' }));
    expect(updateFormDataEntryMock).toHaveBeenCalledWith(
      'inspection-1',
      'ext.photo',
      expect.objectContaining({ id: 'file-2' }),
      expect.objectContaining({ id: 'inspection-1' })
    );
  });

  it('covers queue, draft, and session helpers through the application boundary', async () => {
    const loadFormDataMock = vi.fn(async () => ({
      'ext.saved': { id: 'stored-file', name: 'saved.txt', type: 'text/plain', size: 1, lastModified: 1 },
      keep: 'value',
    }));
    const retryMock = vi.fn(async () => undefined);
    const moveToDeadLetterMock = vi.fn(async () => undefined);
    const enqueueMock = vi.fn(async () => undefined);
    const deleteQueueMock = vi.fn(async () => undefined);
    const saveCurrentMock = vi.fn(async () => undefined);
    const saveAsCurrentMock = vi.fn(async () => undefined);
    const updateFormDataEntryMock = vi.fn(async () => undefined);
    const clearFormDataMock = vi.fn(async () => undefined);
    const deleteInspectionMock = vi.fn(async () => undefined);
    const deleteFilesMock = vi.fn(async () => undefined);
    const saveFilesMock = vi.fn(async () => [
      { id: 'new-a', name: 'a.txt', type: 'text/plain', size: 1, lastModified: 1 },
      { id: 'new-b', name: 'b.txt', type: 'text/plain', size: 1, lastModified: 1 },
    ]);
    const publishMock = vi.fn();
    const service = createInspectionApplicationService({
      inspectionRepository: {
        loadAll: vi.fn(async () => []),
        loadCurrent: vi.fn(async () => null),
        loadFormData: loadFormDataMock,
        update: vi.fn(async (inspection) => inspection),
        saveCurrent: saveCurrentMock,
        saveAsCurrent: saveAsCurrentMock,
        updateFormDataEntry: updateFormDataEntryMock,
        clearFormData: clearFormDataMock,
        delete: deleteInspectionMock,
      },
      syncQueue: {
        enqueue: enqueueMock,
        retry: retryMock,
        moveToDeadLetter: moveToDeadLetterMock,
        delete: deleteQueueMock,
      },
      saveFiles: saveFilesMock,
      deleteFiles: deleteFilesMock,
      publishInspectionStatusChanged: publishMock,
    });
    const inspection = makeInspection({ uploadStatus: UploadStatus.Uploading });
    const queueEntry: SyncQueueEntry = {
      inspectionId: inspection.id,
      tenantId: inspection.tenantId,
      userId: inspection.userId,
      status: 'failed',
      fingerprint: 'fp-2',
      idempotencyKey: 'idem-2',
      attemptCount: 1,
      nextAttemptAt: 0,
      createdAt: 0,
      updatedAt: 0,
    };

    expect(
      service.getRecoveryCandidates(
        [
          makeInspection({ id: 'healthy', uploadStatus: UploadStatus.Uploaded }),
          makeInspection({ id: 'conflicted', uploadStatus: UploadStatus.Conflict }),
          inspection,
        ],
        [queueEntry, { ...queueEntry, inspectionId: 'healthy', status: 'pending' }]
      ).map((item) => item.id)
    ).toEqual(['conflicted', inspection.id]);

    await expect(service.getFormDataFieldCount('inspection-1', inspection)).resolves.toBe(2);

    await service.retryQueueEntry(queueEntry);
    await service.moveQueueEntryToDeadLetter(queueEntry, 'manual');
    await service.activateInspectionSession(inspection);
    await service.deleteInspection(inspection);
    await service.saveDraftFieldValue('inspection-1', inspection, 'saved', 'value', 'ext.saved');

    await service.replaceDraftFiles({
      sessionId: 'inspection-1',
      inspection,
      fieldId: 'saved',
      currentValue: undefined,
      files: [],
      externalId: 'ext.saved',
    });

    const multiValue = await service.replaceDraftFiles({
      sessionId: 'inspection-1',
      inspection,
      fieldId: 'attachments',
      currentValue: undefined,
      files: [new File(['a'], 'a.txt'), new File(['b'], 'b.txt')],
      multiple: true,
    });

    await service.resetDraft('inspection-1', inspection, {
      file: { id: 'one', name: 'one.txt', type: 'text/plain', size: 1, lastModified: 1 },
      files: [
        { id: 'two', name: 'two.txt', type: 'text/plain', size: 1, lastModified: 1 },
        { id: 'three', name: 'three.txt', type: 'text/plain', size: 1, lastModified: 1 },
      ],
      plain: 'ignore-me',
    });

    const renamed = await service.renameDraftSession(inspection, 'Renamed');
    const submitted = await service.submitDraft(inspection, { note: 'submit' });

    expect(retryMock).toHaveBeenCalledWith(queueEntry);
    expect(moveToDeadLetterMock).toHaveBeenCalledWith(queueEntry, 'manual');
    expect(saveCurrentMock).toHaveBeenCalledWith(inspection);
    expect(deleteInspectionMock).toHaveBeenCalledWith(inspection);
    expect(deleteQueueMock).toHaveBeenCalledWith(inspection.id, inspection);
    expect(updateFormDataEntryMock).toHaveBeenCalledWith('inspection-1', 'ext.saved', 'value', inspection);
    expect(deleteFilesMock).toHaveBeenCalledWith(['stored-file']);
    expect(saveFilesMock).toHaveBeenCalledTimes(1);
    expect(multiValue).toHaveLength(2);
    expect(deleteFilesMock).toHaveBeenCalledWith(['one', 'two', 'three']);
    expect(clearFormDataMock).toHaveBeenCalledWith('inspection-1', inspection);
    expect(renamed.name).toBe('Renamed');
    expect(saveAsCurrentMock).toHaveBeenCalledWith(expect.objectContaining({ name: 'Renamed' }));
    expect(submitted.uploadStatus).toBe(UploadStatus.Local);
    expect(enqueueMock).toHaveBeenCalledWith(expect.objectContaining({ uploadStatus: UploadStatus.Local }), { note: 'submit' });
    expect(publishMock).toHaveBeenCalledWith(expect.objectContaining({ uploadStatus: UploadStatus.Local }));
  });

  it('requeues recovered uploads when no queue entry exists and only saves current matching sessions', async () => {
    const inspection = makeInspection({ id: 'inspection-2', uploadStatus: UploadStatus.Failed });
    const enqueueMock = vi.fn(async () => undefined);
    const saveCurrentMock = vi.fn(async () => undefined);
    const updateMock = vi.fn(async (next: InspectionSession) => next);
    const publishMock = vi.fn();
    const service = createInspectionApplicationService({
      inspectionRepository: {
        loadAll: vi.fn(async () => []),
        loadCurrent: vi.fn(async () => null),
        loadFormData: vi.fn(async () => ({ note: 'recover' })),
        update: updateMock,
        saveCurrent: saveCurrentMock,
        saveAsCurrent: vi.fn(async () => undefined),
        updateFormDataEntry: vi.fn(async () => undefined),
        clearFormData: vi.fn(async () => undefined),
        delete: vi.fn(async () => undefined),
      },
      syncQueue: {
        enqueue: enqueueMock,
        retry: vi.fn(async () => undefined),
        moveToDeadLetter: vi.fn(async () => undefined),
        delete: vi.fn(async () => undefined),
      },
      saveFiles: vi.fn(async () => []),
      deleteFiles: vi.fn(async () => undefined),
      publishInspectionStatusChanged: publishMock,
    });

    const recovered = await service.recoverUpload(inspection);

    expect(recovered.uploadStatus).toBe(UploadStatus.Local);
    expect(updateMock).toHaveBeenCalledWith(expect.objectContaining({ id: 'inspection-2', uploadStatus: UploadStatus.Local }));
    expect(enqueueMock).toHaveBeenCalledWith(expect.objectContaining({ id: 'inspection-2', uploadStatus: UploadStatus.Local }), { note: 'recover' });
    expect(saveCurrentMock).not.toHaveBeenCalled();
    expect(publishMock).toHaveBeenCalledWith(expect.objectContaining({ id: 'inspection-2', uploadStatus: UploadStatus.Local }));
  });

  it('retries inspection uploads and skips current-session persistence when another inspection is active', async () => {
    const inspection = makeInspection({ id: 'inspection-3', uploadStatus: UploadStatus.Failed });
    const enqueueMock = vi.fn(async () => undefined);
    const saveCurrentMock = vi.fn(async () => undefined);
    const publishMock = vi.fn();
    const service = createInspectionApplicationService({
      inspectionRepository: {
        loadAll: vi.fn(async () => []),
        loadCurrent: vi.fn(async () => makeInspection({ id: 'different-current' })),
        loadFormData: vi.fn(async () => ({ note: 'retry' })),
        update: vi.fn(async (next: InspectionSession) => next),
        saveCurrent: saveCurrentMock,
        saveAsCurrent: vi.fn(async () => undefined),
        updateFormDataEntry: vi.fn(async () => undefined),
        clearFormData: vi.fn(async () => undefined),
        delete: vi.fn(async () => undefined),
      },
      syncQueue: {
        enqueue: enqueueMock,
        retry: vi.fn(async () => undefined),
        moveToDeadLetter: vi.fn(async () => undefined),
        delete: vi.fn(async () => undefined),
      },
      saveFiles: vi.fn(async () => []),
      deleteFiles: vi.fn(async () => undefined),
      publishInspectionStatusChanged: publishMock,
    });

    const retried = await service.retryInspectionUpload(inspection);

    expect(retried.uploadStatus).toBe(UploadStatus.Local);
    expect(enqueueMock).toHaveBeenCalledWith(expect.objectContaining({ id: 'inspection-3', uploadStatus: UploadStatus.Local }), { note: 'retry' });
    expect(saveCurrentMock).not.toHaveBeenCalled();
    expect(publishMock).toHaveBeenCalledWith(expect.objectContaining({ id: 'inspection-3', uploadStatus: UploadStatus.Local }));
  });
});
