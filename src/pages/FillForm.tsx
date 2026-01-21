import { useParams, useNavigate } from 'react-router-dom';
import { useEffect, useState, useRef } from 'react';
import { Header, Container, SpaceBetween, Button, Alert, Box, Link, Input, FormField, Flashbar, FlashbarProps } from '@cloudscape-design/components';
import { InspectionSession, FormTypeLabels, FormSchema, FormType, FormData, FormDataValue, UploadStatus } from '../types';
import { FormRenderer } from '../components/FormRenderer';
import { FormValidator, ValidationError } from '../utils/FormValidator';
import { getFileReferences } from '../utils/formDataUtils';
import { saveFiles, deleteFiles } from '../utils/fileStorage';

interface FormDataWithExternalID {
  [externalID: string]: FormDataValue;
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
      schema.sections.forEach((section: any) => {
        section.fields.forEach((field: any) => {
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

  const updateFieldValue = (fieldId: string, value: FormDataValue | undefined, externalID?: string) => {
    const newFormData: FormData = { ...formData };
    if (value === undefined) {
      delete newFormData[fieldId];
    } else {
      newFormData[fieldId] = value;
    }
    setFormData(newFormData);

    // Save to localStorage with externalID as key if available
    if (sessionId && externalID) {
      const storedData = localStorage.getItem(`formData_${sessionId}`);
      const parsedData: FormDataWithExternalID = storedData ? JSON.parse(storedData) : {};
      if (value === undefined) {
        delete parsedData[externalID];
      } else {
        parsedData[externalID] = value;
      }
      localStorage.setItem(`formData_${sessionId}`, JSON.stringify(parsedData));
    }

    // Clear validation errors for this field
    setValidationErrors((prev) => prev.filter((err) => err.fieldId !== fieldId));
  };

  const handleFieldChange = (fieldId: string, value: FormDataValue, externalID?: string) => {
    updateFieldValue(fieldId, value, externalID);
  };

  const handleFileChange = async (fieldId: string, files: File[], externalID?: string) => {
    const existingFiles = getFileReferences(formData[fieldId]);
    if (existingFiles.length > 0) {
      await deleteFiles(existingFiles.map((file) => file.id));
    }

    if (files.length === 0) {
      updateFieldValue(fieldId, undefined, externalID);
      return;
    }

    const savedFiles = await saveFiles(files, { sessionId, fieldId });
    const field = formSchema?.sections
      .flatMap((section) => section.fields)
      .find((item) => item.id === fieldId);
    const value = field?.multiple ? savedFiles : savedFiles[0];
    updateFieldValue(fieldId, value, externalID);
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
      // Keep new inspections from uploading automatically.
      const updatedSession: InspectionSession = {
        ...session,
        uploadStatus: UploadStatus.InProgress,
      };
      // Store in both places for persistence
      localStorage.setItem('currentSession', JSON.stringify(updatedSession));
      localStorage.setItem(`inspection_${session.id}`, JSON.stringify(updatedSession));

      console.log('Form submitted:', formData);

      // Redirect to my inspections with success message
      navigate('/my-inspections', {
        state: {
          successMessage: 'Inspection saved successfully and stored locally.',
        },
      });
    }
  };

  const handleSave = () => {
    if (!session) {
      return;
    }

    const updatedSession: InspectionSession = {
      ...session,
    };

    localStorage.setItem('currentSession', JSON.stringify(updatedSession));
    localStorage.setItem(`inspection_${session.id}`, JSON.stringify(updatedSession));
    navigate('/my-inspections', {
      state: {
        successMessage: 'Inspection saved successfully.',
      },
    });
  };

  const handleReset = async () => {
    const fileIds = Object.values(formData)
      .flatMap((value) => getFileReferences(value))
      .map((file) => file.id);
    if (fileIds.length > 0) {
      await deleteFiles(fileIds);
    }
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
          <div ref={errorAlertRef}>
            <Container>
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
          </div>
        )}

        <Container>
          <FormRenderer
            schema={formSchema}
            data={formData}
            onChange={handleFieldChange}
            onFileChange={handleFileChange}
          />
        </Container>

        <Container>
          <SpaceBetween direction="horizontal" size="m">
            <Button onClick={handleReset}>Reset Form</Button>
            <Button onClick={handleSave}>Save</Button>
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
