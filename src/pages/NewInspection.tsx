import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Header, Select, SelectProps, Container, SpaceBetween, Button } from '@cloudscape-design/components';
import { FormType, InspectionSession, UploadStatus } from '../types';
import { v4 as uuidv4 } from 'uuid';
import { getUserId } from '../auth';
import { useLocalization } from '../LocalizationContext';

export function NewInspection() {
  const [selectedFormType, setSelectedFormType] = useState<SelectProps.Option | null>(null);
  const navigate = useNavigate();
  const { labels } = useLocalization();

  const formTypeOptions: SelectProps.Option[] = Object.values(FormType).map((type) => ({
    label: labels.formTypes[type],
    value: type,
  }));

  const handleCreateSession = () => {
    if (!selectedFormType || !selectedFormType.value) return;

    const session: InspectionSession = {
      id: uuidv4(),
      name: '',
      formType: selectedFormType.value as FormType,
      uploadStatus: UploadStatus.InProgress,
      userId: getUserId() || undefined,
    };

    localStorage.setItem('currentSession', JSON.stringify(session));
    navigate(`/fill-form/${session.id}`);
  };

  return (
    <SpaceBetween size="l">
      <Header variant="h1">{labels.newInspection.title}</Header>
      <Container>
        <SpaceBetween size="m">
          <Select
            selectedOption={selectedFormType}
            onChange={({ detail }) => setSelectedFormType(detail.selectedOption)}
            options={formTypeOptions}
            placeholder={labels.newInspection.selectPlaceholder}
          />
          <Button onClick={handleCreateSession} disabled={!selectedFormType}>
            {labels.newInspection.createSession}
          </Button>
        </SpaceBetween>
      </Container>
    </SpaceBetween>
  );
}
