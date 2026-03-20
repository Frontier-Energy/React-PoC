import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { inspectionApplicationService } from '../../application/inspectionApplicationService';
import { fetchFormSchema } from '../../apiContent';
import { markInspectionEdited } from '../../domain/inspectionSync';
import { useLocalization } from '../../LocalizationContext';
import { platform } from '@platform';
import { inspectionRepository } from '../../repositories/inspectionRepository';
import {
  type ConditionalVisibility,
  type FormData,
  type FormDataValue,
  type FormField as SchemaField,
  type FormSchema,
  type FormSection,
  type FormType,
  type InspectionSession,
  type ValidationRule,
} from '../../types';
import { FormValidator, type ValidationError } from '../../utils/FormValidator';
import { formatFileValue, isFormDataValueEmpty } from '../../utils/formDataUtils';

interface FillFormWorkflowResult {
  loading: boolean;
  session: InspectionSession | null;
  formSchema: FormSchema | null;
  schemaError: string | null;
  formData: FormData;
  validationErrors: ValidationError[];
  activeStepIndex: number;
  reviewConfirmed: boolean;
  reviewError: string | null;
  setActiveStepIndex: (index: number) => void;
  handleFieldChange: (fieldId: string, value: FormDataValue, externalID?: string) => void;
  handleFileChange: (fieldId: string, files: File[], externalID?: string) => Promise<void>;
  handleSubmit: () => void;
  handleReset: () => Promise<void>;
  handleErrorClick: (fieldId: string) => void;
  handleCancel: () => void;
  handleSessionNameChange: (name: string) => void;
  handleReviewConfirmedChange: (checked: boolean) => void;
  formatReviewValue: (fieldId: string, value: FormDataValue | undefined) => string;
}

const buildExternalIdMap = (schema: FormSchema) => {
  const map: Record<string, string> = {};
  schema.sections.forEach((section: FormSection) => {
    section.fields.forEach((field: SchemaField) => {
      if (field.externalID) {
        map[field.externalID] = field.id;
      }
    });
  });
  return map;
};

