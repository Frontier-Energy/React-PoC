import { useMemo, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Box, Button, Container, Header, Modal, SpaceBetween } from '@cloudscape-design/components';
import type { FileReference, FormDataValue, FormSchema, InspectionSession } from '../types';
import { getFile } from '../utils/fileStorage';
import { getFileReferences } from '../utils/formDataUtils';

export function DebugInspection() {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const [formSchema, setFormSchema] = useState<FormSchema | null>(null);
  const [schemaError, setSchemaError] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewName, setPreviewName] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

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

  const formatFileSize = (size: number) => {
    if (size < 1024) {
      return `${size} B`;
    }
    if (size < 1024 * 1024) {
      return `${(size / 1024).toFixed(1)} KB`;
    }
    if (size < 1024 * 1024 * 1024) {
      return `${(size / (1024 * 1024)).toFixed(1)} MB`;
    }
    return `${(size / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  };

  const isPreviewableImage = (file: FileReference) => file.type.startsWith('image/');

  const handleDownload = async (file: FileReference) => {
    const storedFile = await getFile(file.id);
    if (!storedFile) {
      return;
    }
    const url = URL.createObjectURL(storedFile.blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = file.name;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const handlePreview = async (file: FileReference) => {
    if (!isPreviewableImage(file)) {
      return;
    }
    const storedFile = await getFile(file.id);
    if (!storedFile) {
      return;
    }
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }
    const url = URL.createObjectURL(storedFile.blob);
    setPreviewUrl(url);
    setPreviewName(file.name);
    setPreviewOpen(true);
  };

  const closePreview = () => {
    setPreviewOpen(false);
    setPreviewName(null);
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
    }
  };

  return (
    <SpaceBetween size="l">
      <Header
        variant="h1"
        actions={
          <Button variant="link" onClick={() => navigate('/my-inspections')}>
            Back to My Inspections
          </Button>
        }
      >
        Debug Inspection
      </Header>
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
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr',
                    gap: '0.5rem 1rem',
                    alignItems: 'center',
                    marginTop: '0.5rem',
                  }}
                >
                  <Box fontWeight="bold">File Name</Box>
                  <Box fontWeight="bold">Size</Box>
                  <Box fontWeight="bold">File Type</Box>
                  <Box fontWeight="bold">Download</Box>
                  <Box fontWeight="bold">Preview</Box>
                  {item.files.map((file) => (
                    <div key={file.id} style={{ display: 'contents' }}>
                      <Box>{file.name}</Box>
                      <Box>{formatFileSize(file.size)}</Box>
                      <Box>{file.type || 'Unknown'}</Box>
                      <Box>
                        <Button onClick={() => handleDownload(file)}>Download</Button>
                      </Box>
                      <Box>
                        {isPreviewableImage(file) ? (
                          <Button onClick={() => handlePreview(file)}>Preview</Button>
                        ) : (
                          <span>-</span>
                        )}
                      </Box>
                    </div>
                  ))}
                </div>
              </Box>
            ))}
        </SpaceBetween>
      </Container>
      <Modal
        visible={previewOpen}
        onDismiss={closePreview}
        header={previewName || 'Preview'}
        size="large"
        footer={
          <Box float="right">
            <Button onClick={closePreview}>Close</Button>
          </Box>
        }
      >
        {previewUrl && (
          <Box textAlign="center">
            <img src={previewUrl} alt={previewName || 'Preview'} style={{ maxWidth: '100%' }} />
          </Box>
        )}
      </Modal>
    </SpaceBetween>
  );
}
