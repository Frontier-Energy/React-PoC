import { useNavigate } from 'react-router-dom';
import { Header, Container, SpaceBetween, Button, Table, Box, Badge } from '@cloudscape-design/components';
import { useState, useEffect } from 'react';
import { InspectionSession, FormTypeLabels, UploadStatus } from '../types';

export function MyInspections() {
  const navigate = useNavigate();
  const [inspections, setInspections] = useState<InspectionSession[]>([]);
  const [selectedItems, setSelectedItems] = useState<InspectionSession[]>([]);

  useEffect(() => {
    loadInspections();
  }, []);

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

  return (
    <SpaceBetween size="l">
      <Header variant="h1">My Inspections</Header>
      
      {inspections.length === 0 ? (
        <Container>
          <Box textAlign="center" color="text-body-secondary">
            No inspections found. <a href="#/new-inspection">Create a new inspection</a> to get started.
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
            items={inspections}
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