const buildValidationContext = (schema: FormSchema) => {
  const validationRulesMap: Record<string, ValidationRule[] | undefined> = {};
  const requiredFields: string[] = [];
  const visibilityRulesMap: Record<string, ConditionalVisibility[] | undefined> = {};

  schema.sections.forEach((section) => {
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

  return { validationRulesMap, requiredFields, visibilityRulesMap };
};

const getErrorMessage = (error: unknown): string => {
  if (!(error instanceof Error)) {
    return 'Unknown error';
  }

  const messages: string[] = [];
  let current: unknown = error;
  while (current instanceof Error) {
    if (current.message && !messages.includes(current.message)) {
      messages.push(current.message);
    }
    current = (current as Error & { cause?: unknown }).cause;
  }

  return messages.join(' Caused by: ');
};

export function useFillFormWorkflow(): FillFormWorkflowResult {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const { labels } = useLocalization();
  const [session, setSession] = useState<InspectionSession | null>(null);
  const [formSchema, setFormSchema] = useState<FormSchema | null>(null);
  const [schemaError, setSchemaError] = useState<string | null>(null);
  const [formData, setFormData] = useState<FormData>({});
  const [loading, setLoading] = useState(true);
  const [validationErrors, setValidationErrors] = useState<ValidationError[]>([]);
  const [activeStepIndex, setActiveStepIndex] = useState(0);
  const [reviewConfirmed, setReviewConfirmed] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const loadRequestIdRef = useRef(0);
  const formDataRef = useRef<FormData>({});
  const fileChangeChainRef = useRef<Promise<void>>(Promise.resolve());
  const getSectionIndexForField = useCallback((fieldId: string) => {
    if (!formSchema) {
      return 0;
    }

    const sectionIndex = formSchema.sections.findIndex((section) =>
      section.fields.some((field) => field.id === fieldId)
    );
    return sectionIndex === -1 ? 0 : sectionIndex;
  }, [formSchema]);

  const loadFormData = useCallback(async (
    targetSessionId: string,
    externalIdMap: Record<string, string>,
    inspection: Pick<InspectionSession, 'tenantId' | 'userId'>,
    requestId: number
  ) => {
    const storedData = await inspectionRepository.loadFormData(targetSessionId, inspection);
    if (!storedData || requestId !== loadRequestIdRef.current) {
      return;
    }

    const nextFormData: FormData = {};
    Object.entries(storedData).forEach(([key, value]) => {
      nextFormData[externalIdMap[key] || key] = value;
    });
    formDataRef.current = nextFormData;
    setFormData(nextFormData);
  }, []);

  const loadSchemaForSession = useCallback(async (
    formType: FormType,
    inspection: Pick<InspectionSession, 'tenantId' | 'userId'>,
    requestId: number,
    targetSessionId: string
  ) => {
    try {
      const schema = await fetchFormSchema(formType, inspection.tenantId);
      if (requestId !== loadRequestIdRef.current) {
        return;
      }

      setFormSchema(schema);
      setSchemaError(null);
      await loadFormData(targetSessionId, buildExternalIdMap(schema), inspection, requestId);
    } catch (error) {
      if (requestId !== loadRequestIdRef.current) {
        return;
      }

      const nextSchemaError = getErrorMessage(error);
      setSchemaError(nextSchemaError);
      console.error(`Failed to load form schema for ${formType}:`, error);
    }
  }, [loadFormData]);

  useEffect(() => {
    const requestId = ++loadRequestIdRef.current;

    const initialize = async () => {
      setLoading(true);
      setSession(null);
      setFormSchema(null);
      setSchemaError(null);
      formDataRef.current = {};
      setFormData({});
      setValidationErrors([]);
      setActiveStepIndex(0);
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

      await loadSchemaForSession(resolvedSession.formType, resolvedSession, requestId, sessionId);

      if (requestId === loadRequestIdRef.current) {
        setLoading(false);
      }
    };

    void initialize();

    return () => {
      loadRequestIdRef.current += 1;
    };
  }, [sessionId, navigate, loadSchemaForSession]);

  const updateFieldValue = useCallback((fieldId: string, value: FormDataValue | undefined, externalID?: string) => {
    setFormData((currentFormData) => {
      const nextFormData = { ...currentFormData };
      if (value === undefined) {
        delete nextFormData[fieldId];
      } else {
        nextFormData[fieldId] = value;
      }
      formDataRef.current = nextFormData;
      return nextFormData;
    });

    if (sessionId && session) {
      void inspectionApplicationService.saveDraftFieldValue(sessionId, session, fieldId, value, externalID);
    }

    setValidationErrors((currentErrors) => currentErrors.filter((error) => error.fieldId !== fieldId));
  }, [session, sessionId]);

  const handleFieldChange = useCallback((fieldId: string, value: FormDataValue, externalID?: string) => {
    updateFieldValue(fieldId, value, externalID);
  }, [updateFieldValue]);

  const handleFileChange = useCallback((fieldId: string, files: File[], externalID?: string) => {
    const nextOperation = fileChangeChainRef.current.catch(() => undefined).then(async () => {
      const field = formSchema?.sections
        .flatMap((section) => section.fields)
        .find((item) => item.id === fieldId);
      const nextValue = await inspectionApplicationService.replaceDraftFiles({
        sessionId,
        inspection: session,
        fieldId,
        currentValue: formDataRef.current[fieldId],
        files,
        multiple: field?.multiple,
        externalId: externalID,
      });
      setFormData((currentFormData) => {
        const nextFormData = { ...currentFormData };
        if (nextValue === undefined) {
          delete nextFormData[fieldId];
        } else {
          nextFormData[fieldId] = nextValue;
        }
        formDataRef.current = nextFormData;
        return nextFormData;
      });
      setValidationErrors((currentErrors) => currentErrors.filter((error) => error.fieldId !== fieldId));
    });
    fileChangeChainRef.current = nextOperation;
    return nextOperation;
  }, [formSchema, session, sessionId]);

  const validateForm = useCallback(() => {
    if (!formSchema) {
      return [];
    }

    const { validationRulesMap, requiredFields, visibilityRulesMap } = buildValidationContext(formSchema);
    const nextValidationErrors = FormValidator.validateForm(
      formData,
      validationRulesMap,
      requiredFields,
      visibilityRulesMap
    );

    if (!session?.name.trim()) {
      nextValidationErrors.unshift({
        fieldId: 'sessionName',
        message: labels.fillForm.sessionNameRequired,
      });
    }

    setValidationErrors(nextValidationErrors);
    return nextValidationErrors;
  }, [formData, formSchema, labels.fillForm.sessionNameRequired, session]);

  const handleSubmit = useCallback(() => {
    const errors = validateForm();
    if (errors.length > 0) {
      setActiveStepIndex(getSectionIndexForField(errors[0].fieldId));
      platform.runtime.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    if (!reviewConfirmed) {
      setReviewError(labels.fillForm.confirmDetailsError);
      return;
    }

    if (!session) {
      return;
    }

    void (async () => {
      await inspectionApplicationService.submitDraft(session, formData);
      navigate('/my-inspections', {
        state: {
          successMessage: labels.fillForm.successMessage,
        },
      });
    })();
  }, [
    formData,
    getSectionIndexForField,
    labels.fillForm.confirmDetailsError,
    labels.fillForm.successMessage,
    navigate,
    reviewConfirmed,
    session,
    validateForm,
  ]);

  const handleReset = useCallback(async () => {
    await fileChangeChainRef.current.catch(() => undefined);
    const previousFormData = formDataRef.current;
    formDataRef.current = {};
    setFormData({});
    setValidationErrors([]);
    if (sessionId && session) {
      await inspectionApplicationService.resetDraft(sessionId, session, previousFormData);
    }
    setReviewConfirmed(false);
    setReviewError(null);
  }, [session, sessionId]);

  const handleErrorClick = useCallback((fieldId: string) => {
    setActiveStepIndex(fieldId === 'sessionName' ? 0 : getSectionIndexForField(fieldId));
    platform.runtime.setTimeout(() => {
      const fieldElement = platform.runtime.getElementById(`field-${fieldId}`);
      if (!fieldElement) {
        return;
      }

      fieldElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
      fieldElement.focus();
    }, 0);
  }, [getSectionIndexForField]);

  const handleSessionNameChange = useCallback((name: string) => {
    if (session) {
      const updatedSession = markInspectionEdited({
        ...session,
        name,
      });
      setSession(updatedSession);
      void inspectionApplicationService.renameDraftSession(session, name);
    }

    setValidationErrors((currentErrors) => currentErrors.filter((error) => error.fieldId !== 'sessionName'));
  }, [session]);

  const handleReviewConfirmedChange = useCallback((checked: boolean) => {
    setReviewConfirmed(checked);
    if (checked) {
      setReviewError(null);
    }
  }, []);

  const formatReviewValue = useCallback((fieldId: string, value: FormDataValue | undefined) => {
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
        return value
          .map((item) => field.options?.find((option) => option.value === item)?.label || item)
          .join(', ');
      }

      const optionLabel = field.options.find((option) => option.value === value)?.label;
      if (optionLabel) {
        return optionLabel;
      }
    }

    if (typeof value === 'boolean') {
      return value ? labels.common.yes : labels.common.no;
    }

    if (Array.isArray(value)) {
      return value.join(', ');
    }

    return String(value);
  }, [formSchema, labels.common.no, labels.common.notProvided, labels.common.yes]);

  const handleCancel = useCallback(() => {
    navigate('/new-inspection');
  }, [navigate]);

  return {
    loading,
    session,
    formSchema,
    schemaError,
    formData,
    validationErrors,
    activeStepIndex,
    reviewConfirmed,
    reviewError,
    setActiveStepIndex,
    handleFieldChange,
    handleFileChange,
    handleSubmit,
    handleReset,
    handleErrorClick,
    handleCancel,
    handleSessionNameChange,
    handleReviewConfirmedChange,
    formatReviewValue,
  };
}









