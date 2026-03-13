import { Alert, Box, Button, Container, FormField, Header, Select, SpaceBetween } from '@cloudscape-design/components';
import type { SelectProps } from '@cloudscape-design/components';
import type { CSSProperties } from 'react';
import type { SyncQueueEntry } from '../../domain/syncQueue';
import { type InspectionSession, UploadStatus } from '../../types';

export type FlashMessage = {
  type: 'success' | 'error';
  message: string;
};

type SummaryItem = {
  label: string;
  value: string;
};

type SupportLabels = {
  [key: string]: any;
};

export const statsGridStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
  gap: '0.75rem',
};

const sectionGridStyle: CSSProperties = {
  display: 'grid',
  gap: '1rem',
};

const cardStyle: CSSProperties = {
  border: '1px solid var(--app-flyout-border-color, #d5dbe3)',
  borderRadius: '12px',
  padding: '1rem',
  background: 'var(--app-flyout-bg-color, #fff)',
};

export const SupportAlerts = ({
  canManageSupport,
  flashMessage,
  labels,
  onDismiss,
}: {
  canManageSupport: boolean;
  flashMessage: FlashMessage | null;
  labels: SupportLabels;
  onDismiss: () => void;
}) => (
  <>
    {!canManageSupport ? <Alert type="error">{labels.support.alerts.actionFailed}</Alert> : null}
    {flashMessage ? (
      <Alert type={flashMessage.type} dismissible onDismiss={onDismiss}>
        {flashMessage.message}
      </Alert>
    ) : null}
  </>
);

export const SummaryGrid = ({ items }: { items: SummaryItem[] }) => (
  <div style={statsGridStyle}>
    {items.map((item, index) => (
      <div key={`${item.label}-${index}`} style={cardStyle}>
        <strong>{item.label}</strong>
        <Box>{item.value}</Box>
      </div>
    ))}
  </div>
);

