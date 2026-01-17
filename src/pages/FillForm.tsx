import { useParams, useNavigate } from 'react-router-dom';
import { useEffect, useState, useRef } from 'react';
import { Header, Container, SpaceBetween, Button, Alert, Box, Link, Input, FormField, Flashbar, FlashbarProps } from '@cloudscape-design/components';
import { InspectionSession, FormTypeLabels, FormSchema, FormType, FormData, UploadStatus } from '../types';
import { FormRenderer } from '../components/FormRenderer';
import { FormValidator, ValidationError } from '../utils/FormValidator';

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
  const [validationErrors, setValidationErrors] = useState<ValidationError[]>([]);
  const formRef = useRef<HTMLDivElement>(null);
  const errorAlertRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const storedSession = localStorage.getItem('currentSession');
    if (storedSession) {
      const parsedSession: InspectionSession = JSON.parse(storedSession);
      if (parsedSession.id === sessionId) {
        setSession(parsedSession);
        loadFormSchema(parsedSession.formType);
      } else {
        navigate('/new-inspection');
      }
    } else {
      navigate('/new-inspection');
    }
    setLoading(false);
  }, [sessionId, navigate]);

  const loadFormSchema = async (formType: FormType) => {
    try {
      const schemaModule = await import(`../resources/${formType}.json`);
      const schema = schemaModule.default;
      setFormSchema(schema);

      // Build externalID to fieldId map and validation rules map
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

    // Clear validation errors for this field
    setValidationErrors((prev) => prev.filter((err) => err.fieldId !== fieldId));
  };

  const validateForm = (): boolean => {
    if (!formSchema) return false;

    const errors: ValidationError[] = [];

    // Build validation rules map and required fields list
    const validationRulesMap: Record<string, any[] | undefined> = {};
    const requiredFields: string[] = [];

    formSchema.sections.forEach((section) => {
      section.fields.forEach((field) => {
        if (field.validationRules) {
          validationRulesMap[field.id] = field.validationRules;
        }
        if (field.required) {
          requiredFields.push(field.id);
        }
      });
    });

    // Validate form
    const validationErrors = FormValidator.validateForm(formData, validationRulesMap, requiredFields);
    setValidationErrors(validationErrors);

    return validationErrors.length === 0;
  };

  const handleSubmit = () => {
    const isValid = validateForm();
    
    if (!isValid) {
      // Scroll to top of the page immediately
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    if (session) {
      // Update session status to uploading
      const updatedSession: InspectionSession = {
        ...session,
        uploadStatus: UploadStatus.Uploading,
      };
      // Store in both places for persistence
      localStorage.setItem('currentSession', JSON.stringify(updatedSession));
      localStorage.setItem(`inspection_${session.id}`, JSON.stringify(updatedSession));

      // Simulate upload delay and show success
      setTimeout(() => {
        // In a real app, this would be where you upload to backend
        console.log('Form submitted:', formData);
        
        // Update session status to uploaded (simulated)
        const finalSession: InspectionSession = {
          ...updatedSession,
          uploadStatus: UploadStatus.Uploaded,
        };
        localStorage.setItem('currentSession', JSON.stringify(finalSession));
        localStorage.setItem(`inspection_${session.id}`, JSON.stringify(finalSession));
        
        // Redirect to my inspections with success message
        navigate('/my-inspections', { 
          state: { 
            successMessage: 'Inspection saved successfully. It will upload in the background if you have a persistent internet connection.' 
          } 
        });
      }, 500);
    }
  };

  const handleReset = () => {
    setFormData({});
    setValidationErrors([]);
    if (sessionId) {
      localStorage.removeItem(`formData_${sessionId}`);
    }
  };

  const handleErrorClick = (fieldId: string) => {
    // Find the field element and scroll to it
    const fieldElement = document.getElementById(`field-${fieldId}`);
    if (fieldElement) {
      fieldElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
      fieldElement.focus();
    }
  };

  const handleSessionNameChange = (name: string) => {
    if (session) {
      const updatedSession: InspectionSession = {
        ...session,
        name,
      };
      setSession(updatedSession);
      localStorage.setItem('currentSession', JSON.stringify(updatedSession));
      localStorage.setItem(`inspection_${session.id}`, JSON.stringify(updatedSession));
    }
  };

  if (loading || !session) {
    return <Header variant="h1">Loading...</Header>;
  }

  if (!formSchema) {
    return <Header variant="h1">Error loading form schema</Header>;
  }

  return (
    <div ref={formRef}>
      <SpaceBetween size="l">
        <Header variant="h1">{formSchema.formName}</Header>
        <Container>
          <SpaceBetween size="m">
            <FormField label="Session Name" stretch>
              <Input
                value={session.name}
                onChange={(event) => handleSessionNameChange(event.detail.value)}
                placeholder="Enter a name for this inspection session"
              />
            </FormField>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div>
                <strong>Session ID:</strong> {session.id}
              </div>
              <div>
                <strong>Form Type:</strong> {FormTypeLabels[session.formType]}
              </div>
            </div>
          </SpaceBetween>
        </Container>

        {validationErrors.length > 0 && (
          <Container ref={errorAlertRef}>
            <Alert type="error" header="Form Validation Errors">
              <SpaceBetween size="xs" direction="vertical">
                {validationErrors.map((error, index) => (
                  <Box key={index}>
                    <Link onFollow={() => handleErrorClick(error.fieldId)}>
                      {error.fieldId}: {error.message}
                    </Link>
                  </Box>
                ))}
              </SpaceBetween>
            </Alert>
          </Container>
        )}

        <Container>
          <FormRenderer schema={formSchema} data={formData} onChange={handleFieldChange} />
        </Container>

        <Container>
          <SpaceBetween direction="horizontal" size="m">
            <Button onClick={handleReset}>Reset Form</Button>
            <Button variant="primary" onClick={handleSubmit}>
              Submit
            </Button>
            <Button onClick={() => navigate('/new-inspection')}>Cancel</Button>
          </SpaceBetween>
        </Container>
      </SpaceBetween>
    </div>
  );
}
