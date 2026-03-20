import { Header, Container, SpaceBetween, Button, Table, Box, Badge, Select, Link, Alert, Modal } from '@cloudscape-design/components';
import { InspectionSession, UploadStatus } from '../types';
import { TableProps } from '@cloudscape-design/components';
import { useMyInspectionsController } from '../application/useMyInspectionsController';
import { formatPluralTemplate, getFormTypeLabel } from '../resources/translations';

export function MyInspections() {
  const {
    labels,
    inspections,
    filteredInspections,
    failedInspections,
    conflictedInspections,
    formTypeFilter,
    statusFilter,
    successMessage,
    sortingColumn,
    sortingDescending,
    deleteTarget,
    formTypeOptions,
    statusOptions,
    setFormTypeFilter,
    setStatusFilter,
    setSuccessMessage,
    setDeleteTarget,
    setSortingColumn,
    setSortingDescending,
    handleOpenInspection,
    handleViewInspection,
    handleConfirmDeleteInspection,
    handleCancelDeleteInspection,
    handleRetryInspection,
    handleOpenNewInspection,
    clearFilters,
  } = useMyInspectionsController();

  const getUploadStatusBadge = (status: UploadStatus | undefined) => {
      const badgeConfig: Record<UploadStatus, { color: 'blue' | 'green' | 'red' | 'grey'; label: string }> = {
        [UploadStatus.Local]: { color: 'blue', label: labels.uploadStatus[UploadStatus.Local] },
        [UploadStatus.InProgress]: { color: 'grey', label: labels.uploadStatus[UploadStatus.InProgress] },
        [UploadStatus.Uploading]: { color: 'grey', label: labels.uploadStatus[UploadStatus.Uploading] },
        [UploadStatus.Uploaded]: { color: 'green', label: labels.uploadStatus[UploadStatus.Uploaded] },
        [UploadStatus.Failed]: { color: 'red', label: labels.uploadStatus[UploadStatus.Failed] },
        [UploadStatus.Conflict]: { color: 'red', label: labels.uploadStatus[UploadStatus.Conflict] },
      };

    const config = badgeConfig[status || UploadStatus.Local];
    return <Badge color={config.color}>{config.label}</Badge>;
  };

  const handleSortingChange = (detail: TableProps.SortingState<InspectionSession>) => {
    setSortingColumn(detail.sortingColumn);
    setSortingDescending(detail.isDescending || false);
  };

  return (
    <SpaceBetween size="l">
      <Header variant="h1">{labels.myInspections.title}</Header>

      <Modal
        visible={!!deleteTarget}
        onDismiss={handleCancelDeleteInspection}
        header={labels.myInspections.deleteModal.header}
        footer={
          <Box float="right">
            <SpaceBetween direction="horizontal" size="xs">
              <Button variant="link" onClick={handleCancelDeleteInspection}>
                {labels.common.cancel}
              </Button>
              <Button variant="primary" onClick={handleConfirmDeleteInspection}>
                {labels.common.delete}
              </Button>
            </SpaceBetween>
          </Box>
        }
      >
        {deleteTarget ? (
          <SpaceBetween size="xs">
            <Box>
              {labels.myInspections.deleteModal.confirmPrefix}{' '}
              <Box fontWeight="bold" display="inline">
                {deleteTarget.name || labels.common.unnamed}
              </Box>
              {labels.myInspections.deleteModal.confirmSuffix}
            </Box>
          </SpaceBetween>
        ) : null}
      </Modal>

      {successMessage && (
        <Alert type="success" dismissible onDismiss={() => setSuccessMessage(null)}>
          {successMessage}
        </Alert>
      )}

      {failedInspections.length > 0 && (
        <Alert type="error">
          {formatPluralTemplate(labels.myInspections.failedUploadMessage, failedInspections.length)}
        </Alert>
      )}

      {conflictedInspections.length > 0 && (
        <Alert type="warning">
          {labels.uploadStatus[UploadStatus.Conflict]}: {conflictedInspections.length}
        </Alert>
      )}

      <Container>
        <SpaceBetween size="m" direction="horizontal">
          <Select
            selectedOption={formTypeFilter}
            onChange={({ detail }) => setFormTypeFilter(detail.selectedOption)}
            options={formTypeOptions}
            placeholder={labels.myInspections.filters.filterByFormType}
          />
          <Select
            selectedOption={statusFilter}
            onChange={({ detail }) => setStatusFilter(detail.selectedOption)}
            options={statusOptions}
            placeholder={labels.myInspections.filters.filterByStatus}
          />
          <Button onClick={clearFilters}>
            {labels.myInspections.filters.clearFilters}
          </Button>
        </SpaceBetween>
      </Container>
      
      {filteredInspections.length === 0 ? (
        <Container>
          <Box textAlign="center" color="text-body-secondary">
            {inspections.length === 0 ? (
              <>
                {labels.myInspections.emptyState.noInspections}{' '}
                <Link onFollow={handleOpenNewInspection}>
                  {labels.myInspections.emptyState.createNewInspectionLink}
                </Link>{' '}
                {labels.myInspections.emptyState.createNewInspectionSuffix}
              </>
            ) : (
              <>{labels.myInspections.emptyState.noMatchingFilters}</>
            )}
          </Box>
        </Container>
      ) : (
        <Container>
          <Table
            columnDefinitions={[
              {
                id: 'name',
                header: labels.myInspections.table.name,
                cell: (item: InspectionSession) => item.name || labels.common.unnamed,
                sortingField: 'name',
              },
              {
                id: 'formType',
                header: labels.myInspections.table.formType,
                cell: (item: InspectionSession) => getFormTypeLabel(labels, item.formType),
                sortingField: 'formType',
              },
              {
                id: 'uploadStatus',
                header: labels.myInspections.table.status,
                cell: (item: InspectionSession) => getUploadStatusBadge(item.uploadStatus),
                sortingField: 'uploadStatus',
              },
              {
                id: 'actions',
                header: labels.myInspections.table.actions,
                cell: (item: InspectionSession) => (
                  <SpaceBetween direction="horizontal" size="s">
                    <Button onClick={() => handleViewInspection(item)}>{labels.myInspections.table.buttons.view}</Button>
                    {(item.uploadStatus || UploadStatus.Local) === UploadStatus.InProgress && (
                      <Button onClick={() => handleOpenInspection(item)}>{labels.myInspections.table.buttons.open}</Button>
                    )}
                    {(item.uploadStatus || UploadStatus.Local) === UploadStatus.Failed && (
                      <Button onClick={() => handleRetryInspection(item)}>{labels.myInspections.table.buttons.retry}</Button>
                    )}
                    {(item.uploadStatus || UploadStatus.Local) === UploadStatus.Conflict && (
                      <Button onClick={() => handleOpenInspection(item)}>{labels.myInspections.table.buttons.open}</Button>
                    )}
                    <Button onClick={() => setDeleteTarget(item)}>{labels.myInspections.table.buttons.delete}</Button>
                  </SpaceBetween>
                ),
              },
            ]}
            items={filteredInspections}
            sortingColumn={sortingColumn}
            sortingDescending={sortingDescending}
            onSortingChange={(event) => handleSortingChange(event.detail)}
            empty={
              <Box textAlign="center" color="inherit">
                <b>{labels.myInspections.table.empty}</b>
              </Box>
            }
          />
        </Container>
      )}

      <Container>
        <Button onClick={handleOpenNewInspection}>{labels.myInspections.createNewInspection}</Button>
      </Container>
    </SpaceBetween>
  );
}

