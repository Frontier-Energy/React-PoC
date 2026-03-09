import { Box, Button, Container, Header, Modal, SpaceBetween } from '@cloudscape-design/components';
import { useDebugInspectionController } from '../application/useDebugInspectionController';

export function DebugInspection() {
  const {
    labels,
    navigate,
    syncSnapshot,
    schemaError,
    previewOpen,
    previewName,
    previewUrl,
    queueEntry,
    inspectionData,
    fileItems,
    formatFileSize,
    formatDuration,
    formatTimestamp,
    isPreviewableImage,
    closePreview,
    handleDownload,
    handlePreview,
    handleRefreshSyncDiagnostics,
    handleRetryQueueEntry,
    handleMoveToDeadLetter,
  } = useDebugInspectionController();

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
