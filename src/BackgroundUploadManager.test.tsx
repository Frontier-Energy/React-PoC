import { render, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BackgroundUploadManager } from './BackgroundUploadManager';
import { inspectionRepository } from './repositories/inspectionRepository';
import { FormType, type InspectionSession, UploadStatus } from './types';
import { deleteFiles, getFile } from './utils/fileStorage';
import { getUserId } from './auth';

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

vi.mock('./config', () => ({
  getUploadInspectionUrl: () => 'https://upload.test/inspection',
}));

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

  it('uploads local inspections and transitions status from uploading to uploaded', async () => {
    const local = makeInspection('local-1');
    vi.spyOn(inspectionRepository, 'loadAll').mockReturnValue([local]);
    vi.spyOn(inspectionRepository, 'loadFormData').mockReturnValue({ note: 'ready' });
    const updateSpy = vi.spyOn(inspectionRepository, 'update').mockImplementation((inspection) => inspection);
    vi.spyOn(inspectionRepository, 'loadCurrent').mockReturnValue(makeInspection('local-1'));
    const saveCurrentSpy = vi.spyOn(inspectionRepository, 'saveCurrent').mockImplementation(() => undefined);
    const statusChangedHandler = vi.fn();
    window.addEventListener('inspection-status-changed', statusChangedHandler as EventListener);

    render(<BackgroundUploadManager />);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    expect(updateSpy).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ id: 'local-1', uploadStatus: UploadStatus.Uploading })
    );
    expect(updateSpy).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ id: 'local-1', uploadStatus: UploadStatus.Uploaded })
    );
    expect(saveCurrentSpy).toHaveBeenCalledTimes(2);
    expect(statusChangedHandler).toHaveBeenCalledTimes(2);

    const [fetchUrl, fetchRequest] = vi.mocked(global.fetch).mock.calls[0] as [
      string,
      { method: string; body: FormData },
    ];
    expect(fetchUrl).toBe('https://upload.test/inspection');
    expect(fetchRequest.method).toBe('POST');
    expect(fetchRequest.body).toBeInstanceOf(FormData);
  });

  it('transitions to failed when upload request fails', async () => {
    const local = makeInspection('local-fail');
    vi.spyOn(inspectionRepository, 'loadAll').mockReturnValue([local]);
    vi.spyOn(inspectionRepository, 'loadFormData').mockReturnValue({});
    const updateSpy = vi.spyOn(inspectionRepository, 'update').mockImplementation((inspection) => inspection);
    vi.spyOn(inspectionRepository, 'loadCurrent').mockReturnValue(makeInspection('local-fail'));
    vi.spyOn(inspectionRepository, 'saveCurrent').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.mocked(global.fetch).mockResolvedValue({ ok: false, status: 500 } as Response);

    render(<BackgroundUploadManager />);

    await waitFor(() => {
      expect(updateSpy).toHaveBeenCalledWith(expect.objectContaining({ uploadStatus: UploadStatus.Failed }));
    });

    expect(updateSpy).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ id: 'local-fail', uploadStatus: UploadStatus.Uploading })
    );
    expect(updateSpy).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ id: 'local-fail', uploadStatus: UploadStatus.Failed })
    );
    expect(deleteFiles).not.toHaveBeenCalled();
  });

  it('only processes local sessions', async () => {
    const local = makeInspection('local-2', { uploadStatus: UploadStatus.Local });
    const uploaded = makeInspection('uploaded-1', { uploadStatus: UploadStatus.Uploaded });
    const inProgress = makeInspection('in-progress-1', { uploadStatus: UploadStatus.InProgress });
    vi.spyOn(inspectionRepository, 'loadAll').mockReturnValue([local, uploaded, inProgress]);
    vi.spyOn(inspectionRepository, 'loadFormData').mockReturnValue({});
    const updateSpy = vi.spyOn(inspectionRepository, 'update').mockImplementation((inspection) => inspection);
    vi.spyOn(inspectionRepository, 'loadCurrent').mockReturnValue(null);
    vi.spyOn(inspectionRepository, 'saveCurrent').mockImplementation(() => undefined);

    render(<BackgroundUploadManager />);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    expect(updateSpy).toHaveBeenCalledTimes(2);
    expect(updateSpy).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ id: 'local-2', uploadStatus: UploadStatus.Uploading })
    );
    expect(updateSpy).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ id: 'local-2', uploadStatus: UploadStatus.Uploaded })
    );
  });

  it('does not overwrite unrelated current session during background status updates', async () => {
    const local = makeInspection('session-a');
    vi.spyOn(inspectionRepository, 'loadAll').mockReturnValue([local]);
    vi.spyOn(inspectionRepository, 'loadFormData').mockReturnValue({});
    vi.spyOn(inspectionRepository, 'update').mockImplementation((inspection) => inspection);
    vi.spyOn(inspectionRepository, 'loadCurrent').mockReturnValue(makeInspection('session-b'));
    const saveCurrentSpy = vi.spyOn(inspectionRepository, 'saveCurrent').mockImplementation(() => undefined);

    render(<BackgroundUploadManager />);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    expect(saveCurrentSpy).not.toHaveBeenCalled();
  });

  it('falls back to auth user id when inspection user id is missing', async () => {
    const local = makeInspection('local-auth-fallback');
    vi.spyOn(inspectionRepository, 'loadAll').mockReturnValue([local]);
    vi.spyOn(inspectionRepository, 'loadFormData').mockReturnValue({});
    vi.spyOn(inspectionRepository, 'update').mockImplementation((inspection) => inspection);
    vi.spyOn(inspectionRepository, 'loadCurrent').mockReturnValue(null);
    vi.spyOn(inspectionRepository, 'saveCurrent').mockImplementation(() => undefined);
    vi.mocked(getUserId).mockReturnValue('auth-user-123');

    render(<BackgroundUploadManager />);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    const [, request] = vi.mocked(global.fetch).mock.calls[0] as [string, { body: FormData }];
    const payloadRaw = request.body.get('payload');
    expect(typeof payloadRaw).toBe('string');
    expect(JSON.parse(payloadRaw as string)).toEqual(
      expect.objectContaining({
        sessionId: 'local-auth-fallback',
        userId: 'auth-user-123',
      })
    );
  });

  it('skips upload when connectivity is offline', async () => {
    setConnectivityStatus('offline');
    vi.spyOn(inspectionRepository, 'loadAll').mockReturnValue([makeInspection('offline-local')]);
    vi.spyOn(inspectionRepository, 'update').mockImplementation((inspection) => inspection);

    render(<BackgroundUploadManager />);

    await waitFor(() => {
      expect(global.fetch).not.toHaveBeenCalled();
    });
    expect(inspectionRepository.update).not.toHaveBeenCalled();
  });

  it('warns when referenced files are missing from storage', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const local = makeInspection('local-missing-file');
    vi.spyOn(inspectionRepository, 'loadAll').mockReturnValue([local]);
    vi.spyOn(inspectionRepository, 'loadFormData').mockReturnValue({
      'ext.fileSingle': {
        id: 'missing-file',
        name: 'missing.txt',
        type: 'text/plain',
        size: 1,
        lastModified: 1,
      },
    });
    vi.spyOn(inspectionRepository, 'update').mockImplementation((inspection) => inspection);
    vi.spyOn(inspectionRepository, 'loadCurrent').mockReturnValue(null);
    vi.spyOn(inspectionRepository, 'saveCurrent').mockImplementation(() => undefined);

    render(<BackgroundUploadManager />);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });
    expect(console.warn).toHaveBeenCalledWith('Missing stored file for missing-file');
  });

  it('deletes uploaded files after a successful upload', async () => {
    const local = makeInspection('local-file-delete');
    vi.spyOn(inspectionRepository, 'loadAll').mockReturnValue([local]);
    vi.spyOn(inspectionRepository, 'loadFormData').mockReturnValue({
      'ext.fileMultiple': [
        { id: 'file-a', name: 'a.txt', type: 'text/plain', size: 1, lastModified: 1 },
        { id: 'file-b', name: 'b.txt', type: 'text/plain', size: 1, lastModified: 1 },
      ],
    });
    vi.mocked(getFile).mockImplementation(async (id) => ({
      id,
      name: `${id}.txt`,
      blob: new Blob(['content'], { type: 'text/plain' }),
      type: 'text/plain',
      size: 7,
      lastModified: 1,
    }));
    vi.spyOn(inspectionRepository, 'update').mockImplementation((inspection) => inspection);
    vi.spyOn(inspectionRepository, 'loadCurrent').mockReturnValue(null);
    vi.spyOn(inspectionRepository, 'saveCurrent').mockImplementation(() => undefined);

    render(<BackgroundUploadManager />);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });
    expect(deleteFiles).toHaveBeenCalledWith(['file-a', 'file-b']);
  });

  it('treats inspections without uploadStatus as local', async () => {
    const localByDefault = makeInspection('implicit-local', { uploadStatus: undefined });
    vi.spyOn(inspectionRepository, 'loadAll').mockReturnValue([localByDefault]);
    vi.spyOn(inspectionRepository, 'loadFormData').mockReturnValue({});
    vi.spyOn(inspectionRepository, 'update').mockImplementation((inspection) => inspection);
    vi.spyOn(inspectionRepository, 'loadCurrent').mockReturnValue(null);
    vi.spyOn(inspectionRepository, 'saveCurrent').mockImplementation(() => undefined);

    render(<BackgroundUploadManager />);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });
    expect(inspectionRepository.update).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'implicit-local', uploadStatus: UploadStatus.Uploading })
    );
  });
});
