import { render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getUserId } from './auth';
import { BackgroundUploadManager } from './BackgroundUploadManager';
import { backgroundUploadRuntime } from './backgroundUploadRuntime';
import { inspectionRepository } from './repositories/inspectionRepository';
import { syncQueue } from './syncQueue';
import { FormType, type InspectionSession, UploadStatus } from './types';
import { deleteFiles, getFile } from './utils/fileStorage';

const { getConnectivityStatus, setConnectivityStatus } = vi.hoisted(() => {
  let status: 'online' | 'offline' | 'checking' = 'online';
  return {
    getConnectivityStatus: () => status,
    setConnectivityStatus: (next: 'online' | 'offline' | 'checking') => {
      status = next;
    },
  };
});

const syncMonitorMock = vi.hoisted(() => ({
  noteWakeUp: vi.fn(),
  markPaused: vi.fn(),
  markBusy: vi.fn(),
  markCycleStarted: vi.fn(),
  markCycleCompleted: vi.fn(),
  markLeaseAcquired: vi.fn(),
  markLeaseUnavailable: vi.fn(),
  markLeaseLost: vi.fn(),
  markInspectionClaimed: vi.fn(),
  markInspectionDeleted: vi.fn(),
  markInspectionSucceeded: vi.fn(),
  markInspectionFailed: vi.fn(),
  markInspectionConflicted: vi.fn(),
  refresh: vi.fn(async () => {}),
}));

vi.mock('./ConnectivityContext', () => ({
  useConnectivity: () => ({ status: getConnectivityStatus() }),
}));

vi.mock('./config', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./config')>();
  return {
    ...actual,
    getUploadInspectionUrl: () => 'https://upload.test/inspection',
    getActiveTenant: () => ({ tenantId: 'tenant-a' }),
  };
});

vi.mock('./utils/fileStorage', () => ({
  getFile: vi.fn(),
  deleteFiles: vi.fn(),
}));

vi.mock('./auth', () => ({
  getUserId: vi.fn(),
}));

vi.mock('./syncMonitor', () => ({
  syncMonitor: syncMonitorMock,
}));

const makeInspection = (id: string, overrides?: Partial<InspectionSession>): InspectionSession => ({
  id,
  name: `Inspection ${id}`,
  formType: FormType.HVAC,
  tenantId: 'tenant-a',
  uploadStatus: UploadStatus.Local,
  ...overrides,
});

