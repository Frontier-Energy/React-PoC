import { useMemo, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Box, Button, Container, Header, Modal, SpaceBetween } from '@cloudscape-design/components';
import type { FileReference, FormDataValue, FormSchema, InspectionSession } from '../types';
import { getFile } from '../utils/fileStorage';
import { getFileReferences } from '../utils/formDataUtils';
import { useLocalization } from '../LocalizationContext';

export function DebugInspection() {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const { labels } = useLocalization();
  const [formSchema, setFormSchema] = useState<FormSchema | null>(null);
  const [schemaError, setSchemaError] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewName, setPreviewName] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const inspectionData = useMemo(() => {
    if (!sessionId) {
      return { error: labels.debugInspection.errors.missingInspectionId };
    }

    const sessionStr = localStorage.getItem(`inspection_${sessionId}`);
    const formDataStr = localStorage.getItem(`formData_${sessionId}`);

    let inspection: InspectionSession | null = null;
    if (sessionStr) {
      try {
        inspection = JSON.parse(sessionStr) as InspectionSession;
      } catch (error) {
        return { error: labels.debugInspection.errors.parseInspection };
      }
    }

    let formData: Record<string, FormDataValue> | null = null;
    if (formDataStr) {
      try {
        formData = JSON.parse(formDataStr) as Record<string, FormDataValue>;
      } catch (error) {
        formData = { error: labels.debugInspection.errors.parseFormData };
      }
    }

    return {
      inspection,
      formData,
    };
  }, [sessionId, labels]);

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
        setSchemaError(labels.debugInspection.schemaLoadError);
      }
    };
    loadSchema();
  }, [inspectionData.inspection, labels]);

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
            {labels.debugInspection.backToMyInspections}
          </Button>
        }
      >
        {labels.debugInspection.title}
      </Header>
      <Container>
        <Box padding="m">
          <pre>{JSON.stringify(inspectionData, null, 2)}</pre>
        </Box>
      </Container>
      <Container>
        <SpaceBetween size="s">
          <Header variant="h2">{labels.debugInspection.filesHeader}</Header>
          {schemaError && <Box color="text-status-error">{schemaError}</Box>}
          {!schemaError && fileItems.length === 0 && (
            <Box color="text-body-secondary">{labels.debugInspection.noFilesFound}</Box>
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
                  <Box fontWeight="bold">{labels.debugInspection.table.fileName}</Box>
                  <Box fontWeight="bold">{labels.debugInspection.table.size}</Box>
                  <Box fontWeight="bold">{labels.debugInspection.table.fileType}</Box>
                  <Box fontWeight="bold">{labels.debugInspection.table.download}</Box>
                  <Box fontWeight="bold">{labels.debugInspection.table.preview}</Box>
                  {item.files.map((file) => (
                    <div key={file.id} style={{ display: 'contents' }}>
                      <Box>{file.name}</Box>
                      <Box>{formatFileSize(file.size)}</Box>
                      <Box>{file.type || labels.common.unknown}</Box>
                      <Box>
                        <Button onClick={() => handleDownload(file)}>{labels.common.download}</Button>
                      </Box>
                      <Box>
                        {isPreviewableImage(file) ? (
                          <Button onClick={() => handlePreview(file)}>{labels.common.preview}</Button>
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
        header={previewName || labels.debugInspection.previewTitle}
        size="large"
        footer={
          <Box float="right">
            <Button onClick={closePreview}>{labels.debugInspection.close}</Button>
          </Box>
        }
      >
        {previewUrl && (
          <Box textAlign="center">
            <img src={previewUrl} alt={previewName || labels.debugInspection.previewTitle} style={{ maxWidth: '100%' }} />
          </Box>
        )}
      </Modal>
    </SpaceBetween>
  );
}
