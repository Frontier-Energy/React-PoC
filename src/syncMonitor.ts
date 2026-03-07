import { useEffect, useState } from 'react';
import type { SyncQueueDiagnostics, SyncQueueEntry } from './domain/syncQueue';
import { inspectionRepository } from './repositories/inspectionRepository';
import { syncQueue } from './syncQueue';

export type SyncMonitorState = 'idle' | 'running' | 'paused' | 'blocked';

export interface SyncMonitorEvent {
  id: string;
  at: number;
  level: 'info' | 'error';
  type:
    | 'cycle-started'
    | 'cycle-completed'
    | 'wake-up'
    | 'paused'
    | 'busy'
    | 'lease-acquired'
    | 'lease-unavailable'
    | 'lease-lost'
    | 'inspection-claimed'
    | 'inspection-succeeded'
    | 'inspection-failed'
    | 'inspection-dead-lettered'
    | 'inspection-deleted';
  message: string;
  inspectionId?: string;
}

export interface SyncMonitorSnapshot {
  scopeKey: string;
  state: SyncMonitorState;
  lastUpdatedAt: number | null;
  lastCycleStartedAt: number | null;
  lastCycleCompletedAt: number | null;
  lastSuccessfulSyncAt: number | null;
  lastFailedSyncAt: number | null;
  pauseReason: string | null;
  lastError: string | null;
  queue: SyncQueueDiagnostics;
  recentEvents: SyncMonitorEvent[];
}

const MAX_RECENT_EVENTS = 20;

const emptyDiagnostics = (): SyncQueueDiagnostics => ({
  generatedAt: Date.now(),
  entries: [],
  workerLease: null,
  metrics: {
    totalCount: 0,
    readyCount: 0,
    pendingCount: 0,
    syncingCount: 0,
    failedCount: 0,
    deadLetterCount: 0,
    oldestEntryAgeMs: null,
    nextAttemptAt: null,
  },
});

const createEventId = () => {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }

  return `sync-event:${Date.now()}:${Math.random().toString(16).slice(2)}`;
};

let snapshot: SyncMonitorSnapshot = {
  scopeKey: inspectionRepository.getStorageScopeKey(),
  state: 'idle',
  lastUpdatedAt: null,
  lastCycleStartedAt: null,
  lastCycleCompletedAt: null,
  lastSuccessfulSyncAt: null,
  lastFailedSyncAt: null,
  pauseReason: null,
  lastError: null,
  queue: emptyDiagnostics(),
  recentEvents: [],
};

const listeners = new Set<() => void>();
let unsubscribeQueue: (() => void) | null = null;
let subscribedScopeKey: string | null = null;

const emit = () => {
  listeners.forEach((listener) => listener());
};

const updateSnapshot = (updater: (current: SyncMonitorSnapshot) => SyncMonitorSnapshot) => {
  snapshot = updater(snapshot);
  emit();
};

const pushEvent = (event: Omit<SyncMonitorEvent, 'id' | 'at'>, at = Date.now()) => {
  updateSnapshot((current) => ({
    ...current,
    lastUpdatedAt: at,
    recentEvents: [{ ...event, id: createEventId(), at }, ...current.recentEvents].slice(0, MAX_RECENT_EVENTS),
  }));
};

const ensureScopeSubscription = () => {
  const scopeKey = inspectionRepository.getStorageScopeKey();
  if (scopeKey === subscribedScopeKey && unsubscribeQueue) {
    return;
  }

  unsubscribeQueue?.();
  subscribedScopeKey = scopeKey;
  snapshot = {
    ...snapshot,
    scopeKey,
  };
  unsubscribeQueue = syncQueue.subscribe(() => {
    void syncMonitor.refresh();
  });
};

