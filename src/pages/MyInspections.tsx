import { useNavigate } from 'react-router-dom';
import { Header, Container, SpaceBetween, Button, Table, Box, Badge, Select, SelectProps, Link, Alert } from '@cloudscape-design/components';
import { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { InspectionSession, FormTypeLabels, UploadStatus, FormType } from '../types';
import { TableProps } from '@cloudscape-design/components';

export function MyInspections() {
  const navigate = useNavigate();
  const location = useLocation();
  const [inspections, setInspections] = useState<InspectionSession[]>([]);
  const [filteredInspections, setFilteredInspections] = useState<InspectionSession[]>([]);
  const [selectedItems, setSelectedItems] = useState<InspectionSession[]>([]);
  const [formTypeFilter, setFormTypeFilter] = useState<SelectProps.Option | null>(null);
  const [statusFilter, setStatusFilter] = useState<SelectProps.Option | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [sortingColumn, setSortingColumn] = useState<any>({ id: 'name', direction: 'asc' });
  const [sortingDescending, setSortingDescending] = useState(false);
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
    // Get all inspection sessions from localStorage
    const sessionMap: Record<string, InspectionSession> = {};
    const keys = Object.keys(localStorage);
    
    keys.forEach((key) => {
      if (key.startsWith('inspection_')) {
        const sessionStr = localStorage.getItem(key);
        if (sessionStr) {
          try {
            const session: InspectionSession = JSON.parse(sessionStr);
            sessionMap[session.id] = session;
          } catch (error) {
            console.error(`Failed to parse session ${key}:`, error);
          }
        }
      }
    });

    // Convert map to array
    const allInspections = Object.values(sessionMap);
    setInspections(allInspections);
  };

  const applyFilters = () => {
    let filtered = inspections;

    if (formTypeFilter) {
      filtered = filtered.filter((inspection) => inspection.formType === formTypeFilter.value);
    }

    if (statusFilter) {
      filtered = filtered.filter((inspection) => (inspection.uploadStatus || UploadStatus.Local) === statusFilter.value);
    }

    setFilteredInspections(filtered);
  };

  const handleOpenInspection = (inspection: InspectionSession) => {
    localStorage.setItem('currentSession', JSON.stringify(inspection));
    navigate(`/fill-form/${inspection.id}`);
  };

  const handleViewInspection = (inspection: InspectionSession) => {
    navigate(`/debug-inspection/${inspection.id}`);
  };

  const handleDeleteInspection = (inspection: InspectionSession) => {
    const keys = Object.keys(localStorage);
    keys.forEach((key) => {
      const sessionStr = localStorage.getItem(key);
      if (sessionStr) {
        try {
          const session: InspectionSession = JSON.parse(sessionStr);
          if (session.id === inspection.id) {
            localStorage.removeItem(key);
            localStorage.removeItem(`formData_${inspection.id}`);
          }
        } catch (error) {
          // Continue
        }
      }
    });
    loadInspections();
  };

  const handleRetryInspection = (inspection: InspectionSession) => {
    const updatedInspection: InspectionSession = {
      ...inspection,
      uploadStatus: UploadStatus.Local,
    };
    localStorage.setItem(`inspection_${inspection.id}`, JSON.stringify(updatedInspection));
    const currentSession = localStorage.getItem('currentSession');
    if (currentSession) {
      try {
        const parsedSession: InspectionSession = JSON.parse(currentSession);
        if (parsedSession.id === inspection.id) {
          localStorage.setItem('currentSession', JSON.stringify(updatedInspection));
        }
      } catch (error) {
        // Ignore invalid session data
      }
    }
    window.dispatchEvent(new CustomEvent('inspection-status-changed', { detail: updatedInspection }));
    loadInspections();
  };

  const getUploadStatusBadge = (status: UploadStatus | undefined) => {
    const badgeConfig: Record<UploadStatus, { color: 'blue' | 'green' | 'red' | 'grey'; label: string }> = {
      [UploadStatus.Local]: { color: 'blue', label: 'Local' },
      [UploadStatus.Uploading]: { color: 'grey', label: 'Uploading' },
      [UploadStatus.Uploaded]: { color: 'green', label: 'Uploaded' },
      [UploadStatus.Failed]: { color: 'red', label: 'Failed' },
    };

    const config = badgeConfig[status || UploadStatus.Local];
    return <Badge color={config.color}>{config.label}</Badge>;
  };

  const handleSortingChange = (detail: any) => {
    setSortingColumn(detail.sortingColumn);
    setSortingDescending(detail.isDescending || false);
  };

  const formTypeOptions: SelectProps.Option[] = [
    { label: 'All Form Types', value: '' },
    ...Object.values(FormType).map((type) => ({
      label: FormTypeLabels[type],
      value: type,
    })),
  ];

  const statusOptions: SelectProps.Option[] = [
    { label: 'All Statuses', value: '' },
    { label: 'Local', value: UploadStatus.Local },
    { label: 'Uploading', value: UploadStatus.Uploading },
    { label: 'Uploaded', value: UploadStatus.Uploaded },
    { label: 'Failed', value: UploadStatus.Failed },
  ];

  return (
    <SpaceBetween size="l">
      <Header variant="h1">My Inspections</Header>

      {successMessage && (
        <Alert type="success" dismissible onDismiss={() => setSuccessMessage(null)}>
          {successMessage}
        </Alert>
      )}

      {failedInspections.length > 0 && (
        <Alert type="error">
          {failedInspections.length === 1
            ? 'An inspection failed to upload. Use Retry to try again.'
            : `${failedInspections.length} inspections failed to upload. Use Retry to try again.`}
        </Alert>
      )}

      <Container>
        <SpaceBetween size="m" direction="horizontal">
          <Select
            selectedOption={formTypeFilter}
            onChange={({ detail }) => setFormTypeFilter(detail.selectedOption)}
            options={formTypeOptions}
            placeholder="Filter by form type"
          />
          <Select
            selectedOption={statusFilter}
            onChange={({ detail }) => setStatusFilter(detail.selectedOption)}
            options={statusOptions}
            placeholder="Filter by status"
          />
          <Button onClick={() => { setFormTypeFilter(null); setStatusFilter(null); }}>
            Clear Filters
          </Button>
        </SpaceBetween>
      </Container>
      
      {filteredInspections.length === 0 ? (
        <Container>
          <Box textAlign="center" color="text-body-secondary">
            {inspections.length === 0 ? (
              <>No inspections found. <Link onFollow={() => navigate('/new-inspection')}>Create a new inspection</Link> to get started.</>
            ) : (
              <>No inspections match the selected filters.</>
            )}
          </Box>
        </Container>
      ) : (
        <Container>
          <Table
            columnDefinitions={[
              {
                id: 'name',
                header: 'Name',
                cell: (item: InspectionSession) => item.name || '(Unnamed)',
                sortingField: 'name',
              },
              {
                id: 'formType',
                header: 'Form Type',
                cell: (item: InspectionSession) => FormTypeLabels[item.formType],
                sortingField: 'formType',
              },
              {
                id: 'uploadStatus',
                header: 'Status',
                cell: (item: InspectionSession) => getUploadStatusBadge(item.uploadStatus),
                sortingField: 'uploadStatus',
              },
              {
                id: 'actions',
                header: 'Actions',
                cell: (item: InspectionSession) => (
                  <SpaceBetween direction="horizontal" size="s">
                    <Button onClick={() => handleViewInspection(item)}>View</Button>
                    <Button onClick={() => handleOpenInspection(item)}>Open</Button>
                    {(item.uploadStatus || UploadStatus.Local) === UploadStatus.Failed && (
                      <Button onClick={() => handleRetryInspection(item)}>Retry</Button>
                    )}
                    <Button onClick={() => handleDeleteInspection(item)}>Delete</Button>
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
                <b>No inspections</b>
              </Box>
            }
          />
        </Container>
      )}

      <Container>
        <Button onClick={() => navigate('/new-inspection')}>Create New Inspection</Button>
      </Container>
    </SpaceBetween>
  );
}
