import { useEffect, useState } from 'react';
import {
  createEmptyOfflineObservabilitySnapshot,
  type BootstrapHealthStatus,
  type OfflineObservabilitySnapshot,
  type OfflineBootstrapSource,
  type StoragePressureLevel,
} from './domain/offlineObservability';
import type { SyncQueueDiagnostics } from './domain/syncQueue';
import { appDataStore } from './utils/appDataStore';
import { subscribeToStoragePressure } from './storagePressureSignals';

const listenersByTenant = new Map<string, Set<() => void>>();
const snapshotCache = new Map<string, OfflineObservabilitySnapshot>();
const unsubscribeByTenant = new Map<string, () => void>();
let storagePressureSubscriptionInitialized = false;

const emit = (tenantId: string) => {
  listenersByTenant.get(tenantId)?.forEach((listener) => listener());
};

const ensureSnapshot = async (tenantId: string) => {
  const cached = snapshotCache.get(tenantId);
  if (cached) {
    return cached;
  }

  let stored = createEmptyOfflineObservabilitySnapshot(tenantId);
  try {
    stored = (await appDataStore.getTenantObservability(tenantId)) ?? stored;
  } catch {
    stored = createEmptyOfflineObservabilitySnapshot(tenantId);
  }
  snapshotCache.set(tenantId, stored);
  return stored;
};

const persistSnapshot = async (
  tenantId: string,
  updater: (current: OfflineObservabilitySnapshot) => OfflineObservabilitySnapshot
) => {
  const current = await ensureSnapshot(tenantId);
  const updated = updater(current);
  snapshotCache.set(tenantId, updated);
  try {
    await appDataStore.putTenantObservability(tenantId, updated);
  } catch {
    return updated;
  }
  emit(tenantId);
  return updated;
};

const toPressureLevel = (usageRatio: number | null): StoragePressureLevel => {
  if (usageRatio === null) {
    return 'unknown';
  }
  if (usageRatio >= 0.95) {
    return 'critical';
  }
  if (usageRatio >= 0.8) {
    return 'warning';
  }
  return 'normal';
};

const withUpdatedAt = (snapshot: OfflineObservabilitySnapshot, updatedAt: number) => ({
  ...snapshot,
  updatedAt,
});

const calculateRetryRate = (processedAttemptCount: number, retryScheduledCount: number) =>
  processedAttemptCount > 0 ? retryScheduledCount / processedAttemptCount : null;

const initStoragePressureSubscription = () => {
  if (storagePressureSubscriptionInitialized) {
    return;
  }

  storagePressureSubscriptionInitialized = true;
  subscribeToStoragePressure((detail) => {
    void offlineObservability.recordStorageQuotaExceeded(detail.tenantId, detail.message, detail.at);
  });
};

