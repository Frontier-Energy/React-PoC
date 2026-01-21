import { useMemo, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Box, Container, Header, SpaceBetween } from '@cloudscape-design/components';
import type { FormDataValue, FormSchema, InspectionSession } from '../types';
import { getFileReferences } from '../utils/formDataUtils';

export function DebugInspection() {
  const { sessionId } = useParams();
  const [formSchema, setFormSchema] = useState<FormSchema | null>(null);
  const [schemaError, setSchemaError] = useState<string | null>(null);

  const inspectionData = useMemo(() => {
    if (!sessionId) {
      return { error: 'Missing inspection id.' };
    }

    const sessionStr = localStorage.getItem(`inspection_${sessionId}`);
    const formDataStr = localStorage.getItem(`formData_${sessionId}`);

    let inspection: InspectionSession | null = null;
    if (sessionStr) {
      try {
        inspection = JSON.parse(sessionStr) as InspectionSession;
      } catch (error) {
        return { error: 'Failed to parse inspection data.' };
      }
    }

    let formData: Record<string, FormDataValue> | null = null;
    if (formDataStr) {
      try {
        formData = JSON.parse(formDataStr) as Record<string, FormDataValue>;
      } catch (error) {
        formData = { error: 'Failed to parse form data.' };
      }
    }

    return {
      inspection,
      formData,
    };
  }, [sessionId]);

  useEffect(() => {
    const loadSchema = async () => {
      if (!inspectionData.inspection) {
        return;
      }
      try {
        const schemaModule = await import(`../resources/${inspectionData.inspection.formType}.json`);
        setFormSchema(schemaModule.default as FormSchema);
        setSchemaError(null);
      } catch (error) {
        setSchemaError('Failed to load form schema.');
      }
    };
    loadSchema();
  }, [inspectionData.inspection]);

  const fileItems = useMemo(() => {
    if (!formSchema || !inspectionData.formData) {
      return [];
    }
    const data = inspectionData.formData;
    const fileFields = formSchema.sections
      .flatMap((section) => section.fields)
      .filter((field) => field.type === 'file' || field.type === 'signature');

    return fileFields
      .map((field) => {
        const key = field.externalID || field.id;
        const files = getFileReferences(data[key]);
        return {
          fieldId: field.id,
          label: field.label,
          type: field.type,
          files,
        };
      })
      .filter((item) => item.files.length > 0);
  }, [formSchema, inspectionData.formData]);

  return (
    <SpaceBetween size="l">
      <Header variant="h1">Debug Inspection</Header>
      <Container>
        <Box padding="m">
          <pre>{JSON.stringify(inspectionData, null, 2)}</pre>
        </Box>
      </Container>
      <Container>
        <SpaceBetween size="s">
          <Header variant="h2">Files in Form</Header>
          {schemaError && <Box color="text-status-error">{schemaError}</Box>}
          {!schemaError && fileItems.length === 0 && (
            <Box color="text-body-secondary">No files or signatures found.</Box>
          )}
          {!schemaError &&
            fileItems.map((item) => (
              <Box key={`${item.fieldId}-${item.type}`}>
                <div>
                  <strong>{item.label}</strong> ({item.type})
                </div>
                <ul>
                  {item.files.map((file) => (
                    <li key={file.id}>{file.name}</li>
                  ))}
                </ul>
              </Box>
            ))}
        </SpaceBetween>
      </Container>
    </SpaceBetween>
  );
}
