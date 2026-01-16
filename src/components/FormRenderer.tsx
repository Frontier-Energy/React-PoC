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
import { FormSchema, FormField as FormFieldType, FormData } from '../types';
import './FormRenderer.css';

interface FormRendererProps {
  schema: FormSchema;
  data: FormData;
  onChange: (fieldId: string, value: string | boolean | string[]) => void;
}

export function FormRenderer({ schema, data, onChange }: FormRendererProps) {
  const handleTextChange = (fieldId: string, value: string) => {
    onChange(fieldId, value);
  };

  const handleNumberChange = (fieldId: string, value: string) => {
    onChange(fieldId, value);
  };

  const handleCheckboxChange = (fieldId: string, checked: boolean) => {
    onChange(fieldId, checked);
  };

  const handleRadioChange = (fieldId: string, value: string) => {
    onChange(fieldId, value);
  };

  const handleSelectChange = (fieldId: string, value: string | null) => {
    onChange(fieldId, value || '');
  };

  const handleMultiselectChange = (fieldId: string, selectedOptions: readonly any[]) => {
    const values = selectedOptions.map((opt) => opt.value);
    onChange(fieldId, values);
  };

  const renderField = (field: FormFieldType) => {
    const value = data[field.id];

    switch (field.type) {
      case 'text':
        return (
          <Input
            value={(value as string) || ''}
            onChange={(event) => handleTextChange(field.id, event.detail.value)}
            placeholder={field.placeholder}
            type="text"
          />
        );

      case 'number':
        return (
          <Input
            value={(value as string) || ''}
            onChange={(event) => handleNumberChange(field.id, event.detail.value)}
            placeholder={field.placeholder}
            type="number"
          />
        );

      case 'checkbox':
        return (
          <Checkbox
            checked={(value as boolean) || false}
            onChange={(event) => handleCheckboxChange(field.id, event.detail.checked)}
          >
            {field.label}
          </Checkbox>
        );

      case 'radio':
        return (
          <RadioGroup
            value={(value as string) || ''}
            onChange={(event) => handleRadioChange(field.id, event.detail.value)}
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
            onChange={(event) => handleSelectChange(field.id, event.detail.selectedOption.value)}
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
            onChange={(event) => handleMultiselectChange(field.id, event.detail.selectedOptions)}
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
            onChange={(event) => handleTextChange(field.id, event.detail.value)}
            placeholder={field.placeholder}
            rows={4}
          />
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
              <div key={field.id} className="form-field-wrapper">
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