export const offlineObservability = {
  async getSnapshot(tenantId: string) {
    initStoragePressureSubscription();
    return ensureSnapshot(tenantId);
  },

  subscribe(tenantId: string, listener: () => void) {
    initStoragePressureSubscription();
    let tenantListeners = listenersByTenant.get(tenantId);
    if (!tenantListeners) {
      tenantListeners = new Set();
      listenersByTenant.set(tenantId, tenantListeners);
    }
    tenantListeners.add(listener);

    if (!unsubscribeByTenant.has(tenantId)) {
      unsubscribeByTenant.set(
        tenantId,
        appDataStore.subscribe(`tenantObservability:${tenantId}`, async () => {
          try {
            snapshotCache.set(
              tenantId,
              (await appDataStore.getTenantObservability(tenantId)) ?? createEmptyOfflineObservabilitySnapshot(tenantId)
            );
          } catch {
            snapshotCache.set(tenantId, createEmptyOfflineObservabilitySnapshot(tenantId));
          }
          emit(tenantId);
        })
      );
    }

    void this.getSnapshot(tenantId).then(() => emit(tenantId));

    return () => {
      tenantListeners?.delete(listener);
      if (tenantListeners && tenantListeners.size === 0) {
        listenersByTenant.delete(tenantId);
        unsubscribeByTenant.get(tenantId)?.();
        unsubscribeByTenant.delete(tenantId);
      }
    };
  },

  async refreshQueue(tenantId: string, diagnostics: SyncQueueDiagnostics, at = diagnostics.generatedAt) {
    return persistSnapshot(tenantId, (current) =>
      withUpdatedAt(
        {
          ...current,
          queue: {
            ...current.queue,
            current: diagnostics.metrics,
            lastUpdatedAt: at,
          },
        },
        at
      )
    );
  },

  async recordQueueAttemptResult(tenantId: string, outcome: 'success' | 'retry' | 'dead-letter' | 'conflict', at = Date.now()) {
    return persistSnapshot(tenantId, (current) => {
      const processedAttemptCount = current.queue.processedAttemptCount + 1;
      const retryScheduledCount = current.queue.retryScheduledCount + (outcome === 'retry' ? 1 : 0);
      const deadLetteredTotal = current.queue.deadLetteredTotal + (outcome === 'dead-letter' ? 1 : 0);

      return withUpdatedAt(
        {
          ...current,
          queue: {
            ...current.queue,
            lastSuccessAt: outcome === 'success' ? at : current.queue.lastSuccessAt,
            lastFailureAt: outcome === 'retry' || outcome === 'dead-letter' || outcome === 'conflict' ? at : current.queue.lastFailureAt,
            lastDeadLetterAt: outcome === 'dead-letter' ? at : current.queue.lastDeadLetterAt,
            processedAttemptCount,
            retryScheduledCount,
            deadLetteredTotal,
            retryRate: calculateRetryRate(processedAttemptCount, retryScheduledCount),
          },
        },
        at
      );
    });
  },

  async recordBootstrapState(
    tenantId: string,
    status: BootstrapHealthStatus,
    source: OfflineBootstrapSource,
    options?: { at?: number; errorMessage?: string | null }
  ) {
    const at = options?.at ?? Date.now();
    const errorMessage = options?.errorMessage ?? null;

    return persistSnapshot(tenantId, (current) =>
      withUpdatedAt(
        {
          ...current,
          bootstrap: {
            ...current.bootstrap,
            status,
            source,
            lastAttemptAt: status === 'loading' ? at : current.bootstrap.lastAttemptAt,
            lastSuccessAt: status === 'ready' ? at : current.bootstrap.lastSuccessAt,
            lastFailureAt: status === 'degraded' ? at : current.bootstrap.lastFailureAt,
            failureCount: status === 'degraded' ? current.bootstrap.failureCount + 1 : current.bootstrap.failureCount,
            consecutiveFailureCount:
              status === 'degraded'
                ? current.bootstrap.consecutiveFailureCount + 1
                : status === 'ready'
                  ? 0
                  : current.bootstrap.consecutiveFailureCount,
            lastError: status === 'degraded' ? errorMessage : status === 'ready' ? null : current.bootstrap.lastError,
          },
        },
        at
      )
    );
  },

  async refreshStoragePressure(tenantId: string, at = Date.now()) {
    if (typeof navigator === 'undefined' || !navigator.storage || typeof navigator.storage.estimate !== 'function') {
      return persistSnapshot(tenantId, (current) =>
        withUpdatedAt(
          {
            ...current,
            storage: {
              ...current.storage,
              lastMeasuredAt: at,
              pressure: 'unknown',
            },
          },
          at
        )
      );
    }

    const estimate = await navigator.storage.estimate();
    const usageBytes = typeof estimate.usage === 'number' ? estimate.usage : null;
    const quotaBytes = typeof estimate.quota === 'number' ? estimate.quota : null;
    const usageRatio = usageBytes !== null && quotaBytes && quotaBytes > 0 ? usageBytes / quotaBytes : null;

    return persistSnapshot(tenantId, (current) =>
      withUpdatedAt(
        {
          ...current,
          storage: {
            ...current.storage,
            lastMeasuredAt: at,
            usageBytes,
            quotaBytes,
            usageRatio,
            pressure: toPressureLevel(usageRatio),
            lastError: current.storage.lastError,
          },
        },
        at
      )
    );
  },

  async recordStorageQuotaExceeded(tenantId: string, message: string, at = Date.now()) {
    return persistSnapshot(tenantId, (current) =>
      withUpdatedAt(
        {
          ...current,
          storage: {
            ...current.storage,
            lastMeasuredAt: at,
            pressure: 'critical',
            quotaFailureCount: current.storage.quotaFailureCount + 1,
            lastQuotaFailureAt: at,
            lastError: message,
          },
        },
        at
      )
    );
  },
};

export const useOfflineObservability = (tenantId: string) => {
  const [snapshot, setSnapshot] = useState<OfflineObservabilitySnapshot>(createEmptyOfflineObservabilitySnapshot(tenantId));

  useEffect(() => {
    let cancelled = false;

    const syncSnapshot = async () => {
      const next = await offlineObservability.getSnapshot(tenantId);
      if (!cancelled) {
        setSnapshot(next);
      }
    };

    void syncSnapshot();
    const unsubscribe = offlineObservability.subscribe(tenantId, () => {
      void syncSnapshot();
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [tenantId]);

  return snapshot;
};
