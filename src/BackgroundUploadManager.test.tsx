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
  });

  it('uploads queued inspections with a durable idempotency key and transitions to uploaded', async () => {
    const local = makeInspection('local-1');
    const formData = { note: 'ready' };
    inspectionRepository.save(local);
    inspectionRepository.saveCurrent(local);
    inspectionRepository.saveFormData(local.id, formData, local);
    const queueEntry = syncQueue.enqueue(local, formData);

    const updateSpy = vi.spyOn(inspectionRepository, 'update');
    const saveCurrentSpy = vi.spyOn(inspectionRepository, 'saveCurrent');

    render(<BackgroundUploadManager />);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    expect(updateSpy).toHaveBeenCalledWith(expect.objectContaining({ id: 'local-1', uploadStatus: UploadStatus.Uploading }));
    expect(updateSpy).toHaveBeenCalledWith(expect.objectContaining({ id: 'local-1', uploadStatus: UploadStatus.Uploaded }));
    expect(saveCurrentSpy).toHaveBeenCalled();
    expect(syncQueue.load(local.id)).toBeNull();

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
    inspectionRepository.save(local);
    inspectionRepository.saveFormData(local.id, {}, local);

    render(<BackgroundUploadManager />);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    expect(syncQueue.load(local.id)).toBeNull();
  });

  it('marks failed uploads for retry with backoff while keeping the same idempotency key', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    vi.mocked(global.fetch).mockResolvedValue({ ok: false, status: 500 } as Response);

    const local = makeInspection('local-fail');
    const formData = { note: 'retry me' };
    inspectionRepository.save(local);
    inspectionRepository.saveFormData(local.id, formData, local);
    const queueEntry = syncQueue.enqueue(local, formData);

    render(<BackgroundUploadManager />);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    const persistedEntry = syncQueue.load(local.id);
    expect(persistedEntry).toEqual(
      expect.objectContaining({
        inspectionId: 'local-fail',
        status: 'failed',
        attemptCount: 1,
        idempotencyKey: queueEntry.idempotencyKey,
      })
    );
    expect((persistedEntry?.nextAttemptAt ?? 0) - (persistedEntry?.lastAttemptAt ?? 0)).toBeGreaterThanOrEqual(4_500);
    expect(inspectionRepository.loadById(local.id)?.uploadStatus).toBe(UploadStatus.Failed);
    expect(deleteFiles).not.toHaveBeenCalled();
  });

  it('coordinates across tabs through the shared worker lease', async () => {
    const local = makeInspection('local-multi-tab');
    inspectionRepository.save(local);
    inspectionRepository.saveFormData(local.id, {}, local);
    syncQueue.enqueue(local, {});

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
    inspectionRepository.save(local);
    inspectionRepository.saveFormData(local.id, {}, local);
    syncQueue.enqueue(local, {});

    render(<BackgroundUploadManager />);

    await waitFor(() => {
      expect(global.fetch).not.toHaveBeenCalled();
    });
    expect(syncQueue.load(local.id)).not.toBeNull();
  });
});
