export type QueueStatus = 'pending' | 'syncing' | 'failed' | 'dead-letter';

export interface SyncQueueEntry {
  inspectionId: string;
  tenantId: string;
  userId?: string;
  status: QueueStatus;
  fingerprint: string;
  idempotencyKey: string;
  attemptCount: number;
  nextAttemptAt: number;
  createdAt: number;
  updatedAt: number;
  lastAttemptAt?: number;
  lastError?: string;
  processingOwnerId?: string;
  processingExpiresAt?: number;
  deadLetteredAt?: number;
  deadLetterReason?: string;
}

export interface SyncWorkerLease {
  ownerId: string;
  expiresAt: number;
}

export interface SyncQueueMetrics {
  totalCount: number;
  readyCount: number;
  pendingCount: number;
  syncingCount: number;
  failedCount: number;
  deadLetterCount: number;
  oldestEntryAgeMs: number | null;
  nextAttemptAt: number | null;
}

export interface SyncQueueDiagnostics {
  generatedAt: number;
  entries: SyncQueueEntry[];
  workerLease: SyncWorkerLease | null;
  metrics: SyncQueueMetrics;
}
