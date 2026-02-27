import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Header, Select, SelectProps, Container, SpaceBetween, Button } from '@cloudscape-design/components';
import { InspectionSession, UploadStatus } from '../types';
import { v4 as uuidv4 } from 'uuid';
import { useLocalization } from '../LocalizationContext';
import { useTenantBootstrap } from '../TenantBootstrapContext';

export function NewForm() {
  const [selectedFormType, setSelectedFormType] = useState<SelectProps.Option | null>(null);
  const navigate = useNavigate();
  const { labels } = useLocalization();
  const { config } = useTenantBootstrap();

  const formTypeOptions: SelectProps.Option[] = config.enabledForms.map((type) => ({
    label: labels.formTypes[type],
    value: type,
  }));

  const handleCreateSession = () => {
    if (!selectedFormType || !selectedFormType.value) return;

    const session: InspectionSession = {
      id: uuidv4(),
      name: '',
      formType: selectedFormType.value as InspectionSession['formType'],
      uploadStatus: UploadStatus.Local,
    };

    localStorage.setItem('currentSession', JSON.stringify(session));
    navigate(`/fill-form/${session.id}`);
  };

  return (
    <SpaceBetween size="l">
      <Header variant="h1">{labels.newForm.title}</Header>
      <Container>
        <SpaceBetween size="m">
          <Select
            selectedOption={selectedFormType}
            onChange={({ detail }) => setSelectedFormType(detail.selectedOption)}
            options={formTypeOptions}
            placeholder={labels.newForm.selectPlaceholder}
          />
          <Button onClick={handleCreateSession} disabled={!selectedFormType}>
            {labels.newForm.createSession}
          </Button>
        </SpaceBetween>
      </Container>
    </SpaceBetween>
  );
}
