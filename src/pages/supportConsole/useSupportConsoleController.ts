import { useCallback, useEffect, useMemo, useState } from 'react';
import type { SelectProps } from '@cloudscape-design/components';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { inspectionApplicationService } from '../../application/inspectionApplicationService';
import { clearFontPreference, clearThemePreference, setSelectedTenantId } from '../../appState';
import { getUserId, hasPermission, isLoggedInAdmin } from '../../auth';
import { TENANTS } from '../../config';
import { useLocalization } from '../../LocalizationContext';
import { useOfflineObservability } from '../../offlineObservability';
import { inspectionRepository } from '../../repositories/inspectionRepository';
import { syncMonitor, useSyncMonitor } from '../../syncMonitor';
import { useTenantBootstrap } from '../../TenantBootstrapContext';
import { clearCachedTenantBootstrapConfig } from '../../tenantBootstrap';
import { promoteTenantConfigArtifact, rollbackTenantConfigArtifact } from '../../tenantConfigGovernance';
import { type InspectionSession } from '../../types';
import type { SyncQueueEntry } from '../../domain/syncQueue';
import type { FlashMessage } from './SupportConsoleSections';

export const useSupportConsoleController = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { labels } = useLocalization();
  const { config, diagnostics, refreshConfig } = useTenantBootstrap();
  const syncSnapshot = useSyncMonitor();
  const observability = useOfflineObservability(config.tenantId);
  const [tenantSelection, setTenantSelection] = useState<SelectProps.Option | null>(null);
  const [inspections, setInspections] = useState<InspectionSession[]>([]);
  const [currentInspectionId, setCurrentInspectionId] = useState<string | null>(searchParams.get('inspectionId'));
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [selectedFormDataCount, setSelectedFormDataCount] = useState<number>(0);
  const [flashMessage, setFlashMessage] = useState<FlashMessage | null>(null);

  const tenantOptions = useMemo<SelectProps.Option[]>(
    () => TENANTS.map((tenant) => ({ label: tenant.displayName, value: tenant.tenantId })),
    []
  );
  const canManageSupport = isLoggedInAdmin() && hasPermission('customization.admin');
  const canSelectTenant = isLoggedInAdmin() && hasPermission('tenant.select');
  const scopeKey = `${config.tenantId}:${getUserId() ?? 'anonymous'}`;

  useEffect(() => {
    const selectedTenant = tenantOptions.find((option) => option.value === config.tenantId) ?? tenantOptions[0] ?? null;
    setTenantSelection(selectedTenant);
  }, [config.tenantId, tenantOptions]);

  const loadInspectionState = useCallback(async () => {
    const [nextInspections, currentSession] = await Promise.all([
      inspectionRepository.loadAll(),
      inspectionRepository.loadCurrent(),
    ]);

    setInspections(nextInspections);
    setCurrentSessionId(currentSession?.id ?? null);
    setCurrentInspectionId((current) => {
      const stillExists = current ? nextInspections.some((inspection) => inspection.id === current) : false;
      if (stillExists) {
        return current;
      }

      const requested = searchParams.get('inspectionId');
      if (requested && nextInspections.some((inspection) => inspection.id === requested)) {
        return requested;
      }

      return currentSession?.id ?? nextInspections[0]?.id ?? null;
    });
  }, [searchParams]);

  useEffect(() => {
    void loadInspectionState();
    const unsubscribe = inspectionRepository.subscribe(() => {
      void loadInspectionState();
    });
    return unsubscribe;
  }, [loadInspectionState, scopeKey]);

  useEffect(() => {
    void syncMonitor.refresh();
  }, [scopeKey]);

  useEffect(() => {
    if (!currentInspectionId) {
      setSelectedFormDataCount(0);
      return;
    }

    let cancelled = false;
    void (async () => {
      const inspection = inspections.find((item) => item.id === currentInspectionId);
      if (!inspection) {
        if (!cancelled) {
          setSelectedFormDataCount(0);
        }
        return;
      }

      if (!cancelled) {
        setSelectedFormDataCount(await inspectionApplicationService.getFormDataFieldCount(inspection.id, inspection));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [currentInspectionId, inspections]);

  useEffect(() => {
    if (currentInspectionId) {
      setSearchParams({ inspectionId: currentInspectionId }, { replace: true });
      return;
    }

    setSearchParams({}, { replace: true });
  }, [currentInspectionId, setSearchParams]);

  const queueEntries = syncSnapshot.queue.entries;
  const governance = diagnostics.governance;
  const queueEntriesById = useMemo(() => new Map(queueEntries.map((entry) => [entry.inspectionId, entry])), [queueEntries]);
  const selectedInspection = useMemo(
    () => inspections.find((inspection) => inspection.id === currentInspectionId) ?? null,
    [currentInspectionId, inspections]
  );
  const selectedQueueEntry = selectedInspection ? queueEntriesById.get(selectedInspection.id) ?? null : null;
  const recoveryCandidates = useMemo(
    () => inspectionApplicationService.getRecoveryCandidates(inspections, queueEntries),
    [inspections, queueEntries]
  );

  const formatTimestamp = (value: number | string | null | undefined) =>
    !value ? labels.common.notProvided : new Date(value).toLocaleString();
  const formatDuration = (value: number | null | undefined) => {
    if (value === null || value === undefined) {
      return labels.common.notProvided;
    }
    const minutes = Math.floor(value / 60_000);
    const seconds = Math.floor((value % 60_000) / 1000);
    return minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
  };
  const formatPercent = (value: number | null | undefined) =>
    value === null || value === undefined ? labels.common.notProvided : `${Math.round(value * 100)}%`;
  const formatBytes = (value: number | null | undefined) => {
    if (value === null || value === undefined) {
      return labels.common.notProvided;
    }
    if (value < 1024 * 1024) {
      return `${Math.round(value / 1024)} KB`;
    }
    return `${(value / (1024 * 1024)).toFixed(1)} MB`;
  };

  const setSuccess = useCallback((message: string) => {
    setFlashMessage({ type: 'success', message });
  }, []);
  const setFailure = useCallback(
    (error: unknown) => {
      const reason = error instanceof Error ? error.message : labels.support.alerts.actionFailed;
      setFlashMessage({ type: 'error', message: `${labels.support.alerts.actionFailed} ${reason}`.trim() });
    },
    [labels.support.alerts.actionFailed]
  );

  const refreshSupportState = useCallback(async () => {
    await Promise.all([loadInspectionState(), syncMonitor.refresh()]);
  }, [loadInspectionState]);

  const wrapAction = useCallback(
    async (action: () => Promise<void>) => {
      try {
        await action();
      } catch (error) {
        setFailure(error);
      }
    },
    [setFailure]
  );

  const handleApplyTenant = () =>
    wrapAction(async () => {
      const nextTenantId = tenantSelection?.value;
      if (!nextTenantId || nextTenantId === config.tenantId) {
        return;
      }

      setSelectedTenantId(nextTenantId);
      clearThemePreference();
      clearFontPreference();
      await refreshConfig(nextTenantId);
      setSuccess(labels.support.alerts.tenantUpdated);
    });

  const handleClearCache = () =>
    wrapAction(async () => {
      clearCachedTenantBootstrapConfig(config.tenantId);
      await refreshConfig(config.tenantId);
      setSuccess(labels.support.alerts.cacheCleared);
    });

  const handleRefreshConfig = () =>
    wrapAction(async () => {
      await refreshConfig(config.tenantId);
      setSuccess(labels.support.alerts.tenantUpdated);
    });

  const handlePromoteConfig = () =>
    wrapAction(async () => {
      promoteTenantConfigArtifact({
        tenantId: config.tenantId,
        environmentId: governance.environmentId,
        actorId: getUserId() ?? 'anonymous-admin',
        config,
      });
      await refreshConfig(config.tenantId);
      setSuccess(labels.support.alerts.configPromoted);
    });

  const handleRollbackConfig = () =>
    wrapAction(async () => {
      rollbackTenantConfigArtifact({
        tenantId: config.tenantId,
        environmentId: governance.environmentId,
        actorId: getUserId() ?? 'anonymous-admin',
      });
      await refreshConfig(config.tenantId);
      setSuccess(labels.support.alerts.configRolledBack);
    });

  const handleRetryEntry = (entry: SyncQueueEntry) =>
    wrapAction(async () => {
      await inspectionApplicationService.retryQueueEntry(entry);
      await refreshSupportState();
      setSuccess(labels.support.alerts.queueRetried);
    });

  const handleMoveToDeadLetter = (entry: SyncQueueEntry) =>
    wrapAction(async () => {
      await inspectionApplicationService.moveQueueEntryToDeadLetter(entry, 'Moved to dead-letter from support console');
      await refreshSupportState();
      setSuccess(labels.support.alerts.movedToDeadLetter);
    });

  const handleRecoverUpload = (inspection: InspectionSession) =>
    wrapAction(async () => {
      const entry = queueEntriesById.get(inspection.id);
      await inspectionApplicationService.recoverUpload(inspection, entry);
      await refreshSupportState();
      setCurrentInspectionId(inspection.id);
      setSuccess(labels.support.alerts.uploadRecovered);
    });

  const handleOpenDebug = (inspection: InspectionSession) => {
    navigate(`/debug-inspection/${inspection.id}`, {
      state: {
        inspectionScope: {
          tenantId: inspection.tenantId,
          userId: inspection.userId,
        },
      },
    });
  };

  const handleOpenForm = async (inspection: InspectionSession) => {
    await inspectionApplicationService.activateInspectionSession(inspection);
    navigate(`/fill-form/${inspection.id}`);
  };

  const queueSummaryItems = [
    { label: labels.debugInspection.syncStateLabel, value: labels.debugInspection.syncStatusLabels[syncSnapshot.state] },
    { label: labels.debugInspection.syncMetrics.total, value: String(syncSnapshot.queue.metrics.totalCount) },
    { label: labels.debugInspection.syncMetrics.failed, value: String(syncSnapshot.queue.metrics.failedCount) },
    { label: labels.debugInspection.syncMetrics.conflict, value: String(syncSnapshot.queue.metrics.conflictCount) },
    { label: labels.debugInspection.syncMetrics.deadLetter, value: String(syncSnapshot.queue.metrics.deadLetterCount) },
    { label: labels.debugInspection.syncWorkerLeaseLabel, value: syncSnapshot.queue.workerLease?.ownerId ?? labels.common.notProvided },
    { label: labels.debugInspection.syncLastErrorLabel, value: syncSnapshot.lastError ?? labels.common.notProvided },
  ];

  const observabilitySummaryItems = [
    { label: labels.support.observabilitySection.queueAge, value: formatDuration(observability.queue.current.oldestEntryAgeMs) },
    { label: labels.support.observabilitySection.retryRate, value: formatPercent(observability.queue.retryRate) },
    { label: labels.support.observabilitySection.retryScheduled, value: String(observability.queue.retryScheduledCount) },
    { label: labels.support.observabilitySection.processedAttempts, value: String(observability.queue.processedAttemptCount) },
    { label: labels.support.observabilitySection.deadLetterCurrent, value: String(observability.queue.current.deadLetterCount) },
    { label: labels.support.observabilitySection.deadLetterTotal, value: String(observability.queue.deadLetteredTotal) },
    { label: labels.support.observabilitySection.bootstrapFailures, value: String(observability.bootstrap.failureCount) },
    { label: labels.support.observabilitySection.bootstrapConsecutiveFailures, value: String(observability.bootstrap.consecutiveFailureCount) },
    { label: labels.support.observabilitySection.bootstrapLastError, value: observability.bootstrap.lastError ?? labels.common.notProvided },
    { label: labels.support.observabilitySection.storagePressure, value: observability.storage.pressure },
    {
      label: labels.support.observabilitySection.storageUsage,
      value:
        observability.storage.usageBytes !== null && observability.storage.quotaBytes !== null
          ? `${formatBytes(observability.storage.usageBytes)} / ${formatBytes(observability.storage.quotaBytes)}`
          : labels.common.notProvided,
    },
    { label: labels.support.observabilitySection.storageQuotaFailures, value: String(observability.storage.quotaFailureCount) },
    { label: labels.support.observabilitySection.lastMeasured, value: formatTimestamp(observability.storage.lastMeasuredAt) },
  ];

  return {
    labels,
    config,
    diagnostics,
    governance,
    observabilitySummaryItems,
    queueSummaryItems,
    canManageSupport,
    canSelectTenant,
    tenantSelection,
    tenantOptions,
    setTenantSelection,
    inspections,
    queueEntries,
    queueEntriesById,
    recoveryCandidates,
    selectedInspection,
    selectedQueueEntry,
    currentSessionId,
    selectedFormDataCount,
    flashMessage,
    setFlashMessage,
    formatTimestamp,
    refreshSupportState,
    setCurrentInspectionId,
    handleApplyTenant,
    handleClearCache,
    handleRefreshConfig,
    handlePromoteConfig,
    handleRollbackConfig,
    handleRetryEntry,
    handleMoveToDeadLetter,
    handleRecoverUpload,
    handleOpenDebug,
    handleOpenForm,
  };
};
