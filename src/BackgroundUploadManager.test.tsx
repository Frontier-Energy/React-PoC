import { render, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getUserId } from './auth';
import { BackgroundUploadManager } from './BackgroundUploadManager';
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

describe('BackgroundUploadManager', () => {
  beforeEach(() => {
    setConnectivityStatus('online');
    vi.restoreAllMocks();
    vi.spyOn(global, 'fetch').mockResolvedValue({ ok: true } as Response);
    vi.mocked(getFile).mockResolvedValue(null);
    vi.mocked(deleteFiles).mockResolvedValue();
    vi.mocked(getUserId).mockReturnValue(null);
    Object.values(syncMonitorMock).forEach((mock) => mock.mockClear());
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

    render(<BackgroundUploadManager />);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    expect(updateSpy).toHaveBeenCalledWith(expect.objectContaining({ id: 'local-1', uploadStatus: UploadStatus.Uploading }));
    expect(updateSpy).toHaveBeenCalledWith(expect.objectContaining({ id: 'local-1', uploadStatus: UploadStatus.Uploaded }));
    expect(saveCurrentSpy).toHaveBeenCalled();
    expect(await syncQueue.load(local.id)).toBeNull();
    expect(syncMonitorMock.markInspectionSucceeded).toHaveBeenCalledWith('local-1');

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
        queryParams: { note: 'ready' },
      })
    );
  });

  it('creates queue entries for legacy local inspections before syncing', async () => {
    const local = makeInspection('legacy-local');
    await inspectionRepository.save(local);
    await inspectionRepository.saveFormData(local.id, {}, local);

    render(<BackgroundUploadManager />);

    await waitFor(() => {
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

    render(<BackgroundUploadManager />);

    await waitFor(() => {
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
    expect(syncMonitorMock.markInspectionFailed).toHaveBeenCalled();
  });

  it('coordinates across tabs through the shared worker lease', async () => {
    const local = makeInspection('local-multi-tab');
    await inspectionRepository.save(local);
    await inspectionRepository.saveFormData(local.id, {}, local);
    await syncQueue.enqueue(local, {});

    render(
      <>
        <BackgroundUploadManager />
        <BackgroundUploadManager />
      </>
    );

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });
  });

  it('skips sync when connectivity is offline', async () => {
    setConnectivityStatus('offline');
    const local = makeInspection('offline-local');
    await inspectionRepository.save(local);
    await inspectionRepository.saveFormData(local.id, {}, local);
    await syncQueue.enqueue(local, {});

    render(<BackgroundUploadManager />);

    await waitFor(() => {
      expect(global.fetch).not.toHaveBeenCalled();
    });
    expect(await syncQueue.load(local.id)).not.toBeNull();
  });

  it('deletes orphaned queue entries when the inspection no longer exists', async () => {
    const inspection = makeInspection('orphaned');
    await syncQueue.enqueue(inspection, {});
    const deleteSpy = vi.spyOn(syncQueue, 'delete');

    render(<BackgroundUploadManager />);

    await waitFor(() => {
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
        ? { blob: new Blob(['abc'], { type: 'image/jpeg' }), name: 'proof.jpg' }
        : null
    );

    render(<BackgroundUploadManager />);

    await waitFor(() => {
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

    render(<BackgroundUploadManager />);

    await waitFor(() => {
      expect(refreshSpy).toHaveBeenCalledWith(
        expect.objectContaining({ inspectionId: queueEntry.inspectionId, fingerprint: queueEntry.fingerprint }),
        local,
        { note: 'after' }
      );
    });

    const persistedEntry = await syncQueue.load(local.id);
    expect(persistedEntry).toEqual(
      expect.objectContaining({
        inspectionId: 'stale-fingerprint',
        status: 'failed',
        lastError: 'Unknown upload error',
      })
    );
    expect((await inspectionRepository.loadById(local.id))?.uploadStatus).toBe(UploadStatus.Failed);
    expect(errorSpy).toHaveBeenCalled();
  });
});
