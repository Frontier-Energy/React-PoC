export type QueueStatus = 'pending' | 'syncing' | 'failed';

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
}
