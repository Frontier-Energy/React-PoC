import { useParams, useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { Header, Container, SpaceBetween, Button } from '@cloudscape-design/components';
import { InspectionSession, FormTypeLabels, FormSchema, FormType, FormData } from '../types';
import { FormRenderer } from '../components/FormRenderer';

export function FillForm() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const [session, setSession] = useState<InspectionSession | null>(null);
  const [formSchema, setFormSchema] = useState<FormSchema | null>(null);
  const [formData, setFormData] = useState<FormData>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const storedSession = localStorage.getItem('currentSession');
    if (storedSession) {
      const parsedSession: InspectionSession = JSON.parse(storedSession);
      if (parsedSession.id === sessionId) {
        setSession(parsedSession);
        loadFormSchema(parsedSession.formType);
      } else {
        navigate('/new-form');
      }
    } else {
      navigate('/new-form');
    }
    setLoading(false);
  }, [sessionId, navigate]);

  const loadFormSchema = async (formType: FormType) => {
    try {
      const schemaModule = await import(`../resources/${formType}.json`);
      setFormSchema(schemaModule.default);
    } catch (error) {
      console.error(`Failed to load form schema for ${formType}:`, error);
    }
  };

  const handleFieldChange = (fieldId: string, value: string | boolean | string[]) => {
    setFormData((prev) => ({
      ...prev,
      [fieldId]: value,
    }));
  };

  const handleSubmit = () => {
    console.log('Form submitted:', formData);
    // TODO: Save form data to backend or storage
  };

  const handleReset = () => {
    setFormData({});
  };

  if (loading || !session) {
    return <Header variant="h1">Loading...</Header>;
  }

  if (!formSchema) {
    return <Header variant="h1">Error loading form schema</Header>;
  }

  return (
    <SpaceBetween size="l">
      <Header variant="h1">{formSchema.formName}</Header>
      <Container>
        <SpaceBetween size="m">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div>
              <strong>Session ID:</strong> {session.id}
            </div>
            <div>
              <strong>Form Type:</strong> {FormTypeLabels[session.formType]}
            </div>
            <div>
              <strong>Name:</strong> {session.name || '(Not set)'}
            </div>
          </div>
        </SpaceBetween>
      </Container>

      <Container>
        <FormRenderer schema={formSchema} data={formData} onChange={handleFieldChange} />
      </Container>

      <Container>
        <SpaceBetween direction="horizontal" size="m">
          <Button onClick={handleReset}>Reset Form</Button>
          <Button variant="primary" onClick={handleSubmit}>
            Submit
          </Button>
          <Button onClick={() => navigate('/new-form')}>Cancel</Button>
        </SpaceBetween>
      </Container>
    </SpaceBetween>
  );
}
