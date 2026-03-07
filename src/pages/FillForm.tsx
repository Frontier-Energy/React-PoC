import { useParams, useNavigate } from 'react-router-dom';
import { useCallback, useEffect, useState, useRef } from 'react';
import { Header, Container, SpaceBetween, Alert, Box, Link, Input, FormField, Wizard, Checkbox } from '@cloudscape-design/components';
import { fetchFormSchema } from '../apiContent';
import { formatTemplate } from '../resources/translations';
import { InspectionSession, FormSchema, FormType, FormData, FormDataValue, UploadStatus, ConditionalVisibility, ValidationRule, FormSection, FormField as SchemaField } from '../types';
import { FormRenderer } from '../components/FormRenderer';
import { FormValidator, ValidationError } from '../utils/FormValidator';
import { formatFileValue, getFileReferences, isFormDataValueEmpty } from '../utils/formDataUtils';
import { saveFiles, deleteFiles } from '../utils/fileStorage';
import { useLocalization } from '../LocalizationContext';
import { inspectionRepository } from '../repositories/inspectionRepository';
import { syncQueue } from '../syncQueue';

export function FillForm() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const { labels } = useLocalization();
  const [session, setSession] = useState<InspectionSession | null>(null);
  const [formSchema, setFormSchema] = useState<FormSchema | null>(null);
  const [formData, setFormData] = useState<FormData>({});
  const [loading, setLoading] = useState(true);
  const [validationErrors, setValidationErrors] = useState<ValidationError[]>([]);
  const [activeStepIndex, setActiveStepIndex] = useState(0);
  const [reviewConfirmed, setReviewConfirmed] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const formRef = useRef<HTMLDivElement>(null);
  const errorAlertRef = useRef<HTMLDivElement>(null);
  const loadRequestIdRef = useRef(0);

  const loadFormData = useCallback((
    targetSessionId: string,
    map: Record<string, string>,
    inspection: Pick<InspectionSession, 'tenantId' | 'userId'>
  ) => {
    void inspectionRepository.loadFormData(targetSessionId, inspection).then((parsedData) => {
      if (parsedData) {
        const convertedData: FormData = {};
        Object.entries(parsedData).forEach(([key, value]) => {
          const fieldId = map[key] || key;
          convertedData[fieldId] = value;
        });
        setFormData(convertedData);
      }
    });
  }, []);

  const loadFormSchema = useCallback(async (
    formType: FormType,
    inspection: Pick<InspectionSession, 'tenantId' | 'userId'>,
    requestId: number,
    targetSessionId: string
  ) => {
    try {
      const schema = await fetchFormSchema(formType);
      if (requestId !== loadRequestIdRef.current) {
        return;
      }

      setFormSchema(schema);

      const map: Record<string, string> = {};
      schema.sections.forEach((section: FormSection) => {
        section.fields.forEach((field: SchemaField) => {
          if (field.externalID) {
            map[field.externalID] = field.id;
          }
        });
      });

      if (requestId === loadRequestIdRef.current) {
        loadFormData(targetSessionId, map, inspection);
      }
    } catch (error) {
      if (requestId !== loadRequestIdRef.current) {
        return;
      }
      console.error(`Failed to load form schema for ${formType}:`, error);
    }
  }, [loadFormData]);

  useEffect(() => {
    const requestId = ++loadRequestIdRef.current;

    const initialize = async () => {
      setLoading(true);
      setFormSchema(null);
      setFormData({});
      setValidationErrors([]);
      setReviewConfirmed(false);
      setReviewError(null);

      if (!sessionId) {
        navigate('/new-inspection');
        if (requestId === loadRequestIdRef.current) {
          setLoading(false);
        }
        return;
      }

      const resolvedSession = await inspectionRepository.loadCurrentOrById(sessionId);
      if (!resolvedSession) {
        navigate('/new-inspection');
        if (requestId === loadRequestIdRef.current) {
          setLoading(false);
        }
        return;
      }

      if (requestId === loadRequestIdRef.current) {
        setSession(resolvedSession);
      }

      await loadFormSchema(resolvedSession.formType, resolvedSession, requestId, sessionId);

      if (requestId === loadRequestIdRef.current) {
        setLoading(false);
      }
    };

    void initialize();

    return () => {
      loadRequestIdRef.current += 1;
    };
  }, [sessionId, navigate, loadFormSchema]);

  const updateFieldValue = (fieldId: string, value: FormDataValue | undefined, externalID?: string) => {
    const newFormData: FormData = { ...formData };
    if (value === undefined) {
      delete newFormData[fieldId];
    } else {
      newFormData[fieldId] = value;
    }
    setFormData(newFormData);

    // Save persisted data using externalID when available, otherwise fieldId.
    if (sessionId && session) {
      const storageKey = externalID || fieldId;
      void inspectionRepository.updateFormDataEntry(sessionId, storageKey, value, session);
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
      void (async () => {
        const updatedSession: InspectionSession = {
          ...session,
          uploadStatus: UploadStatus.Local,
        };
        await inspectionRepository.saveAsCurrent(updatedSession);
        await syncQueue.enqueue(updatedSession, formData);
        window.dispatchEvent(new CustomEvent('inspection-status-changed', { detail: updatedSession }));

        console.log('Form submitted:', formData);

        navigate('/my-inspections', {
          state: {
            successMessage: labels.fillForm.successMessage,
          },
        });
      })();
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
    if (sessionId && session) {
      await inspectionRepository.clearFormData(sessionId, session);
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
      void inspectionRepository.saveAsCurrent(updatedSession);
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
            stepNumberLabel: (stepNumber) =>
              formatTemplate(labels.fillForm.wizard.stepNumberLabel, { stepNumber }),
            collapsedStepsLabel: (stepNumber, stepsCount) =>
              formatTemplate(labels.fillForm.wizard.collapsedStepsLabel, { stepNumber, stepsCount }),
            skipToButtonLabel: (step, stepNumber) =>
              formatTemplate(labels.fillForm.wizard.skipToButtonLabel, {
                title: step.title,
                stepNumber,
              }),
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
