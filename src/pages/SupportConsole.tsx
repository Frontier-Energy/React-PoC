import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react';
import { Alert, Box, Button, Container, FormField, Header, Select, SpaceBetween } from '@cloudscape-design/components';
import type { SelectProps } from '@cloudscape-design/components';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { clearFontPreference, clearThemePreference, setSelectedTenantId } from '../appState';
import { getUserId, hasPermission, isLoggedInAdmin } from '../auth';
import { TENANTS } from '../config';
import { useLocalization } from '../LocalizationContext';
import { inspectionRepository } from '../repositories/inspectionRepository';
import { syncMonitor, useSyncMonitor } from '../syncMonitor';
import { syncQueue } from '../syncQueue';
import { useTenantBootstrap } from '../TenantBootstrapContext';
import { clearCachedTenantBootstrapConfig } from '../tenantBootstrap';
import { type InspectionSession, UploadStatus } from '../types';
import type { SyncQueueEntry } from '../domain/syncQueue';

type FlashMessage = {
  type: 'success' | 'error';
  message: string;
};

const sectionGridStyle: CSSProperties = {
  display: 'grid',
  gap: '1rem',
};

const statsGridStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
  gap: '0.75rem',
};

const cardStyle: CSSProperties = {
  border: '1px solid var(--app-flyout-border-color, #d5dbe3)',
  borderRadius: '12px',
  padding: '1rem',
  background: 'var(--app-flyout-bg-color, #fff)',
};

