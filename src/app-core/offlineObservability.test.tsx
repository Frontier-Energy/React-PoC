import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useEffect } from 'react';
import { offlineObservability, useOfflineObservability } from './offlineObservability';
import { emitStoragePressureEvent } from './storagePressureSignals';

const appDataStoreState = vi.hoisted(() => {
  const snapshots = new Map<string, unknown>();
  const listeners = new Map<string, Set<() => void>>();

  return {
    reset() {
      snapshots.clear();
      listeners.clear();
    },
    async getTenantObservability(tenantId: string) {
      return (snapshots.get(tenantId) as unknown) ?? null;
    },
    async putTenantObservability(tenantId: string, value: unknown) {
      snapshots.set(tenantId, value);
      listeners.get(`tenantObservability:${tenantId}`)?.forEach((listener) => listener());
    },
    subscribe(scopeKey: string, listener: () => void) {
      const scoped = listeners.get(scopeKey) ?? new Set<() => void>();
      scoped.add(listener);
      listeners.set(scopeKey, scoped);
      return () => {
        scoped.delete(listener);
      };
    },
  };
});

vi.mock('./utils/appDataStore', () => ({
  appDataStore: appDataStoreState,
}));

describe('offlineObservability', () => {
  beforeEach(() => {
    appDataStoreState.reset();
    vi.restoreAllMocks();
    vi.stubGlobal('navigator', {
      storage: {
        estimate: vi.fn(async () => ({ usage: 1024, quota: 4096 })),
      },
    });
  });

  it('records queue, bootstrap, and storage state and computes retry metrics', async () => {
    await offlineObservability.refreshQueue('tenant-a', {
      generatedAt: 100,
      entries: [],
      workerLease: null,
      metrics: {
        totalCount: 2,
        readyCount: 1,
        pendingCount: 1,
        syncingCount: 0,
        failedCount: 0,
        deadLetterCount: 0,
        conflictCount: 0,
        oldestEntryAgeMs: 5000,
        nextAttemptAt: 120,
      },
    });

    await offlineObservability.recordQueueAttemptResult('tenant-a', 'retry', 101);
    await offlineObservability.recordQueueAttemptResult('tenant-a', 'dead-letter', 102);
    await offlineObservability.recordQueueAttemptResult('tenant-a', 'success', 103);
    await offlineObservability.recordBootstrapState('tenant-a', 'loading', 'cache', { at: 104 });
    await offlineObservability.recordBootstrapState('tenant-a', 'degraded', 'cache', {
      at: 105,
      errorMessage: 'bootstrap failed',
    });
    await offlineObservability.recordBootstrapState('tenant-a', 'ready', 'network', { at: 106 });
    await offlineObservability.refreshStoragePressure('tenant-a', 107);

    const snapshot = await offlineObservability.getSnapshot('tenant-a');

    expect(snapshot.queue.current.totalCount).toBe(2);
    expect(snapshot.queue.processedAttemptCount).toBe(3);
    expect(snapshot.queue.retryScheduledCount).toBe(1);
    expect(snapshot.queue.deadLetteredTotal).toBe(1);
    expect(snapshot.queue.retryRate).toBeCloseTo(1 / 3);
    expect(snapshot.queue.lastSuccessAt).toBe(103);
    expect(snapshot.queue.lastDeadLetterAt).toBe(102);
    expect(snapshot.bootstrap.failureCount).toBe(1);
    expect(snapshot.bootstrap.consecutiveFailureCount).toBe(0);
    expect(snapshot.bootstrap.lastError).toBeNull();
    expect(snapshot.storage.usageBytes).toBe(1024);
    expect(snapshot.storage.quotaBytes).toBe(4096);
    expect(snapshot.storage.pressure).toBe('normal');
  });

  it('gracefully handles storage persistence failures and missing storage estimates', async () => {
    const putSpy = vi.spyOn(appDataStoreState, 'putTenantObservability').mockRejectedValueOnce(new Error('disk unavailable'));
    vi.stubGlobal('navigator', {});

    await expect(
      offlineObservability.recordBootstrapState('tenant-b', 'degraded', 'defaults', {
        at: 200,
        errorMessage: 'fallback',
      })
    ).resolves.toMatchObject({
      tenantId: 'tenant-b',
    });
    await offlineObservability.refreshStoragePressure('tenant-b', 201);

    const snapshot = await offlineObservability.getSnapshot('tenant-b');
    expect(snapshot.bootstrap.lastError).toBe('fallback');
    expect(snapshot.storage.pressure).toBe('unknown');
    expect(putSpy).toHaveBeenCalled();
  });

  it('falls back to an empty snapshot when the stored snapshot cannot be loaded', async () => {
    vi.spyOn(appDataStoreState, 'getTenantObservability').mockRejectedValueOnce(new Error('load failed'));

    const snapshot = await offlineObservability.getSnapshot('tenant-load-failure');

    expect(snapshot.tenantId).toBe('tenant-load-failure');
    expect(snapshot.queue.processedAttemptCount).toBe(0);
  });

  it('subscribes by tenant and records emitted quota pressure events', async () => {
    const listener = vi.fn();
    const unsubscribe = offlineObservability.subscribe('tenant-c', listener);

    emitStoragePressureEvent({
      tenantId: 'tenant-c',
      userId: 'user-1',
      scopeKey: 'tenant-c:user-1',
      message: 'quota exceeded',
      at: 300,
    });

    await waitFor(async () => {
      expect((await offlineObservability.getSnapshot('tenant-c')).storage.quotaFailureCount).toBe(1);
    });

    expect(listener).toHaveBeenCalled();
    unsubscribe();
  });

  it('updates the hook when tenant-scoped observability changes', async () => {
    function Probe() {
      const snapshot = useOfflineObservability('tenant-hook');

      useEffect(() => {
        void offlineObservability.recordQueueAttemptResult('tenant-hook', 'retry', 400);
      }, []);

      return <div>{snapshot.queue.retryScheduledCount}</div>;
    }

    render(<Probe />);

    await waitFor(() => {
      expect(screen.getByText('1')).toBeInTheDocument();
    });
  });

  it('calculates warning and critical storage pressure levels from estimates', async () => {
    vi.stubGlobal('navigator', {
      storage: {
        estimate: vi.fn(async () => ({ usage: 95, quota: 100 })),
      },
    });

    await offlineObservability.refreshStoragePressure('tenant-pressure', 500);
    expect((await offlineObservability.getSnapshot('tenant-pressure')).storage.pressure).toBe('critical');

    vi.stubGlobal('navigator', {
      storage: {
        estimate: vi.fn(async () => ({ usage: 85, quota: 100 })),
      },
    });

    await offlineObservability.refreshStoragePressure('tenant-pressure', 501);
    expect((await offlineObservability.getSnapshot('tenant-pressure')).storage.pressure).toBe('warning');
  });
});
