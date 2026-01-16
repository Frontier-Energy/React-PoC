import { useParams, useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { Header, Container, SpaceBetween, Button } from '@cloudscape-design/components';
import { InspectionSession, FormTypeLabels } from '../types';

export function FillForm() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const [session, setSession] = useState<InspectionSession | null>(null);

  useEffect(() => {
    const storedSession = localStorage.getItem('currentSession');
    if (storedSession) {
      const parsedSession: InspectionSession = JSON.parse(storedSession);
      if (parsedSession.id === sessionId) {
        setSession(parsedSession);
      } else {
        navigate('/new-form');
      }
    } else {
      navigate('/new-form');
    }
  }, [sessionId, navigate]);

  if (!session) {
    return <Header variant="h1">Loading...</Header>;
  }

  return (
    <SpaceBetween size="l">
      <Header variant="h1">Fill Form</Header>
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
          <Button onClick={() => navigate('/new-form')}>Back to New Form</Button>
        </SpaceBetween>
      </Container>
    </SpaceBetween>
  );
}
