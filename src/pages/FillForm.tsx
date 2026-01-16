import { useParams, useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { Header, Container, SpaceBetween, Button } from '@cloudscape-design/components';
import { InspectionSession, FormTypeLabels, FormSchema, FormType } from '../types';

export function FillForm() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const [session, setSession] = useState<InspectionSession | null>(null);
  const [formSchema, setFormSchema] = useState<FormSchema | null>(null);
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

  if (loading || !session) {
    return <Header variant="h1">Loading...</Header>;
  }

  return (
    <SpaceBetween size="l">
      <Header variant="h1">{formSchema?.formName || 'Fill Form'}</Header>
      <Container>
        <SpaceBetween size="m">
          <div>
            <strong>Session ID:</strong> {session.id}
          </div>
          <div>
            <strong>Form Type:</strong> {FormTypeLabels[session.formType]}
          </div>
          <div>
            <strong>Name:</strong> {session.name || '(Not set)'}
          </div>
          {formSchema && (
            <div>
              <strong>Sections:</strong> {formSchema.sections.length}
            </div>
          )}
          <Button onClick={() => navigate('/new-form')}>Back to New Form</Button>
        </SpaceBetween>
      </Container>
    </SpaceBetween>
  );
}