export const syncMonitor = {
  getSnapshot() {
    ensureScopeSubscription();
    return snapshot;
  },

  subscribe(listener: () => void) {
    ensureScopeSubscription();
    listeners.add(listener);
    void this.refresh();

    return () => {
      listeners.delete(listener);
    };
  },

  async refresh() {
    ensureScopeSubscription();
    const nextScopeKey = inspectionRepository.getStorageScopeKey();
    const queue = await syncQueue.getDiagnostics();
    updateSnapshot((current) => ({
      ...current,
      scopeKey: nextScopeKey,
      queue,
      lastUpdatedAt: queue.generatedAt,
    }));
  },

  noteWakeUp(source: string) {
    pushEvent({ level: 'info', type: 'wake-up', message: `Wake-up triggered by ${source}.` });
  },

  markPaused(reason: string) {
    const at = Date.now();
    updateSnapshot((current) => ({
      ...current,
      state: 'paused',
      pauseReason: reason,
      lastUpdatedAt: at,
    }));
    pushEvent({ level: 'info', type: 'paused', message: `Sync paused: ${reason}.` }, at);
  },

  markBusy(reason: string) {
    const at = Date.now();
    updateSnapshot((current) => ({
      ...current,
      state: 'blocked',
      pauseReason: reason,
      lastUpdatedAt: at,
    }));
    pushEvent({ level: 'info', type: 'busy', message: `Sync blocked: ${reason}.` }, at);
  },

  markCycleStarted(workerId: string) {
    const at = Date.now();
    updateSnapshot((current) => ({
      ...current,
      state: 'running',
      pauseReason: null,
      lastCycleStartedAt: at,
      lastUpdatedAt: at,
    }));
    pushEvent({ level: 'info', type: 'cycle-started', message: `Sync cycle started with worker ${workerId}.` }, at);
  },

  markCycleCompleted() {
    const at = Date.now();
    updateSnapshot((current) => ({
      ...current,
      state: 'idle',
      pauseReason: null,
      lastCycleCompletedAt: at,
      lastUpdatedAt: at,
    }));
    pushEvent({ level: 'info', type: 'cycle-completed', message: 'Sync cycle completed.' }, at);
  },

  markLeaseAcquired(workerId: string) {
    pushEvent({ level: 'info', type: 'lease-acquired', message: `Worker lease acquired by ${workerId}.` });
  },

  markLeaseUnavailable(workerId: string) {
    const at = Date.now();
    updateSnapshot((current) => ({
      ...current,
      state: 'blocked',
      pauseReason: 'lease-unavailable',
      lastUpdatedAt: at,
    }));
    pushEvent({ level: 'info', type: 'lease-unavailable', message: `Worker ${workerId} could not acquire the lease.` }, at);
  },

  markLeaseLost(workerId: string) {
    const at = Date.now();
    updateSnapshot((current) => ({
      ...current,
      state: 'blocked',
      pauseReason: 'lease-lost',
      lastUpdatedAt: at,
    }));
    pushEvent({ level: 'error', type: 'lease-lost', message: `Worker ${workerId} lost the lease during processing.` }, at);
  },

  markInspectionClaimed(entry: SyncQueueEntry) {
    pushEvent({
      level: 'info',
      type: 'inspection-claimed',
      message: `Inspection ${entry.inspectionId} was claimed for upload.`,
      inspectionId: entry.inspectionId,
    });
  },

  markInspectionDeleted(inspectionId: string) {
    pushEvent({
      level: 'info',
      type: 'inspection-deleted',
      message: `Orphaned queue entry ${inspectionId} was deleted.`,
      inspectionId,
    });
  },

  markInspectionSucceeded(inspectionId: string) {
    const at = Date.now();
    updateSnapshot((current) => ({
      ...current,
      lastSuccessfulSyncAt: at,
      lastError: null,
      lastUpdatedAt: at,
    }));
    pushEvent({
      level: 'info',
      type: 'inspection-succeeded',
      message: `Inspection ${inspectionId} uploaded successfully.`,
      inspectionId,
    }, at);
  },

  markInspectionFailed(entry: SyncQueueEntry, errorMessage: string) {
    const at = Date.now();
    updateSnapshot((current) => ({
      ...current,
      lastFailedSyncAt: at,
      lastError: errorMessage,
      lastUpdatedAt: at,
    }));
    pushEvent({
      level: entry.status === 'dead-letter' ? 'error' : 'info',
      type: entry.status === 'dead-letter' ? 'inspection-dead-lettered' : 'inspection-failed',
      message:
        entry.status === 'dead-letter'
          ? `Inspection ${entry.inspectionId} moved to dead-letter: ${errorMessage}.`
          : `Inspection ${entry.inspectionId} failed and will retry: ${errorMessage}.`,
      inspectionId: entry.inspectionId,
    }, at);
  },
};

export const useSyncMonitor = () => {
  const [current, setCurrent] = useState(syncMonitor.getSnapshot());

  useEffect(() => syncMonitor.subscribe(() => setCurrent(syncMonitor.getSnapshot())), []);

  return current;
};
