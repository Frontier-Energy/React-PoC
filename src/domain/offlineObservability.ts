import type { SyncQueueDiagnostics } from './syncQueue';

export type StoragePressureLevel = 'unknown' | 'normal' | 'warning' | 'critical';
export type BootstrapHealthStatus = 'idle' | 'loading' | 'ready' | 'degraded';
export type OfflineBootstrapSource = 'network' | 'cache' | 'defaults' | 'unknown';

export interface OfflineQueueObservability {
  current: SyncQueueDiagnostics['metrics'];
  lastUpdatedAt: number | null;
  lastSuccessAt: number | null;
  lastFailureAt: number | null;
  lastDeadLetterAt: number | null;
  processedAttemptCount: number;
  retryScheduledCount: number;
  deadLetteredTotal: number;
  retryRate: number | null;
}

export interface BootstrapObservability {
  status: BootstrapHealthStatus;
  source: OfflineBootstrapSource;
  lastAttemptAt: number | null;
  lastSuccessAt: number | null;
  lastFailureAt: number | null;
  failureCount: number;
  consecutiveFailureCount: number;
  lastError: string | null;
}

export interface StorageObservability {
  lastMeasuredAt: number | null;
  usageBytes: number | null;
  quotaBytes: number | null;
  usageRatio: number | null;
  pressure: StoragePressureLevel;
  quotaFailureCount: number;
  lastQuotaFailureAt: number | null;
  lastError: string | null;
}

export interface OfflineObservabilitySnapshot {
  tenantId: string;
  updatedAt: number | null;
  queue: OfflineQueueObservability;
  bootstrap: BootstrapObservability;
  storage: StorageObservability;
}

export const emptyQueueMetrics = (): SyncQueueDiagnostics['metrics'] => ({
  totalCount: 0,
  readyCount: 0,
  pendingCount: 0,
  syncingCount: 0,
  failedCount: 0,
  deadLetterCount: 0,
  conflictCount: 0,
  oldestEntryAgeMs: null,
  nextAttemptAt: null,
});

export const createEmptyOfflineObservabilitySnapshot = (tenantId: string): OfflineObservabilitySnapshot => ({
  tenantId,
  updatedAt: null,
  queue: {
    current: emptyQueueMetrics(),
    lastUpdatedAt: null,
    lastSuccessAt: null,
    lastFailureAt: null,
    lastDeadLetterAt: null,
    processedAttemptCount: 0,
    retryScheduledCount: 0,
    deadLetteredTotal: 0,
    retryRate: null,
  },
  bootstrap: {
    status: 'idle',
    source: 'unknown',
    lastAttemptAt: null,
    lastSuccessAt: null,
    lastFailureAt: null,
    failureCount: 0,
    consecutiveFailureCount: 0,
    lastError: null,
  },
  storage: {
    lastMeasuredAt: null,
    usageBytes: null,
    quotaBytes: null,
    usageRatio: null,
    pressure: 'unknown',
    quotaFailureCount: 0,
    lastQuotaFailureAt: null,
    lastError: null,
  },
});