export function SupportConsole() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { labels } = useLocalization();
  const { config, diagnostics, refreshConfig } = useTenantBootstrap();
  const syncSnapshot = useSyncMonitor();
  const [tenantSelection, setTenantSelection] = useState<SelectProps.Option | null>(null);
  const [inspections, setInspections] = useState<InspectionSession[]>([]);
  const [currentInspectionId, setCurrentInspectionId] = useState<string | null>(searchParams.get('inspectionId'));
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [selectedFormDataCount, setSelectedFormDataCount] = useState<number>(0);
  const [flashMessage, setFlashMessage] = useState<FlashMessage | null>(null);

  const tenantOptions = useMemo<SelectProps.Option[]>(
    () =>
      TENANTS.map((tenant) => ({
        label: tenant.displayName,
        value: tenant.tenantId,
      })),
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

      const formData = await inspectionRepository.loadFormData(inspection.id, inspection);
      if (!cancelled) {
        setSelectedFormDataCount(Object.keys(formData ?? {}).length);
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
  const queueEntriesById = useMemo(
    () => new Map(queueEntries.map((entry) => [entry.inspectionId, entry])),
    [queueEntries]
  );

  const selectedInspection = useMemo(
    () => inspections.find((inspection) => inspection.id === currentInspectionId) ?? null,
    [currentInspectionId, inspections]
  );
  const selectedQueueEntry = selectedInspection ? queueEntriesById.get(selectedInspection.id) ?? null : null;

  const recoveryCandidates = useMemo(
    () =>
      inspections.filter((inspection) => {
        const entry = queueEntriesById.get(inspection.id);
        const uploadStatus = inspection.uploadStatus ?? UploadStatus.Local;
        return (
          uploadStatus === UploadStatus.Failed ||
          uploadStatus === UploadStatus.Uploading ||
          entry?.status === 'failed' ||
          entry?.status === 'dead-letter' ||
          entry?.status === 'syncing'
        );
      }),
    [inspections, queueEntriesById]
  );

  const formatTimestamp = (value: number | string | null | undefined) => {
    if (!value) {
      return labels.common.notProvided;
    }

    return new Date(value).toLocaleString();
  };

  const setSuccess = (message: string) => setFlashMessage({ type: 'success', message });
  const setFailure = (error: unknown) => {
    const reason = error instanceof Error ? error.message : labels.support.alerts.actionFailed;
    setFlashMessage({ type: 'error', message: `${labels.support.alerts.actionFailed} ${reason}`.trim() });
  };

  const refreshSupportState = useCallback(async () => {
    await Promise.all([loadInspectionState(), syncMonitor.refresh()]);
  }, [loadInspectionState]);

  const handleApplyTenant = async () => {
    const nextTenantId = tenantSelection?.value;
    if (!nextTenantId || nextTenantId === config.tenantId) {
      return;
    }

    try {
      setSelectedTenantId(nextTenantId);
      clearThemePreference();
      clearFontPreference();
      await refreshConfig(nextTenantId);
      setSuccess(labels.support.alerts.tenantUpdated);
    } catch (error) {
      setFailure(error);
    }
  };

  const handleClearCache = async () => {
    try {
      clearCachedTenantBootstrapConfig(config.tenantId);
      await refreshConfig(config.tenantId);
      setSuccess(labels.support.alerts.cacheCleared);
    } catch (error) {
      setFailure(error);
    }
  };

  const handleRefreshConfig = async () => {
    try {
      await refreshConfig(config.tenantId);
      setSuccess(labels.support.alerts.tenantUpdated);
    } catch (error) {
      setFailure(error);
    }
  };

  const handleRetryEntry = async (entry: SyncQueueEntry) => {
    try {
      await syncQueue.retry(entry);
      await refreshSupportState();
      setSuccess(labels.support.alerts.queueRetried);
    } catch (error) {
      setFailure(error);
    }
  };

  const handleMoveToDeadLetter = async (entry: SyncQueueEntry) => {
    try {
      await syncQueue.moveToDeadLetter(entry, 'Moved to dead-letter from support console');
      await refreshSupportState();
      setSuccess(labels.support.alerts.movedToDeadLetter);
    } catch (error) {
      setFailure(error);
    }
  };

  const handleRecoverUpload = async (inspection: InspectionSession) => {
    try {
      const formData = (await inspectionRepository.loadFormData(inspection.id, inspection)) ?? {};
      const recoveredInspection: InspectionSession = {
        ...inspection,
        uploadStatus: UploadStatus.Local,
      };
      await inspectionRepository.update(recoveredInspection);
      const entry = queueEntriesById.get(inspection.id);
      if (entry) {
        await syncQueue.retry(entry);
      } else {
        await syncQueue.enqueue(recoveredInspection, formData);
      }

      const currentSession = await inspectionRepository.loadCurrent(inspection);
      if (currentSession?.id === inspection.id) {
        await inspectionRepository.saveCurrent(recoveredInspection);
      }

      window.dispatchEvent(new CustomEvent('inspection-status-changed', { detail: recoveredInspection }));
      await refreshSupportState();
      setCurrentInspectionId(inspection.id);
      setSuccess(labels.support.alerts.uploadRecovered);
    } catch (error) {
      setFailure(error);
    }
  };

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
    await inspectionRepository.saveCurrent(inspection);
    navigate(`/fill-form/${inspection.id}`);
  };

  const supportSummaryItems = [
    { label: labels.debugInspection.syncStateLabel, value: labels.debugInspection.syncStatusLabels[syncSnapshot.state] },
    { label: labels.debugInspection.syncMetrics.total, value: String(syncSnapshot.queue.metrics.totalCount) },
    { label: labels.debugInspection.syncMetrics.failed, value: String(syncSnapshot.queue.metrics.failedCount) },
    { label: labels.debugInspection.syncMetrics.deadLetter, value: String(syncSnapshot.queue.metrics.deadLetterCount) },
    { label: labels.debugInspection.syncWorkerLeaseLabel, value: syncSnapshot.queue.workerLease?.ownerId ?? labels.common.notProvided },
    { label: labels.debugInspection.syncLastErrorLabel, value: syncSnapshot.lastError ?? labels.common.notProvided },
  ];

  return (
    <SpaceBetween size="l">
      <Header variant="h1">{labels.support.title}</Header>
      <Box color="text-body-secondary">{labels.support.intro}</Box>

      {!canManageSupport ? (
        <Alert type="error">{labels.support.alerts.actionFailed}</Alert>
      ) : null}

      {flashMessage ? (
        <Alert type={flashMessage.type} dismissible onDismiss={() => setFlashMessage(null)}>
          {flashMessage.message}
        </Alert>
      ) : null}

      <Container>
        <SpaceBetween size="m">
          <Header variant="h2">{labels.support.tenantSection.title}</Header>
          <Box color="text-body-secondary">{labels.support.tenantSection.description}</Box>
          {canSelectTenant ? (
            <div style={{ ...statsGridStyle, alignItems: 'end' }}>
              <FormField label={labels.support.tenantSection.tenantLabel}>
                <Select
                  selectedOption={tenantSelection}
                  onChange={({ detail }) => setTenantSelection(detail.selectedOption)}
                  options={tenantOptions}
                />
              </FormField>
              <Button onClick={() => void handleApplyTenant()}>{labels.support.tenantSection.applyTenant}</Button>
              <Button onClick={() => void handleRefreshConfig()}>{labels.support.tenantSection.refreshConfig}</Button>
              <Button onClick={() => void handleClearCache()}>{labels.support.tenantSection.clearCache}</Button>
            </div>
          ) : null}
          <Header variant="h3">{labels.support.tenantSection.activeConfigHeader}</Header>
          <div style={statsGridStyle}>
            <div style={cardStyle}>
              <strong>{labels.support.tenantSection.bootstrapStatus}</strong>
              <Box>{labels.bootstrap.status[diagnostics.status]}</Box>
            </div>
            <div style={cardStyle}>
              <strong>{labels.support.tenantSection.bootstrapSource}</strong>
              <Box>{labels.bootstrap.source[diagnostics.source]}</Box>
            </div>
            <div style={cardStyle}>
              <strong>{labels.support.tenantSection.enabledForms}</strong>
              <Box>{config.enabledForms.map((formType) => labels.formTypes[formType]).join(', ') || labels.common.notProvided}</Box>
            </div>
            <div style={cardStyle}>
              <strong>{labels.support.tenantSection.loginRequired}</strong>
              <Box>{config.loginRequired ? labels.common.yes : labels.common.no}</Box>
            </div>
            <div style={cardStyle}>
              <strong>{labels.support.tenantSection.leftFlyout}</strong>
              <Box>{config.showLeftFlyout ? labels.common.yes : labels.common.no}</Box>
            </div>
            <div style={cardStyle}>
              <strong>{labels.support.tenantSection.rightFlyout}</strong>
              <Box>{config.showRightFlyout ? labels.common.yes : labels.common.no}</Box>
            </div>
            <div style={cardStyle}>
              <strong>{labels.support.tenantSection.statsButton}</strong>
              <Box>{config.showInspectionStatsButton ? labels.common.yes : labels.common.no}</Box>
            </div>
            <div style={cardStyle}>
              <strong>{labels.bootstrap.lastAttemptLabel}</strong>
              <Box>{formatTimestamp(diagnostics.lastAttemptAt)}</Box>
            </div>
          </div>
        </SpaceBetween>
      </Container>

      <Container>
        <SpaceBetween size="m">
          <Header
            variant="h2"
            actions={<Button onClick={() => void refreshSupportState()}>{labels.support.queueSection.refresh}</Button>}
          >
            {labels.support.queueSection.title}
          </Header>
          <Box color="text-body-secondary">{labels.support.queueSection.description}</Box>
          <div style={statsGridStyle}>
            {supportSummaryItems.map((item) => (
              <div key={item.label} style={cardStyle}>
                <strong>{item.label}</strong>
                <Box>{item.value}</Box>
              </div>
            ))}
          </div>
          <div style={sectionGridStyle}>
            {queueEntries.length === 0 ? (
              <Box color="text-body-secondary">{labels.support.queueSection.empty}</Box>
            ) : (
              queueEntries.map((entry) => {
                const inspection = inspections.find((item) => item.id === entry.inspectionId);
                return (
                  <div key={entry.inspectionId} style={cardStyle}>
                    <SpaceBetween size="xs">
                      <Header variant="h3">{inspection?.name || entry.inspectionId}</Header>
                      <Box>{labels.support.queueSection.status}: {entry.status}</Box>
                      <Box>{labels.support.queueSection.attempts}: {entry.attemptCount}</Box>
                      <Box>{labels.support.queueSection.nextAttempt}: {formatTimestamp(entry.nextAttemptAt)}</Box>
                      <Box>{labels.support.queueSection.lastError}: {entry.lastError || labels.common.notProvided}</Box>
                      <SpaceBetween direction="horizontal" size="xs">
                        <Button onClick={() => setCurrentInspectionId(entry.inspectionId)}>
                          {labels.support.queueSection.inspect}
                        </Button>
                        <Button onClick={() => void handleRetryEntry(entry)}>
                          {entry.status === 'dead-letter'
                            ? labels.debugInspection.syncInspection.requeueDeadLetter
                            : labels.debugInspection.syncInspection.retryNow}
                        </Button>
                        {entry.status !== 'dead-letter' ? (
                          <Button onClick={() => void handleMoveToDeadLetter(entry)}>
                            {labels.debugInspection.syncInspection.moveToDeadLetter}
                          </Button>
                        ) : null}
                      </SpaceBetween>
                    </SpaceBetween>
                  </div>
                );
              })
            )}
          </div>
        </SpaceBetween>
      </Container>

      <Container>
        <SpaceBetween size="m">
          <Header variant="h2">{labels.support.recoverySection.title}</Header>
          <Box color="text-body-secondary">{labels.support.recoverySection.description}</Box>
          <div style={sectionGridStyle}>
            {recoveryCandidates.length === 0 ? (
              <Box color="text-body-secondary">{labels.support.recoverySection.empty}</Box>
            ) : (
              recoveryCandidates.map((inspection) => {
                const queueEntry = queueEntriesById.get(inspection.id);
                return (
                  <div key={inspection.id} style={cardStyle}>
                    <SpaceBetween size="xs">
                      <Header variant="h3">{inspection.name || labels.common.unnamed}</Header>
                      <Box>{labels.myInspections.table.status}: {labels.uploadStatus[inspection.uploadStatus ?? UploadStatus.Local]}</Box>
                      <Box>{labels.support.recoverySection.issue}: {queueEntry?.status ?? labels.common.notProvided}</Box>
                      <SpaceBetween direction="horizontal" size="xs">
                        <Button onClick={() => void handleRecoverUpload(inspection)}>
                          {labels.support.recoverySection.recover}
                        </Button>
                        <Button onClick={() => void handleOpenForm(inspection)}>
                          {labels.support.recoverySection.resume}
                        </Button>
                        <Button
                          onClick={() => {
                            setCurrentInspectionId(inspection.id);
                            handleOpenDebug(inspection);
                          }}
                        >
                          {labels.support.recoverySection.investigate}
                        </Button>
                      </SpaceBetween>
                    </SpaceBetween>
                  </div>
                );
              })
            )}
          </div>
        </SpaceBetween>
      </Container>

      <Container>
        <SpaceBetween size="m">
          <Header variant="h2">{labels.support.sessionSection.title}</Header>
          <Box color="text-body-secondary">{labels.support.sessionSection.description}</Box>
          {selectedInspection ? (
            <>
              <div style={statsGridStyle}>
                <div style={cardStyle}>
                  <strong>{labels.support.sessionSection.currentSession}</strong>
                  <Box>{currentSessionId ?? labels.common.notProvided}</Box>
                </div>
                <div style={cardStyle}>
                  <strong>{labels.support.sessionSection.queueStatus}</strong>
                  <Box>{selectedQueueEntry?.status ?? labels.common.notProvided}</Box>
                </div>
                <div style={cardStyle}>
                  <strong>{labels.support.sessionSection.formDataFields}</strong>
                  <Box>{selectedFormDataCount}</Box>
                </div>
                <div style={cardStyle}>
                  <strong>{labels.support.sessionSection.tenant}</strong>
                  <Box>{selectedInspection.tenantId}</Box>
                </div>
                <div style={cardStyle}>
                  <strong>{labels.support.sessionSection.user}</strong>
                  <Box>{selectedInspection.userId ?? labels.common.notProvided}</Box>
                </div>
                <div style={cardStyle}>
                  <strong>{labels.myInspections.table.status}</strong>
                  <Box>{labels.uploadStatus[selectedInspection.uploadStatus ?? UploadStatus.Local]}</Box>
                </div>
              </div>
              <SpaceBetween direction="horizontal" size="xs">
                <Button onClick={() => handleOpenDebug(selectedInspection)}>
                  {labels.support.sessionSection.openDebug}
                </Button>
                <Button onClick={() => void handleOpenForm(selectedInspection)}>
                  {labels.support.sessionSection.openForm}
                </Button>
              </SpaceBetween>
            </>
          ) : (
            <Box color="text-body-secondary">{labels.support.sessionSection.noSelection}</Box>
          )}
        </SpaceBetween>
      </Container>
    </SpaceBetween>
  );
}
