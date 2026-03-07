import { Header, Container, SpaceBetween, Alert, Box, Link, Input, FormField, Wizard, Checkbox } from '@cloudscape-design/components';
import { FormRenderer } from '../components/FormRenderer';
import { useLocalization } from '../LocalizationContext';
import { formatTemplate } from '../resources/translations';
import { useFillFormWorkflow } from './fillForm/useFillFormWorkflow';

export function FillForm() {
  const { labels } = useLocalization();
  const {
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
  } = useFillFormWorkflow();

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
          onChange={(event) => handleReviewConfirmedChange(event.detail.checked)}
        >
          {labels.fillForm.review.finalConfirmationText}
        </Checkbox>
      </FormField>
    </SpaceBetween>
  );

  return (
    <div>
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
          <div>
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
          onCancel={handleCancel}
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
