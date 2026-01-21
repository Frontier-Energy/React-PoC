import { type PointerEvent, useEffect, useRef, useState } from 'react';
import {
  FormField,
  Input,
  Checkbox,
  RadioGroup,
  Select,
  Multiselect,
  Textarea,
  Modal,
  Box,
  Button,
  SpaceBetween,
} from '@cloudscape-design/components';
import { FormSchema, FormField as FormFieldType, FormData, FormDataValue } from '../types';
import { formatFileValue, getFileReferences } from '../utils/formDataUtils';
import { getFile } from '../utils/fileStorage';
import './FormRenderer.css';

interface FormRendererProps {
  schema: FormSchema;
  data: FormData;
  onChange: (fieldId: string, value: FormDataValue, externalID?: string) => void;
  onFileChange: (fieldId: string, files: File[], externalID?: string) => Promise<void> | void;
}

interface SignatureFieldProps {
  field: FormFieldType;
  value?: FormDataValue;
  onFileChange: (fieldId: string, files: File[], externalID?: string) => Promise<void> | void;
}

const SignatureField = ({ field, value, onFileChange }: SignatureFieldProps) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasInk, setHasInk] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isLocked, setIsLocked] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const ratio = window.devicePixelRatio || 1;
    canvas.width = rect.width * ratio;
    canvas.height = rect.height * ratio;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(ratio, ratio);
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#111';
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    const [fileRef] = getFileReferences(value);
    if (!fileRef) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      setHasInk(false);
      setIsLocked(false);
      return;
    }

    let isActive = true;

    const loadExistingSignature = async () => {
      const storedFile = await getFile(fileRef.id);
      if (!storedFile || !isActive) {
        if (isActive) {
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          setHasInk(false);
          setIsLocked(false);
        }
        return;
      }
      const objectUrl = URL.createObjectURL(storedFile.blob);
      const image = new Image();
      image.onload = () => {
        if (!isActive) {
          URL.revokeObjectURL(objectUrl);
          return;
        }
        const rect = canvas.getBoundingClientRect();
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(image, 0, 0, rect.width, rect.height);
        setHasInk(true);
        setIsLocked(true);
        URL.revokeObjectURL(objectUrl);
      };
      image.onerror = () => {
        URL.revokeObjectURL(objectUrl);
      };
      image.src = objectUrl;
    };

    void loadExistingSignature();

    return () => {
      isActive = false;
    };
  }, [value]);

  const getPoint = (event: PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    };
  };

  const handlePointerDown = (event: PointerEvent<HTMLCanvasElement>) => {
    if (isLocked) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    canvas.setPointerCapture(event.pointerId);
    const point = getPoint(event);
    ctx.beginPath();
    ctx.moveTo(point.x, point.y);
    setIsDrawing(true);
    setHasInk(true);
  };

  const handlePointerMove = (event: PointerEvent<HTMLCanvasElement>) => {
    if (isLocked) return;
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const point = getPoint(event);
    ctx.lineTo(point.x, point.y);
    ctx.stroke();
  };

  const handlePointerUp = (event: PointerEvent<HTMLCanvasElement>) => {
    if (isLocked) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.releasePointerCapture(event.pointerId);
    setIsDrawing(false);
  };

  const handleClear = async () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasInk(false);
    setIsLocked(false);
    await onFileChange(field.id, [], field.externalID);
  };

  const handleSave = async () => {
    if (isLocked) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (!hasInk) {
      await onFileChange(field.id, [], field.externalID);
      return;
    }
    setIsSaving(true);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((result) => resolve(result), 'image/png')
    );
    if (!blob) {
      setIsSaving(false);
      return;
    }
    const file = new File([blob], `${field.id}-${Date.now()}.png`, { type: 'image/png' });
    await onFileChange(field.id, [file], field.externalID);
    setIsSaving(false);
  };

  const fileLabel = formatFileValue(value);

  return (
    <div className="signature-field">
      <canvas
        ref={canvasRef}
        className="signature-canvas"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
      />
      <div className="signature-actions">
        {!isLocked && (
          <button
            type="button"
            className="signature-button"
            onClick={handleSave}
            disabled={isSaving}
          >
            {isSaving ? 'Saving...' : 'Save Signature'}
          </button>
        )}
        <button
          type="button"
          className="signature-button secondary"
          onClick={handleClear}
        >
          Clear
        </button>
      </div>
      {fileLabel && <div className="file-input-meta">{fileLabel}</div>}
    </div>
  );
};

