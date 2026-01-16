import { useNavigate } from 'react-router-dom';
import { Header, Container, SpaceBetween, Button, Table, Box, Badge, Select, SelectProps } from '@cloudscape-design/components';
import { useState, useEffect } from 'react';
import { InspectionSession, FormTypeLabels, UploadStatus, FormType } from '../types';

export function MyInspections() {
  const navigate = useNavigate();
  const [inspections, setInspections] = useState<InspectionSession[]>([]);
  const [filteredInspections, setFilteredInspections] = useState<InspectionSession[]>([]);
  const [selectedItems, setSelectedItems] = useState<InspectionSession[]>([]);
  const [formTypeFilter, setFormTypeFilter] = useState<SelectProps.Option | null>(null);
  const [statusFilter, setStatusFilter] = useState<SelectProps.Option | null>(null);

  useEffect(() => {
    loadInspections();
  }, []);

  useEffect(() => {
    applyFilters();
  }, [inspections, formTypeFilter, statusFilter]);

  const loadInspections = () => {
    // Get all inspection sessions from localStorage
    const allInspections: InspectionSession[] = [];
    const keys = Object.keys(localStorage);
    
    keys.forEach((key) => {
      if (key === 'currentSession') {
        const sessionStr = localStorage.getItem(key);
        if (sessionStr) {
          try {
            const session: InspectionSession = JSON.parse(sessionStr);
            allInspections.push(session);
          } catch (error) {
            console.error(`Failed to parse session ${key}:`, error);
          }
        }
      } else if (key.startsWith('inspection_')) {
        const sessionStr = localStorage.getItem(key);
        if (sessionStr) {
          try {
            const session: InspectionSession = JSON.parse(sessionStr);
            allInspections.push(session);
          } catch (error) {
            console.error(`Failed to parse session ${key}:`, error);
          }
        }
      }
    });

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

  const getUploadStatusBadge = (status: UploadStatus | undefined) => {
    const badgeConfig: Record<UploadStatus, { color: string; label: string }> = {
      [UploadStatus.Local]: { color: 'blue', label: 'Local' },
      [UploadStatus.Uploading]: { color: 'yellow', label: 'Uploading' },
      [UploadStatus.Uploaded]: { color: 'green', label: 'Uploaded' },
      [UploadStatus.Failed]: { color: 'red', label: 'Failed' },
    };

    const config = badgeConfig[status || UploadStatus.Local];
    return <Badge color={config.color}>{config.label}</Badge>;
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

      <Container>
        <SpaceBetween size="m" direction="horizontal">
          <Select
            selectedOption={formTypeFilter}
            onChange={({ detail }) => setFormTypeFilter(detail.selectedOption)}
            options={formTypeOptions}
            placeholder="Filter by form type"
            labelText="Form Type"
          />
          <Select
            selectedOption={statusFilter}
            onChange={({ detail }) => setStatusFilter(detail.selectedOption)}
            options={statusOptions}
            placeholder="Filter by status"
            labelText="Status"
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
              <>No inspections found. <a href="#/new-inspection">Create a new inspection</a> to get started.</>
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
              },
              {
                id: 'formType',
                header: 'Form Type',
                cell: (item: InspectionSession) => FormTypeLabels[item.formType],
              },
              {
                id: 'uploadStatus',
                header: 'Status',
                cell: (item: InspectionSession) => getUploadStatusBadge(item.uploadStatus),
              },
              {
                id: 'sessionId',
                header: 'Session ID',
                cell: (item: InspectionSession) => item.id,
              },
              {
                id: 'actions',
                header: 'Actions',
                cell: (item: InspectionSession) => (
                  <SpaceBetween direction="horizontal" size="s">
                    <Button onClick={() => handleOpenInspection(item)}>Open</Button>
                    <Button onClick={() => handleDeleteInspection(item)}>Delete</Button>
                  </SpaceBetween>
                ),
              },
            ]}
            items={filteredInspections}
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
