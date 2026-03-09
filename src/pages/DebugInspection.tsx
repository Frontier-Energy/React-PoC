import { useCallback, useMemo, useEffect, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { Box, Button, Container, Header, Modal, SpaceBetween } from '@cloudscape-design/components';
import { fetchFormSchema } from '../apiContent';
import type { SyncQueueEntry } from '../domain/syncQueue';
import type { FileReference, FormSchema } from '../types';
import { syncMonitor, useSyncMonitor } from '../syncMonitor';
import { syncQueue } from '../syncQueue';
import { getFile } from '../utils/fileStorage';
import { getFileReferences } from '../utils/formDataUtils';
import { useLocalization } from '../LocalizationContext';
import { inspectionRepository } from '../repositories/inspectionRepository';

export function DebugInspection() {
  const { sessionId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { labels } = useLocalization();
  const syncSnapshot = useSyncMonitor();
  const [formSchema, setFormSchema] = useState<FormSchema | null>(null);
  const [schemaError, setSchemaError] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewName, setPreviewName] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [queueEntry, setQueueEntry] = useState<SyncQueueEntry | null>(null);
  const inspectionScopeState = useMemo(() => (
    location.state &&
    typeof location.state === 'object' &&
    'inspectionScope' in location.state &&
    location.state.inspectionScope &&
    typeof location.state.inspectionScope === 'object'
      ? (location.state.inspectionScope as { tenantId: string; userId?: string })
      : undefined
  ), [location.state]);
  const inspectionScopeTenantId = inspectionScopeState?.tenantId;
  const inspectionScopeUserId = inspectionScopeState?.userId;

  const [inspectionData, setInspectionData] = useState<{
    error?: string;
    inspection?: Awaited<ReturnType<typeof inspectionRepository.loadById>> | null;
    formData?: Awaited<ReturnType<typeof inspectionRepository.loadFormData>> | null;
  }>({});

  const loadQueueEntry = useCallback(async () => {
    if (!sessionId) {
      setQueueEntry(null);
      return;
    }

    const scope = inspectionScopeTenantId
      ? { tenantId: inspectionScopeTenantId, userId: inspectionScopeUserId }
      : inspectionData.inspection
        ? { tenantId: inspectionData.inspection.tenantId, userId: inspectionData.inspection.userId }
        : undefined;

    setQueueEntry(await syncQueue.load(sessionId, scope));
  }, [inspectionData.inspection, inspectionScopeTenantId, inspectionScopeUserId, sessionId]);

  useEffect(() => {
    let cancelled = false;

    const loadInspectionData = async () => {
      const inspectionScope = inspectionScopeTenantId
        ? { tenantId: inspectionScopeTenantId, userId: inspectionScopeUserId }
        : undefined;

      if (!sessionId) {
        if (!cancelled) {
          setInspectionData({ error: labels.debugInspection.errors.missingInspectionId });
        }
        return;
      }

      const inspection = await inspectionRepository.loadById(sessionId, inspectionScope);
      if (!inspection) {
        if (!cancelled) {
          setInspectionData({ inspection: null, formData: null });
        }
        return;
      }

      const formData = await inspectionRepository.loadFormData(sessionId, inspection);
      if (!cancelled) {
        setInspectionData({ inspection, formData });
      }
    };

    void loadInspectionData();

    return () => {
      cancelled = true;
    };
  }, [inspectionScopeTenantId, inspectionScopeUserId, labels.debugInspection.errors.missingInspectionId, sessionId]);

  useEffect(() => {
    void loadQueueEntry();
    const unsubscribe = syncQueue.subscribe(() => {
      void loadQueueEntry();
    });

    return unsubscribe;
  }, [loadQueueEntry]);

  useEffect(() => {
    const loadSchema = async () => {
      if (!inspectionData.inspection) {
        return;
      }
      try {
        const schema = await fetchFormSchema(inspectionData.inspection.formType);
        setFormSchema(schema as FormSchema);
        setSchemaError(null);
      } catch (error) {
        setSchemaError(labels.debugInspection.schemaLoadError);
      }
    };
    loadSchema();
  }, [inspectionData.inspection, labels]);

  const fileItems = useMemo(() => {
    if (!formSchema || !inspectionData.formData) {
      return [];
    }
    const data = inspectionData.formData;
    const fileFields = formSchema.sections
      .flatMap((section) => section.fields)
      .filter((field) => field.type === 'file' || field.type === 'signature');

    return fileFields
      .map((field) => {
        const key = field.externalID || field.id;
        const files = getFileReferences(data[key]);
        return {
          fieldId: field.id,
          label: field.label,
          type: field.type,
          files,
        };
      })
      .filter((item) => item.files.length > 0);
  }, [formSchema, inspectionData.formData]);

  const formatFileSize = (size: number) => {
    if (size < 1024) {
      return `${size} B`;
    }
    if (size < 1024 * 1024) {
      return `${(size / 1024).toFixed(1)} KB`;
    }
    if (size < 1024 * 1024 * 1024) {
      return `${(size / (1024 * 1024)).toFixed(1)} MB`;
    }
    return `${(size / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  };

  const isPreviewableImage = (file: FileReference) => file.type.startsWith('image/');

  const handleDownload = async (file: FileReference) => {
    const storedFile = await getFile(file.id);
    if (!storedFile) {
      return;
    }
    const url = URL.createObjectURL(storedFile.blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = file.name;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const handlePreview = async (file: FileReference) => {
    if (!isPreviewableImage(file)) {
      return;
    }
    const storedFile = await getFile(file.id);
    if (!storedFile) {
      return;
    }
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }
    const url = URL.createObjectURL(storedFile.blob);
    setPreviewUrl(url);
    setPreviewName(file.name);
    setPreviewOpen(true);
  };

  const closePreview = () => {
    setPreviewOpen(false);
    setPreviewName(null);
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
    }
  };

  const formatTimestamp = (value: number | null | undefined) => {
    if (!value) {
      return labels.common.notProvided;
    }

    return new Date(value).toLocaleString();
  };

  const formatDuration = (value: number | null | undefined) => {
    if (value == null) {
      return labels.common.notProvided;
    }

    if (value < 1000) {
      return `${value} ms`;
    }

    if (value < 60_000) {
      return `${(value / 1000).toFixed(1)} s`;
    }

    return `${(value / 60_000).toFixed(1)} min`;
  };

  const handleRefreshSyncDiagnostics = () => {
    void syncMonitor.refresh();
    void loadQueueEntry();
  };

  const handleRetryQueueEntry = () => {
    if (!queueEntry) {
      return;
    }

    void (async () => {
      await syncQueue.retry(queueEntry);
      await syncMonitor.refresh();
      await loadQueueEntry();
    })();
  };

  const handleMoveToDeadLetter = () => {
    if (!queueEntry) {
      return;
    }

    void (async () => {
      await syncQueue.moveToDeadLetter(queueEntry, 'Moved to dead-letter by operator');
      await syncMonitor.refresh();
      await loadQueueEntry();
    })();
  };

  return (
    <SpaceBetween size="l">
      <Header
        variant="h1"
        actions={
          <Button variant="link" onClick={() => navigate('/my-inspections')}>
            {labels.debugInspection.backToMyInspections}
          </Button>
        }
      >
        {labels.debugInspection.title}
      </Header>
      <Container>
        <Box padding="m">
          <pre>{JSON.stringify(inspectionData, null, 2)}</pre>
        </Box>
      </Container>
      {inspectionData.inspection ? (
        <Container>
          <SpaceBetween size="xs">
            <Header variant="h2">{labels.debugInspection.versionHeader}</Header>
            <Box>{labels.debugInspection.versionClientRevision}: {inspectionData.inspection.version?.clientRevision ?? labels.common.notProvided}</Box>
            <Box>{labels.debugInspection.versionBaseServerRevision}: {inspectionData.inspection.version?.baseServerRevision ?? labels.common.notProvided}</Box>
            <Box>{labels.debugInspection.versionServerRevision}: {inspectionData.inspection.version?.serverRevision ?? labels.common.notProvided}</Box>
            <Box>{labels.debugInspection.versionUpdatedAt}: {formatTimestamp(inspectionData.inspection.version?.updatedAt)}</Box>
            <Box>{labels.debugInspection.versionMergePolicy}: {inspectionData.inspection.version?.mergePolicy ?? labels.common.notProvided}</Box>
          </SpaceBetween>
        </Container>
      ) : null}
      {inspectionData.inspection?.conflict ? (
        <Container>
          <SpaceBetween size="xs">
            <Header variant="h2">{labels.debugInspection.conflictHeader}</Header>
            <Box>{labels.debugInspection.conflictDetectedAt}: {formatTimestamp(inspectionData.inspection.conflict.detectedAt)}</Box>
            <Box>{labels.debugInspection.conflictReason}: {inspectionData.inspection.conflict.reason}</Box>
            <Box>{labels.debugInspection.conflictServerRevision}: {inspectionData.inspection.conflict.serverRevision ?? labels.common.notProvided}</Box>
            <Box>{labels.debugInspection.conflictServerUpdatedAt}: {formatTimestamp(inspectionData.inspection.conflict.serverUpdatedAt ?? null)}</Box>
            <Box>{labels.debugInspection.conflictFields}: {(inspectionData.inspection.conflict.conflictingFields ?? []).join(', ') || labels.common.notProvided}</Box>
          </SpaceBetween>
        </Container>
      ) : null}
      <Container>
        <SpaceBetween size="s">
          <Header
            variant="h2"
            actions={
              <Button onClick={handleRefreshSyncDiagnostics}>
                {labels.debugInspection.syncRefresh}
              </Button>
            }
          >
            {labels.debugInspection.syncHeader}
          </Header>
          <Box>{labels.debugInspection.syncScopeLabel}: {syncSnapshot.scopeKey}</Box>
          <Box>{labels.debugInspection.syncStateLabel}: {labels.debugInspection.syncStatusLabels[syncSnapshot.state]}</Box>
          <Box>
            {labels.debugInspection.syncWorkerLeaseLabel}: {syncSnapshot.queue.workerLease
              ? `${syncSnapshot.queue.workerLease.ownerId} (${formatTimestamp(syncSnapshot.queue.workerLease.expiresAt)})`
              : labels.common.notProvided}
          </Box>
          <Box>{labels.debugInspection.syncLastSuccessLabel}: {formatTimestamp(syncSnapshot.lastSuccessfulSyncAt)}</Box>
          <Box>{labels.debugInspection.syncLastFailureLabel}: {formatTimestamp(syncSnapshot.lastFailedSyncAt)}</Box>
          <Box>{labels.debugInspection.syncLastErrorLabel}: {syncSnapshot.lastError || labels.common.notProvided}</Box>
          <Header variant="h3">{labels.debugInspection.syncMetricsHeader}</Header>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
              gap: '0.75rem',
            }}
          >
            <Box>{labels.debugInspection.syncMetrics.total}: {syncSnapshot.queue.metrics.totalCount}</Box>
            <Box>{labels.debugInspection.syncMetrics.ready}: {syncSnapshot.queue.metrics.readyCount}</Box>
            <Box>{labels.debugInspection.syncMetrics.pending}: {syncSnapshot.queue.metrics.pendingCount}</Box>
            <Box>{labels.debugInspection.syncMetrics.syncing}: {syncSnapshot.queue.metrics.syncingCount}</Box>
            <Box>{labels.debugInspection.syncMetrics.failed}: {syncSnapshot.queue.metrics.failedCount}</Box>
            <Box>{labels.debugInspection.syncMetrics.conflict}: {syncSnapshot.queue.metrics.conflictCount}</Box>
            <Box>{labels.debugInspection.syncMetrics.deadLetter}: {syncSnapshot.queue.metrics.deadLetterCount}</Box>
            <Box>{labels.debugInspection.syncMetrics.oldestAge}: {formatDuration(syncSnapshot.queue.metrics.oldestEntryAgeMs)}</Box>
            <Box>{labels.debugInspection.syncMetrics.nextAttempt}: {formatTimestamp(syncSnapshot.queue.metrics.nextAttemptAt)}</Box>
          </div>
          <Header variant="h3">{labels.debugInspection.syncInspectionHeader}</Header>
          {queueEntry ? (
            <SpaceBetween size="xs">
              <Box>{labels.debugInspection.syncInspection.status}: {queueEntry.status}</Box>
              <Box>{labels.debugInspection.syncInspection.attempts}: {queueEntry.attemptCount}</Box>
              <Box>{labels.debugInspection.syncInspection.nextAttempt}: {formatTimestamp(queueEntry.nextAttemptAt)}</Box>
              <Box>{labels.debugInspection.syncInspection.lastAttempt}: {formatTimestamp(queueEntry.lastAttemptAt)}</Box>
              <Box>{labels.debugInspection.syncInspection.lastError}: {queueEntry.lastError || labels.common.notProvided}</Box>
              <Box>{labels.debugInspection.syncInspection.deadLetterReason}: {queueEntry.deadLetterReason || labels.common.notProvided}</Box>
              <Box>{labels.debugInspection.syncInspection.idempotencyKey}: {queueEntry.idempotencyKey}</Box>
              <Box>{labels.debugInspection.versionClientRevision}: {queueEntry.clientRevision}</Box>
              <Box>{labels.debugInspection.versionBaseServerRevision}: {queueEntry.baseServerRevision ?? labels.common.notProvided}</Box>
              <Box>{labels.debugInspection.versionMergePolicy}: {queueEntry.mergePolicy}</Box>
              <SpaceBetween direction="horizontal" size="xs">
                <Button onClick={handleRetryQueueEntry}>
                  {queueEntry.status === 'dead-letter'
                    ? labels.debugInspection.syncInspection.requeueDeadLetter
                    : labels.debugInspection.syncInspection.retryNow}
                </Button>
                {queueEntry.status !== 'dead-letter' && queueEntry.status !== 'conflict' && (
                  <Button onClick={handleMoveToDeadLetter}>
                    {labels.debugInspection.syncInspection.moveToDeadLetter}
                  </Button>
                )}
              </SpaceBetween>
            </SpaceBetween>
          ) : (
            <Box color="text-body-secondary">{labels.debugInspection.syncNotQueued}</Box>
          )}
          <Header variant="h3">{labels.debugInspection.syncEventsHeader}</Header>
          {syncSnapshot.recentEvents.length === 0 ? (
            <Box color="text-body-secondary">{labels.debugInspection.syncEmptyEvents}</Box>
          ) : (
            syncSnapshot.recentEvents.map((event) => (
              <Box key={event.id}>
                {formatTimestamp(event.at)} [{event.level}] {event.message}
              </Box>
            ))
          )}
        </SpaceBetween>
      </Container>
      <Container>
        <SpaceBetween size="s">
          <Header variant="h2">{labels.debugInspection.filesHeader}</Header>
          {schemaError && <Box color="text-status-error">{schemaError}</Box>}
          {!schemaError && fileItems.length === 0 && (
            <Box color="text-body-secondary">{labels.debugInspection.noFilesFound}</Box>
          )}
          {!schemaError &&
            fileItems.map((item) => (
              <Box key={`${item.fieldId}-${item.type}`}>
                <div>
                  <strong>{item.label}</strong> ({item.type})
                </div>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr',
                    gap: '0.5rem 1rem',
                    alignItems: 'center',
                    marginTop: '0.5rem',
                  }}
                >
                  <Box fontWeight="bold">{labels.debugInspection.table.fileName}</Box>
                  <Box fontWeight="bold">{labels.debugInspection.table.size}</Box>
                  <Box fontWeight="bold">{labels.debugInspection.table.fileType}</Box>
                  <Box fontWeight="bold">{labels.debugInspection.table.download}</Box>
                  <Box fontWeight="bold">{labels.debugInspection.table.preview}</Box>
                  {item.files.map((file) => (
                    <div key={file.id} style={{ display: 'contents' }}>
                      <Box>{file.name}</Box>
                      <Box>{formatFileSize(file.size)}</Box>
                      <Box>{file.type || labels.common.unknown}</Box>
                      <Box>
                        <Button onClick={() => handleDownload(file)}>{labels.common.download}</Button>
                      </Box>
                      <Box>
                        {isPreviewableImage(file) ? (
                          <Button onClick={() => handlePreview(file)}>{labels.common.preview}</Button>
                        ) : (
                          <span>-</span>
                        )}
                      </Box>
                    </div>
                  ))}
                </div>
              </Box>
            ))}
        </SpaceBetween>
      </Container>
      <Modal
        visible={previewOpen}
        onDismiss={closePreview}
        header={previewName || labels.debugInspection.previewTitle}
        size="large"
        footer={
          <Box float="right">
            <Button onClick={closePreview}>{labels.debugInspection.close}</Button>
          </Box>
        }
      >
        {previewUrl && (
          <Box textAlign="center">
            <img src={previewUrl} alt={previewName || labels.debugInspection.previewTitle} style={{ maxWidth: '100%' }} />
          </Box>
        )}
      </Modal>
    </SpaceBetween>
  );
}
