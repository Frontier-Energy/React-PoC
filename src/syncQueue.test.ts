import { beforeEach, describe, expect, it, vi } from 'vitest';
import { inspectionRepository } from './repositories/inspectionRepository';
import { syncQueue } from './syncQueue';
import { FormType, type InspectionSession, UploadStatus } from './types';

const makeInspection = (id: string, overrides?: Partial<InspectionSession>): InspectionSession => ({
  id,
  name: `Inspection ${id}`,
  formType: FormType.HVAC,
  tenantId: 'tenant-a',
  uploadStatus: UploadStatus.Local,
  ...overrides,
});

describe('syncQueue', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('reuses the same idempotency key when the queued payload has not changed', () => {
    const inspection = makeInspection('same-payload');
    const formData = { note: 'ready' };

    const firstEntry = syncQueue.enqueue(inspection, formData);
    const secondEntry = syncQueue.enqueue(inspection, formData);

    expect(secondEntry.idempotencyKey).toBe(firstEntry.idempotencyKey);
    expect(secondEntry.fingerprint).toBe(firstEntry.fingerprint);
  });

  it('rotates the idempotency key when the queued payload changes', () => {
    const inspection = makeInspection('changed-payload');

    const firstEntry = syncQueue.enqueue(inspection, { note: 'first' });
    const secondEntry = syncQueue.enqueue(inspection, { note: 'second' });

    expect(secondEntry.idempotencyKey).not.toBe(firstEntry.idempotencyKey);
    expect(secondEntry.fingerprint).not.toBe(firstEntry.fingerprint);
  });

  it('creates missing queue items for local, failed, and stale uploading inspections', () => {
    const local = makeInspection('local', { uploadStatus: UploadStatus.Local });
    const failed = makeInspection('failed', { uploadStatus: UploadStatus.Failed });
    const uploading = makeInspection('uploading', { uploadStatus: UploadStatus.Uploading });
    const uploaded = makeInspection('uploaded', { uploadStatus: UploadStatus.Uploaded });

    inspectionRepository.save(local);
    inspectionRepository.save(failed);
    inspectionRepository.save(uploading);
    inspectionRepository.save(uploaded);

    syncQueue.ensureQueuedForPendingInspections([local, failed, uploading, uploaded]);

    expect(syncQueue.load(local.id)).not.toBeNull();
    expect(syncQueue.load(failed.id)).not.toBeNull();
    expect(syncQueue.load(uploading.id)).not.toBeNull();
    expect(syncQueue.load(uploaded.id)).toBeNull();
  });

  it('claims only ready entries and persists retry backoff after failures', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);

    const now = 100_000;
    vi.spyOn(Date, 'now').mockReturnValue(now);

    const inspection = makeInspection('retryable');
    const initialEntry = syncQueue.enqueue(inspection, {});
    const claimedEntry = syncQueue.claimNextReady('worker-a', now);

    expect(claimedEntry).toEqual(expect.objectContaining({ inspectionId: initialEntry.inspectionId, status: 'syncing' }));

    const failedEntry = syncQueue.markFailed(claimedEntry!, 'boom', now);

    expect(failedEntry).toEqual(
      expect.objectContaining({
        inspectionId: 'retryable',
        status: 'failed',
        attemptCount: 1,
        nextAttemptAt: now + 4_500,
        idempotencyKey: initialEntry.idempotencyKey,
      })
    );
    expect(syncQueue.claimNextReady('worker-a', now + 4_499)).toBeNull();
    expect(syncQueue.claimNextReady('worker-a', now + 4_500)).toEqual(
      expect.objectContaining({ inspectionId: 'retryable', status: 'syncing' })
    );
  });
});
