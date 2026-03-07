import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getUserId } from './auth';
import { inspectionRepository } from './repositories/inspectionRepository';
import { buildInspectionSyncFingerprint, syncQueue } from './syncQueue';
import { FormType, type InspectionSession, UploadStatus } from './types';
import { appDataStore } from './utils/appDataStore';

vi.mock('./auth', () => ({
  getUserId: vi.fn(() => 'user-123'),
}));

vi.mock('./config', async () => {
  const actual = await vi.importActual<typeof import('./config')>('./config');
  return {
    ...actual,
    getActiveTenant: () => ({ tenantId: 'tenant-a' }),
  };
});

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
    vi.mocked(getUserId).mockReturnValue('user-123');
  });

  it('reuses the same idempotency key when the queued payload has not changed', async () => {
    const inspection = makeInspection('same-payload');
    const formData = { note: 'ready' };

    const firstEntry = await syncQueue.enqueue(inspection, formData);
    const secondEntry = await syncQueue.enqueue(inspection, formData);

    expect(secondEntry.idempotencyKey).toBe(firstEntry.idempotencyKey);
    expect(secondEntry.fingerprint).toBe(firstEntry.fingerprint);
  });

  it('rotates the idempotency key when the queued payload changes', async () => {
    const inspection = makeInspection('changed-payload');

    const firstEntry = await syncQueue.enqueue(inspection, { note: 'first' });
    const secondEntry = await syncQueue.enqueue(inspection, { note: 'second' });

    expect(secondEntry.idempotencyKey).not.toBe(firstEntry.idempotencyKey);
    expect(secondEntry.fingerprint).not.toBe(firstEntry.fingerprint);
  });

  it('creates missing queue items for local, failed, and stale uploading inspections', async () => {
    const local = makeInspection('local', { uploadStatus: UploadStatus.Local });
    const failed = makeInspection('failed', { uploadStatus: UploadStatus.Failed });
    const uploading = makeInspection('uploading', { uploadStatus: UploadStatus.Uploading });
    const uploaded = makeInspection('uploaded', { uploadStatus: UploadStatus.Uploaded });

    await inspectionRepository.save(local);
    await inspectionRepository.save(failed);
    await inspectionRepository.save(uploading);
    await inspectionRepository.save(uploaded);

    await syncQueue.ensureQueuedForPendingInspections([local, failed, uploading, uploaded]);

    expect(await syncQueue.load(local.id)).not.toBeNull();
    expect(await syncQueue.load(failed.id)).not.toBeNull();
    expect(await syncQueue.load(uploading.id)).not.toBeNull();
    expect(await syncQueue.load(uploaded.id)).toBeNull();
  });

  it('claims only ready entries and persists retry backoff after failures', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);

    const now = 100_000;
    vi.spyOn(Date, 'now').mockReturnValue(now);

    const inspection = makeInspection('retryable');
    const initialEntry = await syncQueue.enqueue(inspection, {});
    const claimedEntry = await syncQueue.claimNextReady('worker-a', now);

    expect(claimedEntry).toEqual(expect.objectContaining({ inspectionId: initialEntry.inspectionId, status: 'syncing' }));

    const failedEntry = await syncQueue.markFailed(claimedEntry!, 'boom', now);

    expect(failedEntry).toEqual(
      expect.objectContaining({
        inspectionId: 'retryable',
        status: 'failed',
        attemptCount: 1,
        nextAttemptAt: now + 4_500,
        idempotencyKey: initialEntry.idempotencyKey,
      })
    );
    expect(await syncQueue.claimNextReady('worker-a', now + 4_499)).toBeNull();
    expect(await syncQueue.claimNextReady('worker-a', now + 4_500)).toEqual(
      expect.objectContaining({ inspectionId: 'retryable', status: 'syncing' })
    );
  });

  it('moves entries to dead-letter after repeated failures and allows manual requeue', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);

    const now = 200_000;
    vi.spyOn(Date, 'now').mockReturnValue(now);

    const inspection = makeInspection('dead-letterable');
    await syncQueue.enqueue(inspection, {});

    let claimed = await syncQueue.claimNextReady('worker-a', now);
    let failed = await syncQueue.markFailed(claimed!, 'first failure', now);
    expect(failed.status).toBe('failed');

    claimed = await syncQueue.claimNextReady('worker-a', failed.nextAttemptAt);
    failed = await syncQueue.markFailed(claimed!, 'second failure', failed.nextAttemptAt);
    expect(failed.status).toBe('failed');

    claimed = await syncQueue.claimNextReady('worker-a', failed.nextAttemptAt);
    failed = await syncQueue.markFailed(claimed!, 'third failure', failed.nextAttemptAt);
    expect(failed).toEqual(
      expect.objectContaining({
        inspectionId: 'dead-letterable',
        status: 'dead-letter',
        deadLetterReason: 'third failure',
      })
    );
    expect(await syncQueue.claimNextReady('worker-a', failed.nextAttemptAt + 1)).toBeNull();

    const retried = await syncQueue.retry(failed, failed.nextAttemptAt + 2);
    expect(retried).toEqual(
      expect.objectContaining({
        inspectionId: 'dead-letterable',
        status: 'pending',
        attemptCount: 0,
        deadLetterReason: undefined,
      })
    );
  });

  it('sorts queue entries and coordinates worker leases', async () => {
    const now = 50_000;
    vi.spyOn(Date, 'now').mockReturnValue(now);
    const inspectionA = makeInspection('a');
    const inspectionB = makeInspection('b');

    await syncQueue.enqueue(inspectionA, { note: 'later' });
    await syncQueue.enqueue(inspectionB, { note: 'sooner' });

    const entryA = await syncQueue.load('a');
    await syncQueue.markFailed(entryA!, 'retry later', now);

    const ordered = await syncQueue.list();
    expect(ordered.map((entry) => entry.inspectionId)).toEqual(['b', 'a']);

    expect(await syncQueue.tryAcquireWorkerLease('worker-a', now)).toBe(true);
    expect(await syncQueue.tryAcquireWorkerLease('worker-b', now + 1)).toBe(false);
    expect(await syncQueue.renewWorkerLease('worker-a', now + 2)).toBe(true);

    await syncQueue.releaseWorkerLease('worker-b');
    expect(await syncQueue.tryAcquireWorkerLease('worker-b', now + 3)).toBe(false);

    await syncQueue.releaseWorkerLease('worker-a');
    expect(await syncQueue.tryAcquireWorkerLease('worker-b', now + 4)).toBe(true);
  });

  it('handles fingerprint refresh, deletion, subscribe, and anonymous scopes', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(90_000);
    const subscribeSpy = vi.spyOn(appDataStore, 'subscribe');
    const listener = vi.fn();
    syncQueue.subscribe(listener);
    expect(subscribeSpy).toHaveBeenCalledWith('tenant-a:user-123', listener);

    vi.mocked(getUserId).mockReturnValue(null);
    const anonymousInspection = makeInspection('anon', { userId: undefined });
    await inspectionRepository.saveFormData(anonymousInspection.id, { note: 'stored' }, anonymousInspection);

    const queued = await syncQueue.ensureQueuedForInspection(anonymousInspection);
    expect(queued.userId).toBeUndefined();

    const unchanged = await syncQueue.refreshFingerprint(queued, anonymousInspection, { note: 'stored' });
    expect(unchanged).toEqual(queued);

    const changed = await syncQueue.refreshFingerprint(queued, anonymousInspection, { note: 'changed' });
    expect(changed.idempotencyKey).not.toBe(queued.idempotencyKey);
    expect(changed.attemptCount).toBe(0);
    expect(buildInspectionSyncFingerprint(anonymousInspection, { note: 'changed' })).toBe(changed.fingerprint);

    await syncQueue.markSucceeded(anonymousInspection.id, anonymousInspection);
    expect(await syncQueue.load(anonymousInspection.id)).toBeNull();

    await syncQueue.enqueue(makeInspection('delete-me'), {});
    await syncQueue.delete('delete-me');
    expect(await syncQueue.load('delete-me')).toBeNull();
  });

  it('exposes queue diagnostics and worker lease state', async () => {
    const now = 300_000;
    vi.spyOn(Date, 'now').mockReturnValue(now);

    await syncQueue.enqueue(makeInspection('diag-a'), {});
    await syncQueue.enqueue(makeInspection('diag-b'), {});
    const claimed = await syncQueue.claimNextReady('worker-a', now);
    await syncQueue.markFailed(claimed!, 'boom', now);
    await syncQueue.tryAcquireWorkerLease('worker-a', now);

    const diagnostics = await syncQueue.getDiagnostics();
    expect(diagnostics.metrics).toEqual(
      expect.objectContaining({
        totalCount: 2,
        syncingCount: 0,
        failedCount: 1,
        deadLetterCount: 0,
      })
    );
    expect(diagnostics.workerLease).toEqual(
      expect.objectContaining({
        ownerId: 'worker-a',
      })
    );
  });
});
