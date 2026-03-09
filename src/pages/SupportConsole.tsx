import { Box, Container, Header, SpaceBetween } from '@cloudscape-design/components';
import {
  QueueSection,
  RecoverySection,
  SessionSection,
  SummaryGrid,
  SupportAlerts,
  TenantSection,
} from './supportConsole/SupportConsoleSections';
import { useSupportConsoleController } from './supportConsole/useSupportConsoleController';

export function SupportConsole() {
  const controller = useSupportConsoleController();

  return (
    <SpaceBetween size="l">
      <Header variant="h1">{controller.labels.support.title}</Header>
      <Box color="text-body-secondary">{controller.labels.support.intro}</Box>
      <SupportAlerts
        canManageSupport={controller.canManageSupport}
        flashMessage={controller.flashMessage}
        labels={controller.labels}
        onDismiss={() => controller.setFlashMessage(null)}
      />

      <Container>
        <SpaceBetween size="m">
          <Header variant="h2">{controller.labels.support.observabilitySection.title}</Header>
          <Box color="text-body-secondary">{controller.labels.support.observabilitySection.description}</Box>
          <SummaryGrid items={controller.observabilitySummaryItems} />
        </SpaceBetween>
      </Container>

      <TenantSection
        labels={controller.labels}
        canSelectTenant={controller.canSelectTenant}
        tenantSelection={controller.tenantSelection}
        tenantOptions={controller.tenantOptions}
        governance={controller.governance}
        config={controller.config}
        diagnostics={controller.diagnostics}
        onSelectTenant={(option) => controller.setTenantSelection(option)}
        onApplyTenant={() => void controller.handleApplyTenant()}
        onRefreshConfig={() => void controller.handleRefreshConfig()}
        onClearCache={() => void controller.handleClearCache()}
        onPromoteConfig={() => void controller.handlePromoteConfig()}
        onRollbackConfig={() => void controller.handleRollbackConfig()}
        formatTimestamp={controller.formatTimestamp}
      />

      <QueueSection
        labels={controller.labels}
        summaryItems={controller.queueSummaryItems}
        queueEntries={controller.queueEntries}
        inspections={controller.inspections}
        onRefresh={() => void controller.refreshSupportState()}
        onInspect={(inspectionId) => controller.setCurrentInspectionId(inspectionId)}
        onRetry={(entry) => void controller.handleRetryEntry(entry)}
        onMoveToDeadLetter={(entry) => void controller.handleMoveToDeadLetter(entry)}
        formatTimestamp={controller.formatTimestamp}
      />

      <RecoverySection
        labels={controller.labels}
        recoveryCandidates={controller.recoveryCandidates}
        queueEntriesById={controller.queueEntriesById}
        onRecover={(inspection) => void controller.handleRecoverUpload(inspection)}
        onResume={(inspection) => void controller.handleOpenForm(inspection)}
        onInvestigate={(inspection) => {
          controller.setCurrentInspectionId(inspection.id);
          controller.handleOpenDebug(inspection);
        }}
      />

      <SessionSection
        labels={controller.labels}
        selectedInspection={controller.selectedInspection}
        currentSessionId={controller.currentSessionId}
        selectedQueueEntry={controller.selectedQueueEntry}
        selectedFormDataCount={controller.selectedFormDataCount}
        onOpenDebug={controller.handleOpenDebug}
        onOpenForm={(inspection) => void controller.handleOpenForm(inspection)}
      />
    </SpaceBetween>
  );
}