export const TenantSection = ({
  labels,
  canSelectTenant,
  tenantSelection,
  tenantOptions,
  governance,
  config,
  diagnostics,
  onSelectTenant,
  onApplyTenant,
  onRefreshConfig,
  onClearCache,
  onPromoteConfig,
  onRollbackConfig,
  formatTimestamp,
}: {
  labels: SupportLabels;
  canSelectTenant: boolean;
  tenantSelection: SelectProps.Option | null;
  tenantOptions: SelectProps.Option[];
  governance: any;
  config: any;
  diagnostics: any;
  onSelectTenant: (option: SelectProps.Option) => void;
  onApplyTenant: () => void;
  onRefreshConfig: () => void;
  onClearCache: () => void;
  onPromoteConfig: () => void;
  onRollbackConfig: () => void;
  formatTimestamp: (value: number | string | null | undefined) => string;
}) => (
  <Container>
    <SpaceBetween size="m">
      <Header variant="h2">{labels.support.tenantSection.title}</Header>
      <Box color="text-body-secondary">{labels.support.tenantSection.description}</Box>
      {canSelectTenant ? (
        <div style={{ ...statsGridStyle, alignItems: 'end' }}>
          <FormField label={labels.support.tenantSection.tenantLabel}>
            <Select
              selectedOption={tenantSelection}
              onChange={({ detail }) => onSelectTenant(detail.selectedOption)}
              options={tenantOptions}
            />
          </FormField>
          <Button onClick={onApplyTenant}>{labels.support.tenantSection.applyTenant}</Button>
          <Button onClick={onRefreshConfig}>{labels.support.tenantSection.refreshConfig}</Button>
          <Button onClick={onClearCache}>{labels.support.tenantSection.clearCache}</Button>
          <Button onClick={onPromoteConfig}>{labels.support.tenantSection.promoteConfig}</Button>
          <Button disabled={governance.promotionHistory.length < 2} onClick={onRollbackConfig}>
            {labels.support.tenantSection.rollbackConfig}
          </Button>
        </div>
      ) : null}
      <Header variant="h3">{labels.support.tenantSection.activeConfigHeader}</Header>
      <SummaryGrid
        items={[
          { label: labels.support.tenantSection.bootstrapStatus, value: labels.bootstrap.status[diagnostics.status] },
          { label: labels.support.tenantSection.bootstrapSource, value: labels.bootstrap.source[diagnostics.source] },
          {
            label: labels.support.tenantSection.enabledForms,
            value: config.enabledForms.map((formType: string) => labels.formTypes[formType]).join(', ') || labels.common.notProvided,
          },
          { label: labels.support.tenantSection.loginRequired, value: config.loginRequired ? labels.common.yes : labels.common.no },
          { label: labels.support.tenantSection.leftFlyout, value: config.showLeftFlyout ? labels.common.yes : labels.common.no },
          { label: labels.support.tenantSection.rightFlyout, value: config.showRightFlyout ? labels.common.yes : labels.common.no },
          { label: labels.support.tenantSection.statsButton, value: config.showInspectionStatsButton ? labels.common.yes : labels.common.no },
          { label: labels.bootstrap.lastAttemptLabel, value: formatTimestamp(diagnostics.lastAttemptAt) },
          { label: labels.support.tenantSection.schemaVersion, value: governance.schemaVersion },
          { label: labels.support.tenantSection.artifactVersion, value: governance.promotedVersion },
          { label: labels.support.tenantSection.environment, value: governance.environmentId },
          { label: labels.support.tenantSection.reviewStatus, value: governance.promotedArtifact.reviewStatus },
          { label: labels.support.tenantSection.reviewedBy, value: governance.promotedArtifact.reviewedBy },
          { label: labels.support.tenantSection.reviewedAt, value: formatTimestamp(governance.promotedArtifact.reviewedAt) },
        ]}
      />
      <Header variant="h3">{labels.support.tenantSection.auditHeader}</Header>
      <div style={sectionGridStyle}>
        {governance.auditEntries.length === 0 ? (
          <Box color="text-body-secondary">{labels.support.tenantSection.noAuditEntries}</Box>
        ) : (
          governance.auditEntries.slice(0, 5).map((entry: any) => (
            <div key={entry.auditId} style={cardStyle}>
              <SpaceBetween size="xs">
                <Box><strong>{labels.support.tenantSection.auditAction}</strong> {entry.action}</Box>
                <Box><strong>{labels.support.tenantSection.auditActor}</strong> {entry.actorId}</Box>
                <Box><strong>{labels.support.tenantSection.auditEnvironment}</strong> {entry.environmentId}</Box>
                <Box><strong>{labels.support.tenantSection.auditVersion}</strong> {entry.fromVersion ?? labels.common.notProvided} {' -> '} {entry.toVersion ?? labels.common.notProvided}</Box>
                <Box><strong>{labels.support.tenantSection.auditOccurredAt}</strong> {formatTimestamp(entry.occurredAt)}</Box>
                <Box><strong>{labels.support.tenantSection.auditNote}</strong> {entry.note}</Box>
              </SpaceBetween>
            </div>
          ))
        )}
      </div>
    </SpaceBetween>
  </Container>
);

