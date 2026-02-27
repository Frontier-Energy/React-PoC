import { useParams, useNavigate } from 'react-router-dom';
import { useEffect, useState, useRef } from 'react';
import { Header, Container, SpaceBetween, Alert, Box, Link, Input, FormField, Wizard, Checkbox } from '@cloudscape-design/components';
import { InspectionSession, FormSchema, FormType, FormData, FormDataValue, UploadStatus, ConditionalVisibility, ValidationRule, FormSection, FormField as SchemaField } from '../types';
import { FormRenderer } from '../components/FormRenderer';
import { FormValidator, ValidationError } from '../utils/FormValidator';
import { formatFileValue, getFileReferences, isFormDataValueEmpty } from '../utils/formDataUtils';
import { saveFiles, deleteFiles } from '../utils/fileStorage';
import { useLocalization } from '../LocalizationContext';

interface PersistedFormData {
  [key: string]: FormDataValue;
}

export function FillForm() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const { labels } = useLocalization();
  const [session, setSession] = useState<InspectionSession | null>(null);
  const [formSchema, setFormSchema] = useState<FormSchema | null>(null);
  const [formData, setFormData] = useState<FormData>({});
  const [loading, setLoading] = useState(true);
  const [externalIDMap, setExternalIDMap] = useState<Record<string, string>>({});
  const [validationErrors, setValidationErrors] = useState<ValidationError[]>([]);
  const [activeStepIndex, setActiveStepIndex] = useState(0);
  const [reviewConfirmed, setReviewConfirmed] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const formRef = useRef<HTMLDivElement>(null);
  const errorAlertRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!sessionId) {
      navigate('/new-inspection');
      setLoading(false);
      return;
    }

    const loadSession = (): InspectionSession | null => {
      const parseSession = (raw: string | null): InspectionSession | null => {
        if (!raw) return null;
        try {
          return JSON.parse(raw) as InspectionSession;
        } catch (error) {
          console.error('Failed to parse stored inspection session:', error);
          return null;
        }
      };

      const currentSession = parseSession(localStorage.getItem('currentSession'));
      if (currentSession?.id === sessionId) {
        return currentSession;
      }

      return parseSession(localStorage.getItem(`inspection_${sessionId}`));
    };

    const resolvedSession = loadSession();
    if (resolvedSession) {
      setSession(resolvedSession);
      loadFormSchema(resolvedSession.formType);
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
      schema.sections.forEach((section: FormSection) => {
        section.fields.forEach((field: SchemaField) => {
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
        const parsedData: PersistedFormData = JSON.parse(storedData);
        // Convert persisted keys to fieldId keys for state. Keys can be externalID or fieldId.
        const convertedData: FormData = {};
        Object.entries(parsedData).forEach(([key, value]) => {
          const fieldId = map[key] || key;
          convertedData[fieldId] = value;
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

    // Save to localStorage using externalID when available, otherwise fieldId.
    if (sessionId) {
      const storageKey = externalID || fieldId;
      const storedData = localStorage.getItem(`formData_${sessionId}`);
      const parsedData: PersistedFormData = storedData ? JSON.parse(storedData) : {};
      if (value === undefined) {
        delete parsedData[storageKey];
      } else {
        parsedData[storageKey] = value;
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

  const validateForm = (): ValidationError[] => {
    if (!formSchema) return [];

    // Build validation rules map and required fields list
    const validationRulesMap: Record<string, ValidationRule[] | undefined> = {};
    const requiredFields: string[] = [];
    const visibilityRulesMap: Record<string, ConditionalVisibility[] | undefined> = {};

    formSchema.sections.forEach((section) => {
      section.fields.forEach((field) => {
        if (field.validationRules) {
          validationRulesMap[field.id] = field.validationRules;
        }
        if (field.required) {
          requiredFields.push(field.id);
        }
        if (field.visibleWhen) {
          visibilityRulesMap[field.id] = field.visibleWhen;
        }
      });
    });

    // Validate form
    const validationErrors = FormValidator.validateForm(
      formData,
      validationRulesMap,
      requiredFields,
      visibilityRulesMap
    );
    if (!session?.name.trim()) {
      validationErrors.unshift({
        fieldId: 'sessionName',
        message: labels.fillForm.sessionNameRequired,
      });
    }
    setValidationErrors(validationErrors);

    return validationErrors;
  };

  const handleSubmit = () => {
    const errors = validateForm();
    
    if (errors.length > 0) {
      const firstErrorField = errors[0].fieldId;
      const stepIndex = getSectionIndexForField(firstErrorField);
      setActiveStepIndex(stepIndex);
      // Scroll to top of the page immediately
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    if (!reviewConfirmed) {
      setReviewError(labels.fillForm.confirmDetailsError);
      return;
    }

    if (session) {
      const updatedSession: InspectionSession = {
        ...session,
        uploadStatus: UploadStatus.Local,
      };
      // Store in both places for persistence
      localStorage.setItem('currentSession', JSON.stringify(updatedSession));
      localStorage.setItem(`inspection_${session.id}`, JSON.stringify(updatedSession));

      console.log('Form submitted:', formData);

      // Redirect to my inspections with success message
      navigate('/my-inspections', {
        state: {
          successMessage: labels.fillForm.successMessage,
        },
      });
    }
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
    setReviewConfirmed(false);
    setReviewError(null);
  };

  const handleErrorClick = (fieldId: string) => {
    // Find the field element and scroll to it
    if (fieldId === 'sessionName') {
      setActiveStepIndex(0);
    } else {
      const stepIndex = formSchema ? getSectionIndexForField(fieldId) : 0;
      setActiveStepIndex(stepIndex);
    }
    window.setTimeout(() => {
      const fieldElement = document.getElementById(`field-${fieldId}`);
      if (fieldElement) {
        fieldElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
        fieldElement.focus();
      }
    }, 0);
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
    setValidationErrors((prev) => prev.filter((err) => err.fieldId !== 'sessionName'));
  };

  const getSectionIndexForField = (fieldId: string) => {
    if (!formSchema) return 0;
    const index = formSchema.sections.findIndex((section) =>
      section.fields.some((field) => field.id === fieldId)
    );
    return index === -1 ? 0 : index;
  };

  const formatReviewValue = (fieldId: string, value: FormDataValue | undefined) => {
    if (isFormDataValueEmpty(value)) {
      return labels.common.notProvided;
    }
    const field = formSchema?.sections
      .flatMap((section) => section.fields)
      .find((item) => item.id === fieldId);
    const fileLabel = formatFileValue(value);
    if (fileLabel) {
      return fileLabel;
    }
    if (field?.options) {
      if (Array.isArray(value)) {
        const labels = value
          .map((item) => field.options?.find((opt) => opt.value === item)?.label || item)
          .join(', ');
        return labels;
      }
      const label = field.options.find((opt) => opt.value === value)?.label;
      if (label) {
        return label;
      }
    }
    if (typeof value === 'boolean') {
      return value ? labels.common.yes : labels.common.no;
    }
    if (Array.isArray(value)) {
      return value.join(', ');
    }
    return String(value);
  };

  if (loading || !session) {
    return <Header variant="h1">{labels.fillForm.loading}</Header>;
  }

  if (!formSchema) {
    return <Header variant="h1">{labels.fillForm.errorLoadingSchema}</Header>;
  }

  const reviewStepContent = (
    <SpaceBetween size="l">
      {reviewError && (
        <Alert type="error" header={labels.fillForm.review.confirmationRequiredHeader}>
          {reviewError}
        </Alert>
      )}
      <Container header={<Header variant="h2">{labels.fillForm.review.sessionDetailsHeader}</Header>}>
        <SpaceBetween size="s">
          <Box>
            <strong>{labels.fillForm.sessionNameLabel}:</strong> {session.name}
          </Box>
          <Box>
            <strong>{labels.fillForm.sessionIdLabel}:</strong> {session.id}
          </Box>
          <Box>
            <strong>{labels.fillForm.formTypeLabel}:</strong> {labels.formTypes[session.formType]}
          </Box>
        </SpaceBetween>
      </Container>
      {formSchema.sections.map((section, sectionIndex) => (
        <Container key={sectionIndex} header={<Header variant="h2">{section.title}</Header>}>
          <SpaceBetween size="s">
            {section.fields.map((field) => (
              <Box key={field.id}>
                <strong>{field.label}:</strong> {formatReviewValue(field.id, formData[field.id])}
              </Box>
            ))}
          </SpaceBetween>
        </Container>
      ))}
      <FormField label={labels.fillForm.review.finalConfirmationLabel}>
        <Checkbox
          checked={reviewConfirmed}
          onChange={(event) => {
            setReviewConfirmed(event.detail.checked);
            if (event.detail.checked) {
              setReviewError(null);
            }
          }}
        >
          {labels.fillForm.review.finalConfirmationText}
        </Checkbox>
      </FormField>
    </SpaceBetween>
  );

  return (
    <div ref={formRef}>
      <SpaceBetween size="l">
        <Header variant="h1">{formSchema.formName}</Header>
        <Container>
          <SpaceBetween size="m">
            <FormField label={labels.fillForm.sessionNameLabel} stretch>
              <Input
                id="field-sessionName"
                value={session.name}
                onChange={(event) => handleSessionNameChange(event.detail.value)}
                placeholder={labels.fillForm.sessionNamePlaceholder}
              />
            </FormField>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div>
                <strong>{labels.fillForm.sessionIdLabel}:</strong> {session.id}
              </div>
              <div>
                <strong>{labels.fillForm.formTypeLabel}:</strong> {labels.formTypes[session.formType]}
              </div>
            </div>
          </SpaceBetween>
        </Container>

        {validationErrors.length > 0 && (
          <div ref={errorAlertRef}>
            <Container>
              <Alert type="error" header={labels.fillForm.formValidationErrorsHeader}>
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

        <Wizard
          activeStepIndex={activeStepIndex}
          onNavigate={(event) => setActiveStepIndex(event.detail.requestedStepIndex)}
          onCancel={() => navigate('/new-inspection')}
          onSubmit={handleSubmit}
          steps={[
            ...formSchema.sections.map((section) => ({
              title: section.title,
              content: (
                <Container>
                  <FormRenderer
                    schema={{ ...formSchema, sections: [section] }}
                    data={formData}
                    onChange={handleFieldChange}
                    onFileChange={handleFileChange}
                    showSectionTitles={false}
                  />
                </Container>
              ),
            })),
            {
              title: labels.fillForm.reviewStepTitle,
              content: reviewStepContent,
            },
          ]}
          i18nStrings={{
            stepNumberLabel: (stepNumber) => labels.fillForm.wizard.stepNumberLabel(stepNumber),
            collapsedStepsLabel: (stepNumber, stepsCount) =>
              labels.fillForm.wizard.collapsedStepsLabel(stepNumber, stepsCount),
            skipToButtonLabel: (step, stepNumber) =>
              labels.fillForm.wizard.skipToButtonLabel(step.title, stepNumber),
            navigationAriaLabel: labels.fillForm.wizard.navigationAriaLabel,
            cancelButton: labels.fillForm.wizard.cancelButton,
            previousButton: labels.fillForm.wizard.previousButton,
            nextButton: labels.fillForm.wizard.nextButton,
            submitButton: labels.fillForm.wizard.submitButton,
          }}
        />
        <Container>
          <SpaceBetween direction="horizontal" size="m">
            <Link onFollow={handleReset}>{labels.fillForm.resetForm}</Link>
          </SpaceBetween>
        </Container>
      </SpaceBetween>
    </div>
  );
}
