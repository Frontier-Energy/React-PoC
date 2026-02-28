import { useNavigate } from 'react-router-dom';
import { Header, Container, SpaceBetween, Button, Table, Box, Badge, Select, SelectProps, Link, Alert, Modal } from '@cloudscape-design/components';
import { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { InspectionSession, UploadStatus, FormType } from '../types';
import { TableProps } from '@cloudscape-design/components';
import { useLocalization } from '../LocalizationContext';
import { inspectionRepository } from '../repositories/inspectionRepository';

export function MyInspections() {
  const navigate = useNavigate();
  const location = useLocation();
  const { labels } = useLocalization();
  const [inspections, setInspections] = useState<InspectionSession[]>([]);
  const [filteredInspections, setFilteredInspections] = useState<InspectionSession[]>([]);
  const [formTypeFilter, setFormTypeFilter] = useState<SelectProps.Option | null>(null);
  const [statusFilter, setStatusFilter] = useState<SelectProps.Option | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [sortingColumn, setSortingColumn] = useState<TableProps.SortingColumn<InspectionSession>>({
    sortingField: 'name',
  });
  const [sortingDescending, setSortingDescending] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<InspectionSession | null>(null);
  const failedInspections = inspections.filter(
    (inspection) => (inspection.uploadStatus || UploadStatus.Local) === UploadStatus.Failed
  );

  useEffect(() => {
    loadInspections();
  }, []);

  useEffect(() => {
    const handleStatusChange = () => {
      loadInspections();
    };

    window.addEventListener('inspection-status-changed', handleStatusChange as EventListener);
    return () => window.removeEventListener('inspection-status-changed', handleStatusChange as EventListener);
  }, []);

  useEffect(() => {
    // Check if there's a success message from navigation state
    if (location.state?.successMessage) {
      setSuccessMessage(location.state.successMessage);
      // Clear the message after 5 seconds
      const timer = setTimeout(() => setSuccessMessage(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [location]);

  useEffect(() => {
    applyFilters();
  }, [inspections, formTypeFilter, statusFilter]);

  const loadInspections = () => {
    setInspections(inspectionRepository.loadAll());
  };

  const applyFilters = () => {
    let filtered = inspections;

    if (formTypeFilter?.value) {
      filtered = filtered.filter((inspection) => inspection.formType === formTypeFilter.value);
    }

    if (statusFilter?.value) {
      filtered = filtered.filter((inspection) => (inspection.uploadStatus || UploadStatus.Local) === statusFilter.value);
    }

    setFilteredInspections(filtered);
  };

  const handleOpenInspection = (inspection: InspectionSession) => {
    inspectionRepository.saveCurrent(inspection);
    navigate(`/fill-form/${inspection.id}`);
  };

  const handleViewInspection = (inspection: InspectionSession) => {
    navigate(`/debug-inspection/${inspection.id}`);
  };

  const handleDeleteInspection = (inspection: InspectionSession) => {
    inspectionRepository.delete(inspection.id);
    loadInspections();
  };

  const handleRequestDeleteInspection = (inspection: InspectionSession) => {
    setDeleteTarget(inspection);
  };

  const handleConfirmDeleteInspection = () => {
    if (!deleteTarget) {
      return;
    }
    handleDeleteInspection(deleteTarget);
    setDeleteTarget(null);
  };

  const handleCancelDeleteInspection = () => {
    setDeleteTarget(null);
  };

  const handleRetryInspection = (inspection: InspectionSession) => {
    const updatedInspection: InspectionSession = {
      ...inspection,
      uploadStatus: UploadStatus.Local,
    };
    inspectionRepository.update(updatedInspection);
    const currentSession = inspectionRepository.loadCurrent();
    if (currentSession?.id === inspection.id) {
      inspectionRepository.saveCurrent(updatedInspection);
    }
    window.dispatchEvent(new CustomEvent('inspection-status-changed', { detail: updatedInspection }));
    loadInspections();
  };

  const getUploadStatusBadge = (status: UploadStatus | undefined) => {
    const badgeConfig: Record<UploadStatus, { color: 'blue' | 'green' | 'red' | 'grey'; label: string }> = {
      [UploadStatus.Local]: { color: 'blue', label: labels.uploadStatus[UploadStatus.Local] },
      [UploadStatus.InProgress]: { color: 'grey', label: labels.uploadStatus[UploadStatus.InProgress] },
      [UploadStatus.Uploading]: { color: 'grey', label: labels.uploadStatus[UploadStatus.Uploading] },
      [UploadStatus.Uploaded]: { color: 'green', label: labels.uploadStatus[UploadStatus.Uploaded] },
      [UploadStatus.Failed]: { color: 'red', label: labels.uploadStatus[UploadStatus.Failed] },
    };

    const config = badgeConfig[status || UploadStatus.Local];
    return <Badge color={config.color}>{config.label}</Badge>;
  };

  const handleSortingChange = (detail: TableProps.SortingState<InspectionSession>) => {
    setSortingColumn(detail.sortingColumn);
    setSortingDescending(detail.isDescending || false);
  };

  const formTypeOptions: SelectProps.Option[] = [
    { label: labels.myInspections.filters.allFormTypes, value: '' },
    ...Object.values(FormType).map((type) => ({
      label: labels.formTypes[type],
      value: type,
    })),
  ];

  const statusOptions: SelectProps.Option[] = [
    { label: labels.myInspections.filters.allStatuses, value: '' },
    { label: labels.uploadStatus[UploadStatus.Local], value: UploadStatus.Local },
    { label: labels.uploadStatus[UploadStatus.InProgress], value: UploadStatus.InProgress },
    { label: labels.uploadStatus[UploadStatus.Uploading], value: UploadStatus.Uploading },
    { label: labels.uploadStatus[UploadStatus.Uploaded], value: UploadStatus.Uploaded },
    { label: labels.uploadStatus[UploadStatus.Failed], value: UploadStatus.Failed },
  ];

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
          {labels.myInspections.failedUploadMessage(failedInspections.length)}
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
          <Button onClick={() => { setFormTypeFilter(null); setStatusFilter(null); }}>
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
                <Link onFollow={() => navigate('/new-inspection')}>
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
                cell: (item: InspectionSession) => labels.formTypes[item.formType],
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
                    <Button onClick={() => handleRequestDeleteInspection(item)}>{labels.myInspections.table.buttons.delete}</Button>
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
        <Button onClick={() => navigate('/new-inspection')}>{labels.myInspections.createNewInspection}</Button>
      </Container>
    </SpaceBetween>
  );
}