describe('backgroundUploadRuntime', () => {
  beforeEach(async () => {
    setConnectivityStatus('online');
    await backgroundUploadRuntime.stop();
    vi.restoreAllMocks();
    vi.useRealTimers();
    vi.spyOn(global, 'fetch').mockResolvedValue({ ok: true } as Response);
    vi.mocked(getFile).mockResolvedValue(null);
    vi.mocked(deleteFiles).mockResolvedValue();
    vi.mocked(getUserId).mockReturnValue(null);
    Object.values(syncMonitorMock).forEach((mock) => mock.mockClear());
  });

  afterEach(() => {
    return backgroundUploadRuntime.stop();
  });

  it('uploads queued inspections with a durable idempotency key and transitions to uploaded', async () => {
    const local = makeInspection('local-1');
    const formData = { note: 'ready' };
    await inspectionRepository.save(local);
    await inspectionRepository.saveCurrent(local);
    await inspectionRepository.saveFormData(local.id, formData, local);
    const queueEntry = await syncQueue.enqueue(local, formData);

    const updateSpy = vi.spyOn(inspectionRepository, 'update');
    const saveCurrentSpy = vi.spyOn(inspectionRepository, 'saveCurrent');

    backgroundUploadRuntime.setConnectivityStatus('online');
    backgroundUploadRuntime.start();

    await vi.waitFor(() => {
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    expect(updateSpy).toHaveBeenCalledWith(expect.objectContaining({ id: 'local-1', uploadStatus: UploadStatus.Uploading }));
    await vi.waitFor(() => {
      expect(updateSpy).toHaveBeenCalledWith(expect.objectContaining({ id: 'local-1', uploadStatus: UploadStatus.Uploaded }));
    });
    expect(saveCurrentSpy).toHaveBeenCalled();
    expect(await syncQueue.load(local.id)).toBeNull();
    await vi.waitFor(() => {
      expect(syncMonitorMock.markInspectionSucceeded).toHaveBeenCalledWith('local-1');
    });

    const [, request] = vi.mocked(global.fetch).mock.calls[0] as [
      string,
      { method: string; headers: Record<string, string>; body: FormData },
    ];

    expect(request.method).toBe('POST');
    expect(request.headers['Idempotency-Key']).toBe(queueEntry.idempotencyKey);
    expect(JSON.parse(String(request.body.get('payload')))).toEqual(
      expect.objectContaining({
        sessionId: 'local-1',
        idempotencyKey: queueEntry.idempotencyKey,
        version: expect.objectContaining({
          clientRevision: expect.any(Number),
          baseServerRevision: null,
          mergePolicy: 'manual-on-version-mismatch',
        }),
        queryParams: { note: 'ready' },
      })
    );
  });

  it('marks version conflicts without retrying and surfaces operator metadata', async () => {
    vi.mocked(global.fetch).mockResolvedValue({
      ok: false,
      status: 409,
      json: async () => ({
        message: 'Server revision mismatch',
        serverRevision: 'srv-9',
        serverUpdatedAt: 123456,
        conflictingFields: ['note'],
      }),
      headers: new Headers(),
    } as Response);

    const local = makeInspection('local-conflict');
    const formData = { note: 'edited offline' };
    await inspectionRepository.save(local);
    await inspectionRepository.saveFormData(local.id, formData, local);
    await syncQueue.enqueue(local, formData);

    backgroundUploadRuntime.setConnectivityStatus('online');
    backgroundUploadRuntime.start();

    await vi.waitFor(async () => {
      expect((await syncQueue.load(local.id))?.status).toBe('conflict');
    });

    expect((await inspectionRepository.loadById(local.id))?.uploadStatus).toBe(UploadStatus.Conflict);
    await vi.waitFor(() => {
      expect(syncMonitorMock.markInspectionConflicted).toHaveBeenCalled();
    });
  });

  it('creates queue entries for legacy local inspections before syncing', async () => {
    const local = makeInspection('legacy-local');
    await inspectionRepository.save(local);
    await inspectionRepository.saveFormData(local.id, {}, local);

    backgroundUploadRuntime.setConnectivityStatus('online');
    backgroundUploadRuntime.start();

    await vi.waitFor(() => {
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    expect(await syncQueue.load(local.id)).toBeNull();
  });

  it('marks failed uploads for retry with backoff while keeping the same idempotency key', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(Math, 'random').mockReturnValue(0);
    vi.mocked(global.fetch).mockResolvedValue({ ok: false, status: 500 } as Response);

    const local = makeInspection('local-fail');
    const formData = { note: 'retry me' };
    await inspectionRepository.save(local);
    await inspectionRepository.saveFormData(local.id, formData, local);
    const queueEntry = await syncQueue.enqueue(local, formData);

    backgroundUploadRuntime.setConnectivityStatus('online');
    backgroundUploadRuntime.start();

    await vi.waitFor(() => {
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    const persistedEntry = await syncQueue.load(local.id);
    expect(persistedEntry).toEqual(
      expect.objectContaining({
        inspectionId: 'local-fail',
        status: 'failed',
        attemptCount: 1,
        idempotencyKey: queueEntry.idempotencyKey,
      })
    );
    expect((persistedEntry?.nextAttemptAt ?? 0) - (persistedEntry?.lastAttemptAt ?? 0)).toBeGreaterThanOrEqual(4_500);
    expect((await inspectionRepository.loadById(local.id))?.uploadStatus).toBe(UploadStatus.Failed);
    expect(deleteFiles).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalled();
    await vi.waitFor(() => {
      expect(syncMonitorMock.markInspectionFailed).toHaveBeenCalled();
    });
  });

  it('coordinates across tabs through the shared worker lease', async () => {
    const local = makeInspection('local-multi-tab');
    await inspectionRepository.save(local);
    await inspectionRepository.saveFormData(local.id, {}, local);
    await syncQueue.enqueue(local, {});

    const secondRuntime = (await import('./backgroundUploadRuntime')).createBackgroundUploadRuntime();

    backgroundUploadRuntime.setConnectivityStatus('online');
    secondRuntime.setConnectivityStatus('online');
    backgroundUploadRuntime.start();
    secondRuntime.start();

    await vi.waitFor(() => {
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    await secondRuntime.stop();
  });

  it('skips sync when connectivity is offline', async () => {
    const local = makeInspection('offline-local');
    await inspectionRepository.save(local);
    await inspectionRepository.saveFormData(local.id, {}, local);
    await syncQueue.enqueue(local, {});

    backgroundUploadRuntime.setConnectivityStatus('offline');
    backgroundUploadRuntime.start();

    await vi.waitFor(() => {
      expect(syncMonitorMock.markPaused).toHaveBeenCalledWith('offline');
    });
    expect(global.fetch).not.toHaveBeenCalled();
    expect(await syncQueue.load(local.id)).not.toBeNull();
  });

  it('deletes orphaned queue entries when the inspection no longer exists', async () => {
    const inspection = makeInspection('orphaned');
    await syncQueue.enqueue(inspection, {});
    const deleteSpy = vi.spyOn(syncQueue, 'delete');

    backgroundUploadRuntime.setConnectivityStatus('online');
    backgroundUploadRuntime.start();

    await vi.waitFor(() => {
      expect(deleteSpy).toHaveBeenCalledWith('orphaned', expect.objectContaining({ inspectionId: 'orphaned' }));
    });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('uploads stored files, warns for missing file references, and deletes uploaded file ids afterwards', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.mocked(getUserId).mockReturnValue('resolved-user');

    const local = makeInspection('with-files', { userId: undefined });
    const fileRef = { id: 'file-1', name: 'proof.jpg', type: 'image/jpeg', size: 128, lastModified: 1 };
    const missingRef = { id: 'missing-file', name: 'missing.jpg', type: 'image/jpeg', size: 64, lastModified: 1 };

    await inspectionRepository.save(local);
    await inspectionRepository.saveFormData(local.id, { attachments: [fileRef, missingRef] }, local);
    await syncQueue.enqueue(local, { attachments: [fileRef, missingRef] });

    vi.mocked(getFile).mockImplementation(async (fileId: string) =>
      fileId === 'file-1'
        ? {
            id: 'file-1',
            blob: new Blob(['abc'], { type: 'image/jpeg' }),
            name: 'proof.jpg',
            type: 'image/jpeg',
            size: 128,
            lastModified: 1,
          }
        : null
    );

    backgroundUploadRuntime.setConnectivityStatus('online');
    backgroundUploadRuntime.start();

    await vi.waitFor(() => {
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    const [, request] = vi.mocked(global.fetch).mock.calls[0] as [
      string,
      { method: string; headers: Record<string, string>; body: FormData },
    ];

    expect(JSON.parse(String(request.body.get('payload')))).toEqual(
      expect.objectContaining({
        userId: 'resolved-user',
      })
    );
    expect(deleteFiles).toHaveBeenCalledWith(['file-1', 'missing-file']);
    expect(warnSpy).toHaveBeenCalledWith('Missing stored file for missing-file');
  });

  it('refreshes stale queue fingerprints and handles non-Error upload failures', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(Math, 'random').mockReturnValue(0);
    vi.mocked(global.fetch).mockRejectedValue('boom');

    const local = makeInspection('stale-fingerprint');
    await inspectionRepository.save(local);
    await inspectionRepository.saveFormData(local.id, { note: 'before' }, local);
    const queueEntry = await syncQueue.enqueue(local, { note: 'before' });
    await inspectionRepository.saveFormData(local.id, { note: 'after' }, local);
    const refreshSpy = vi.spyOn(syncQueue, 'refreshFingerprint');

    backgroundUploadRuntime.setConnectivityStatus('online');
    backgroundUploadRuntime.start();

    await vi.waitFor(() => {
      expect(refreshSpy).toHaveBeenCalledWith(
        expect.objectContaining({ inspectionId: queueEntry.inspectionId, fingerprint: queueEntry.fingerprint }),
        expect.objectContaining({ id: local.id, uploadStatus: UploadStatus.Local }),
        { note: 'after' }
      );
    });

    await vi.waitFor(async () => {
      expect(await syncQueue.load(local.id)).toEqual(
        expect.objectContaining({
          inspectionId: 'stale-fingerprint',
          status: 'failed',
          lastError: 'Unknown upload error',
        })
      );
    });
    expect((await inspectionRepository.loadById(local.id))?.uploadStatus).toBe(UploadStatus.Failed);
    expect(errorSpy).toHaveBeenCalled();
  });

  it('bridges connectivity changes from React into the runtime', async () => {
    const setConnectivitySpy = vi.spyOn(backgroundUploadRuntime, 'setConnectivityStatus');

    render(<BackgroundUploadManager />);

    expect(setConnectivitySpy).toHaveBeenCalledWith('online');
  });
});
