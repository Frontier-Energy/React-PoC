import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { fetchFormSchema } from '../../apiContent';
import { useLocalization } from '../../LocalizationContext';
import { inspectionRepository } from '../../repositories/inspectionRepository';
import { syncQueue } from '../../syncQueue';
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
  UploadStatus,
} from '../../types';
import { FormValidator, type ValidationError } from '../../utils/FormValidator';
import { deleteFiles, saveFiles } from '../../utils/fileStorage';
import { formatFileValue, getFileReferences, isFormDataValueEmpty } from '../../utils/formDataUtils';

interface FillFormWorkflowResult {
  loading: boolean;
  session: InspectionSession | null;
  formSchema: FormSchema | null;
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

export function useFillFormWorkflow(): FillFormWorkflowResult {
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
  const loadRequestIdRef = useRef(0);

  const getSectionIndexForField = useCallback((fieldId: string) => {
    if (!formSchema) {
      return 0;
    }

    const sectionIndex = formSchema.sections.findIndex((section) =>
      section.fields.some((field) => field.id === fieldId)
    );
    return sectionIndex === -1 ? 0 : sectionIndex;
  }, [formSchema]);

  const loadFormData = useCallback((
    targetSessionId: string,
    externalIdMap: Record<string, string>,
    inspection: Pick<InspectionSession, 'tenantId' | 'userId'>
  ) => {
    void inspectionRepository.loadFormData(targetSessionId, inspection).then((storedData) => {
      if (!storedData) {
        return;
      }

      const nextFormData: FormData = {};
      Object.entries(storedData).forEach(([key, value]) => {
        nextFormData[externalIdMap[key] || key] = value;
      });
      setFormData(nextFormData);
    });
  }, []);

  const loadSchemaForSession = useCallback(async (
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
      loadFormData(targetSessionId, buildExternalIdMap(schema), inspection);
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
      setSession(null);
      setFormSchema(null);
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
      return nextFormData;
    });

    if (sessionId && session) {
      void inspectionRepository.updateFormDataEntry(sessionId, externalID || fieldId, value, session);
    }

    setValidationErrors((currentErrors) => currentErrors.filter((error) => error.fieldId !== fieldId));
  }, [session, sessionId]);

  const handleFieldChange = useCallback((fieldId: string, value: FormDataValue, externalID?: string) => {
    updateFieldValue(fieldId, value, externalID);
  }, [updateFieldValue]);

  const handleFileChange = useCallback(async (fieldId: string, files: File[], externalID?: string) => {
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
    updateFieldValue(fieldId, field?.multiple ? savedFiles : savedFiles[0], externalID);
  }, [formData, formSchema, sessionId, updateFieldValue]);

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
      window.scrollTo({ top: 0, behavior: 'smooth' });
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
      const updatedSession: InspectionSession = {
        ...session,
        uploadStatus: UploadStatus.Local,
      };
      await inspectionRepository.saveAsCurrent(updatedSession);
      await syncQueue.enqueue(updatedSession, formData);
      window.dispatchEvent(new CustomEvent('inspection-status-changed', { detail: updatedSession }));
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
  }, [formData, session, sessionId]);

  const handleErrorClick = useCallback((fieldId: string) => {
    setActiveStepIndex(fieldId === 'sessionName' ? 0 : getSectionIndexForField(fieldId));
    window.setTimeout(() => {
      const fieldElement = document.getElementById(`field-${fieldId}`);
      if (!fieldElement) {
        return;
      }

      fieldElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
      fieldElement.focus();
    }, 0);
  }, [getSectionIndexForField]);

  const handleSessionNameChange = useCallback((name: string) => {
    if (session) {
      const updatedSession: InspectionSession = {
        ...session,
        name,
      };
      setSession(updatedSession);
      void inspectionRepository.saveAsCurrent(updatedSession);
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
