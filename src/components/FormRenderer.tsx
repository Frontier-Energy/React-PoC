import { useMemo } from 'react';
import {
  FormField,
  Input,
  Checkbox,
  RadioGroup,
  Select,
  Multiselect,
  Textarea,
} from '@cloudscape-design/components';
import { FormSchema, FormField as FormFieldType, FormData, FormDataValue } from '../types';
import { formatFileValue } from '../utils/formDataUtils';
import './FormRenderer.css';

interface FormRendererProps {
  schema: FormSchema;
  data: FormData;
  onChange: (fieldId: string, value: FormDataValue, externalID?: string) => void;
  onFileChange: (fieldId: string, files: File[], externalID?: string) => void;
}

export function FormRenderer({ schema, data, onChange, onFileChange }: FormRendererProps) {
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
        const fileLabel = formatFileValue(value);
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
            {fileLabel && <div className="file-input-meta">{fileLabel}</div>}
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <form className="form-renderer">
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
