import { subscribeToInspectionStatusChanged } from '../application/inspectionEvents';
import { platform } from '../platform';
import { inspectionRepository } from '../repositories/inspectionRepository';
import { syncMonitor } from '../syncMonitor';
import { syncQueue } from '../syncQueue';
import { processNextQueuedInspection } from './inspectionUploadProcessor';

export type BackgroundUploadConnectivityStatus = 'checking' | 'online' | 'offline';

const SYNC_CHECK_INTERVAL_MS = 15_000;

export interface BackgroundUploadRuntime {
  start: () => void;
  stop: () => Promise<void>;
  setConnectivityStatus: (status: BackgroundUploadConnectivityStatus) => void;
}

export const createBackgroundUploadRuntime = (): BackgroundUploadRuntime => {
  let connectivityStatus: BackgroundUploadConnectivityStatus = 'checking';
  let syncInProgress = false;
  let started = false;
  const workerId = syncQueue.createWorkerId();
  let intervalId: number | null = null;
  let unsubscribeQueue: (() => void) | null = null;
  let unsubscribeInspectionEvents: (() => void) | null = null;
  const activeCycles = new Set<Promise<void>>();

  const getConnectivityStatus = () => connectivityStatus;

  const runSyncCycle = async (source: string) => {
    syncMonitor.noteWakeUp(source);

    if (getConnectivityStatus() !== 'online' || syncInProgress) {
      if (getConnectivityStatus() !== 'online') {
        syncMonitor.markPaused('offline');
      } else {
        syncMonitor.markBusy('cycle already running');
      }
      return;
    }

    syncInProgress = true;
    syncMonitor.markCycleStarted(workerId);

    try {
      await syncQueue.ensureQueuedForPendingInspections(await inspectionRepository.loadAll());
      await syncMonitor.refresh();
      if (!(await syncQueue.tryAcquireWorkerLease(workerId))) {
        syncMonitor.markLeaseUnavailable(workerId);
        return;
      }

      syncMonitor.markLeaseAcquired(workerId);

      while (getConnectivityStatus() === 'online') {
        if (!(await syncQueue.renewWorkerLease(workerId))) {
          syncMonitor.markLeaseLost(workerId);
          break;
        }

        const processed = await processNextQueuedInspection(workerId);
        if (!processed) {
          break;
        }
      }
    } finally {
      await syncQueue.releaseWorkerLease(workerId);
      syncInProgress = false;
      syncMonitor.markCycleCompleted();
      await syncMonitor.refresh();
    }
  };

  const scheduleSync = (source: string) => {
    const cycle = runSyncCycle(source);
    activeCycles.add(cycle);
    void cycle.finally(() => {
      activeCycles.delete(cycle);
    });
  };

  const handleInspectionStatusChanged = () => {
    scheduleSync('inspection status change');
  };

  return {
    start: () => {
      if (started) {
        return;
      }

      started = true;
      intervalId = platform.runtime.setInterval(() => scheduleSync('interval'), SYNC_CHECK_INTERVAL_MS);
      unsubscribeQueue = syncQueue.subscribe(() => scheduleSync('queue event'));
      unsubscribeInspectionEvents = subscribeToInspectionStatusChanged(handleInspectionStatusChanged);
      scheduleSync('runtime start');
    },
    stop: async () => {
      if (!started) {
        return;
      }

      started = false;
      if (intervalId !== null) {
        platform.runtime.clearInterval(intervalId);
        intervalId = null;
      }
      unsubscribeQueue?.();
      unsubscribeQueue = null;
      unsubscribeInspectionEvents?.();
      unsubscribeInspectionEvents = null;
      await Promise.allSettled(Array.from(activeCycles));
      await syncQueue.releaseWorkerLease(workerId);
    },
    setConnectivityStatus: (status: BackgroundUploadConnectivityStatus) => {
      connectivityStatus = status;
      if (started && status === 'online') {
        scheduleSync('connectivity restored');
      }
    },
  };
};
