import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Header, Select, SelectProps, Container, SpaceBetween, Button } from '@cloudscape-design/components';
import { FormType, FormTypeLabels, InspectionSession } from '../types';
import { v4 as uuidv4 } from 'uuid';

export function NewForm() {
  const [selectedFormType, setSelectedFormType] = useState<SelectProps.Option | null>(null);
  const navigate = useNavigate();

  const formTypeOptions: SelectProps.Option[] = Object.values(FormType).map((type) => ({
    label: FormTypeLabels[type],
    value: type,
  }));

  const handleCreateSession = () => {
    if (!selectedFormType || !selectedFormType.value) return;

    const session: InspectionSession = {
      id: uuidv4(),
      name: '',
      formType: selectedFormType.value as FormType,
    };

    localStorage.setItem('currentSession', JSON.stringify(session));
    navigate(`/fill-form/${session.id}`);
  };

  return (
    <SpaceBetween size="l">
      <Header variant="h1">New Form</Header>
      <Container>
        <SpaceBetween size="m">
          <Select
            selectedOption={selectedFormType}
            onChange={({ detail }) => setSelectedFormType(detail.selectedOption)}
            options={formTypeOptions}
            placeholder="Select a form type"
            labelText="Form Type"
          />
          <Button onClick={handleCreateSession} disabled={!selectedFormType}>
            Create Session
          </Button>
        </SpaceBetween>
      </Container>
    </SpaceBetween>
  );
}