export const QueueSection = ({
  labels,
  summaryItems,
  queueEntries,
  inspections,
  onRefresh,
  onInspect,
  onRetry,
  onMoveToDeadLetter,
  formatTimestamp,
}: {
  labels: SupportLabels;
  summaryItems: SummaryItem[];
  queueEntries: SyncQueueEntry[];
  inspections: InspectionSession[];
  onRefresh: () => void;
  onInspect: (inspectionId: string) => void;
  onRetry: (entry: SyncQueueEntry) => void;
  onMoveToDeadLetter: (entry: SyncQueueEntry) => void;
  formatTimestamp: (value: number | string | null | undefined) => string;
}) => (
  <Container>
    <SpaceBetween size="m">
      <Header variant="h2" actions={<Button onClick={onRefresh}>{labels.support.queueSection.refresh}</Button>}>
        {labels.support.queueSection.title}
      </Header>
      <Box color="text-body-secondary">{labels.support.queueSection.description}</Box>
      <SummaryGrid items={summaryItems} />
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
                    <Button onClick={() => onInspect(entry.inspectionId)}>{labels.support.queueSection.inspect}</Button>
                    <Button onClick={() => onRetry(entry)}>
                      {entry.status === 'dead-letter'
                        ? labels.debugInspection.syncInspection.requeueDeadLetter
                        : labels.debugInspection.syncInspection.retryNow}
                    </Button>
                    {entry.status !== 'dead-letter' && entry.status !== 'conflict' ? (
                      <Button onClick={() => onMoveToDeadLetter(entry)}>
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
);

export const RecoverySection = ({
  labels,
  recoveryCandidates,
  queueEntriesById,
  onRecover,
  onResume,
  onInvestigate,
}: {
  labels: SupportLabels;
  recoveryCandidates: InspectionSession[];
  queueEntriesById: Map<string, SyncQueueEntry>;
  onRecover: (inspection: InspectionSession) => void;
  onResume: (inspection: InspectionSession) => void;
  onInvestigate: (inspection: InspectionSession) => void;
}) => (
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
                    <Button onClick={() => onRecover(inspection)}>{labels.support.recoverySection.recover}</Button>
                    <Button onClick={() => onResume(inspection)}>{labels.support.recoverySection.resume}</Button>
                    <Button onClick={() => onInvestigate(inspection)}>{labels.support.recoverySection.investigate}</Button>
                  </SpaceBetween>
                </SpaceBetween>
              </div>
            );
          })
        )}
      </div>
    </SpaceBetween>
  </Container>
);

export const SessionSection = ({
  labels,
  selectedInspection,
  currentSessionId,
  selectedQueueEntry,
  selectedFormDataCount,
  onOpenDebug,
  onOpenForm,
}: {
  labels: SupportLabels;
  selectedInspection: InspectionSession | null;
  currentSessionId: string | null;
  selectedQueueEntry: SyncQueueEntry | null;
  selectedFormDataCount: number;
  onOpenDebug: (inspection: InspectionSession) => void;
  onOpenForm: (inspection: InspectionSession) => void;
}) => (
  <Container>
    <SpaceBetween size="m">
      <Header variant="h2">{labels.support.sessionSection.title}</Header>
      <Box color="text-body-secondary">{labels.support.sessionSection.description}</Box>
      {selectedInspection ? (
        <>
          <SummaryGrid
            items={[
              { label: labels.support.sessionSection.currentSession, value: currentSessionId ?? labels.common.notProvided },
              { label: labels.support.sessionSection.queueStatus, value: selectedQueueEntry?.status ?? labels.common.notProvided },
              { label: labels.support.sessionSection.formDataFields, value: String(selectedFormDataCount) },
              { label: labels.support.sessionSection.tenant, value: selectedInspection.tenantId },
              { label: labels.support.sessionSection.user, value: selectedInspection.userId ?? labels.common.notProvided },
              { label: labels.myInspections.table.status, value: labels.uploadStatus[selectedInspection.uploadStatus ?? UploadStatus.Local] },
            ]}
          />
          <SpaceBetween direction="horizontal" size="xs">
            <Button onClick={() => onOpenDebug(selectedInspection)}>{labels.support.sessionSection.openDebug}</Button>
            <Button onClick={() => onOpenForm(selectedInspection)}>{labels.support.sessionSection.openForm}</Button>
          </SpaceBetween>
        </>
      ) : (
        <Box color="text-body-secondary">{labels.support.sessionSection.noSelection}</Box>
      )}
    </SpaceBetween>
  </Container>
);
