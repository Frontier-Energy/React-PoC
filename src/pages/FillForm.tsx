import { useParams, useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { Header, Container, SpaceBetween, Button } from '@cloudscape-design/components';
import { InspectionSession, FormTypeLabels, FormSchema, FormType, FormData } from '../types';
import { FormRenderer } from '../components/FormRenderer';

interface FormDataWithExternalID {
  [externalID: string]: string | boolean | string[];
}

export function FillForm() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const [session, setSession] = useState<InspectionSession | null>(null);
  const [formSchema, setFormSchema] = useState<FormSchema | null>(null);
  const [formData, setFormData] = useState<FormData>({});
  const [loading, setLoading] = useState(true);
  const [externalIDMap, setExternalIDMap] = useState<Record<string, string>>({});

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
      const schema = schemaModule.default;
      setFormSchema(schema);

      // Build externalID to fieldId map
      const map: Record<string, string> = {};
      schema.sections.forEach((section) => {
        section.fields.forEach((field) => {
          if (field.externalID) {
            map[field.externalID] = field.id;
          }
        });
      });
      setExternalIDMap(map);

      // Load form data after schema is loaded so we can map externalIDs
      if (sessionId) {
        loadFormData(sessionId, map);
      }
    } catch (error) {
      console.error(`Failed to load form schema for ${formType}:`, error);
    }
  };

  const loadFormData = (sessionId: string, map: Record<string, string>) => {
    const storedData = localStorage.getItem(`formData_${sessionId}`);
    if (storedData) {
      try {
        const parsedData: FormDataWithExternalID = JSON.parse(storedData);
        // Convert externalID keys back to fieldId keys for state
        const convertedData: FormData = {};
        Object.entries(parsedData).forEach(([externalID, value]) => {
          const fieldId = map[externalID];
          if (fieldId) {
            convertedData[fieldId] = value;
          }
        });
        setFormData(convertedData);
      } catch (error) {
        console.error('Failed to parse stored form data:', error);
      }
    }
  };

  const handleFieldChange = (fieldId: string, value: string | boolean | string[], externalID?: string) => {
    const newFormData: FormData = {
      ...formData,
      [fieldId]: value,
    };
    setFormData(newFormData);

    // Save to localStorage with externalID as key if available
    if (sessionId && externalID) {
      const storedData = localStorage.getItem(`formData_${sessionId}`);
      const parsedData: FormDataWithExternalID = storedData ? JSON.parse(storedData) : {};
      parsedData[externalID] = value;
      localStorage.setItem(`formData_${sessionId}`, JSON.stringify(parsedData));
    }
  };

  const handleSubmit = () => {
    console.log('Form submitted:', formData);
    // TODO: Save form data to backend or storage
  };

  const handleReset = () => {
    setFormData({});
    if (sessionId) {
      localStorage.removeItem(`formData_${sessionId}`);
    }
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