export function FormRenderer({ schema, data, onChange, onFileChange }: FormRendererProps) {
  const [filePreviewOpen, setFilePreviewOpen] = useState(false);
  const [filePreviewName, setFilePreviewName] = useState<string | null>(null);
  const [filePreviewUrl, setFilePreviewUrl] = useState<string | null>(null);
  const [filePreviewType, setFilePreviewType] = useState<string | null>(null);

  const handleOpenFilePreview = async (file: { id: string; name: string; type: string }) => {
    if (filePreviewUrl) {
      URL.revokeObjectURL(filePreviewUrl);
    }
    setFilePreviewName(file.name);
    setFilePreviewType(file.type || null);
    setFilePreviewUrl(null);
    setFilePreviewOpen(true);

    try {
      const storedFile = await getFile(file.id);
      if (!storedFile) {
        return;
      }
      const objectUrl = URL.createObjectURL(storedFile.blob);
      setFilePreviewUrl(objectUrl);
      setFilePreviewType(file.type || storedFile.type || storedFile.blob.type);
    } catch (error) {
      // Keep modal open to show the fallback message.
    }
  };

  const handleCloseFilePreview = () => {
    setFilePreviewOpen(false);
    setFilePreviewName(null);
    setFilePreviewType(null);
    if (filePreviewUrl) {
      URL.revokeObjectURL(filePreviewUrl);
      setFilePreviewUrl(null);
    }
  };

  const handleTextChange = (fieldId: string, value: string, externalID?: string) => {
    onChange(fieldId, value, externalID);
  };

  const handleNumberChange = (fieldId: string, value: string, externalID?: string) => {
    onChange(fieldId, value, externalID);
  };

  const handleCheckboxChange = (fieldId: string, checked: boolean, externalID?: string) => {
    onChange(fieldId, checked, externalID);
  };

  const handleRadioChange = (fieldId: string, value: string, externalID?: string) => {
    onChange(fieldId, value, externalID);
  };

  const handleSelectChange = (fieldId: string, value: string | null, externalID?: string) => {
    onChange(fieldId, value || '', externalID);
  };

  const handleMultiselectChange = (fieldId: string, selectedOptions: readonly any[], externalID?: string) => {
    const values = selectedOptions.map((opt) => opt.value);
    onChange(fieldId, values, externalID);
  };

  const renderField = (field: FormFieldType) => {
    const value = data[field.id];

    switch (field.type) {
      case 'text':
        return (
          <Input
            value={(value as string) || ''}
            onChange={(event) => handleTextChange(field.id, event.detail.value, field.externalID)}
            placeholder={field.placeholder}
            type="text"
          />
        );

      case 'number':
        return (
          <Input
            value={(value as string) || ''}
            onChange={(event) => handleNumberChange(field.id, event.detail.value, field.externalID)}
            placeholder={field.placeholder}
            type="number"
          />
        );

      case 'checkbox':
        return (
          <Checkbox
            checked={(value as boolean) || false}
            onChange={(event) => handleCheckboxChange(field.id, event.detail.checked, field.externalID)}
          >
            {field.label}
          </Checkbox>
        );

      case 'radio':
        return (
          <RadioGroup
            value={(value as string) || ''}
            onChange={(event) => handleRadioChange(field.id, event.detail.value, field.externalID)}
            items={field.options?.map((opt) => ({
              value: opt.value,
              label: opt.label,
            })) || []}
          />
        );

      case 'select':
        return (
          <Select
            selectedOption={
              field.options?.find((opt) => opt.value === value) || null
            }
            onChange={(event) => handleSelectChange(field.id, event.detail.selectedOption?.value || '', field.externalID)}
            options={field.options?.map((opt) => ({
              label: opt.label,
              value: opt.value,
            })) || []}
            placeholder="Select an option"
          />
        );

      case 'multiselect':
        const selectedValues = (value as string[]) || [];
        return (
          <Multiselect
            selectedOptions={
              field.options
                ?.filter((opt) => selectedValues.includes(opt.value))
                .map((opt) => ({
                  label: opt.label,
                  value: opt.value,
                })) || []
            }
            onChange={(event) => handleMultiselectChange(field.id, event.detail.selectedOptions, field.externalID)}
            options={field.options?.map((opt) => ({
              label: opt.label,
              value: opt.value,
            })) || []}
            placeholder="Select options"
          />
        );

      case 'textarea':
        return (
          <Textarea
            value={(value as string) || ''}
            onChange={(event) => handleTextChange(field.id, event.detail.value, field.externalID)}
            placeholder={field.placeholder}
            rows={4}
          />
        );

      case 'file':
        const files = getFileReferences(value);
        return (
          <div className="file-input">
            <input
              type="file"
              accept={field.accept}
              multiple={field.multiple}
              capture={field.capture}
              onChange={(event) => {
                const files = event.target.files ? Array.from(event.target.files) : [];
                onFileChange(field.id, files, field.externalID);
                event.currentTarget.value = '';
              }}
            />
            {files.length > 0 && (
              <div className="file-input-meta">
                {files.map((file) => (
                  <Button
                    key={file.id}
                    variant="link"
                    onClick={() => handleOpenFilePreview(file)}
                  >
                    {file.name}
                  </Button>
                ))}
              </div>
            )}
          </div>
        );

      case 'signature':
        return <SignatureField field={field} value={value} onFileChange={onFileChange} />;

      default:
        return null;
    }
  };

  return (
    <form
      className="form-renderer"
      onSubmit={(event) => {
        event.preventDefault();
      }}
    >
      <Modal
        visible={filePreviewOpen}
        onDismiss={handleCloseFilePreview}
        header={filePreviewName || 'File Preview'}
        size="large"
        footer={
          <Box float="right">
            <SpaceBetween direction="horizontal" size="xs">
              {filePreviewUrl && filePreviewName && (
                <a href={filePreviewUrl} download={filePreviewName}>
                  Download
                </a>
              )}
              <Button onClick={handleCloseFilePreview}>Close</Button>
            </SpaceBetween>
          </Box>
        }
      >
        {filePreviewUrl ? (
          filePreviewType?.startsWith('image/') ? (
            <Box textAlign="center">
              <img src={filePreviewUrl} alt={filePreviewName || 'Preview'} style={{ maxWidth: '100%' }} />
            </Box>
          ) : (
            <Box textAlign="center">Preview not available for this file type.</Box>
          )
        ) : (
          <Box textAlign="center">Unable to load preview.</Box>
        )}
      </Modal>
      {schema.sections.map((section, sectionIndex) => (
        <div key={sectionIndex} className="form-section">
          <h2 className="section-title">{section.title}</h2>
          <div className="form-fields">
            {section.fields.map((field) => (
              <div key={field.id} className="form-field-wrapper" id={`field-${field.id}`}>
                {field.type === 'checkbox' ? (
                  renderField(field)
                ) : (
                  <FormField
                    label={field.label}
                    description={field.description}
                    stretch
                  >
                    {renderField(field)}
                  </FormField>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
    </form>
  );
}
