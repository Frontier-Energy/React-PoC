import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Header, Container, SpaceBetween, FormField, Input, Button, Box } from '@cloudscape-design/components';
import { authApplicationService } from '../application/authApplicationService';
import { getActiveTenant } from '../config';
import { useLocalization } from '../LocalizationContext';

export function Register() {
  const [email, setEmail] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const navigate = useNavigate();
  const { labels } = useLocalization();
  const tenant = getActiveTenant();

  const handleRegister = async () => {
    if (!email.trim() || !firstName.trim() || !lastName.trim()) {
      setErrorMessage(labels.register.requiredError);
      return;
    }
    setIsSubmitting(true);
    setErrorMessage(null);
    try {
      const result = await authApplicationService.registerIdentity({
        email: email.trim(),
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        invalidInputMessage: labels.register.errors.invalidInput,
        serverErrorMessage: labels.register.errors.serverError,
      });
      const resolvedUserId = result.userId;
      if (resolvedUserId) {
        navigate('/my-inspections', { replace: true });
      } else {
        navigate('/login', { replace: true });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : labels.register.errors.unableToRegister;
      setErrorMessage(message);
      console.error('Registration failed:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Box padding="l">
      <SpaceBetween size="l">
        <Box variant="small" color="text-status-inactive">
          {labels.register.tenantLabel}: {tenant.displayName}
        </Box>
        <Header
          variant="h1"
          actions={
            <Button variant="link" onClick={() => navigate('/login')}>
              {labels.register.backToLogin}
            </Button>
          }
        >
          {labels.register.title}
        </Header>
        {errorMessage && (
          <Box color="text-status-error">
            {errorMessage}
          </Box>
        )}
        <Container>
          <SpaceBetween size="m">
            <FormField label={labels.register.emailLabel} errorText={errorMessage || undefined}>
              <Input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.detail.value)}
                placeholder={labels.register.emailPlaceholder}
                disabled={isSubmitting}
              />
            </FormField>
            <FormField label={labels.register.firstNameLabel}>
              <Input
                value={firstName}
                onChange={(event) => setFirstName(event.detail.value)}
                placeholder={labels.register.firstNamePlaceholder}
                disabled={isSubmitting}
              />
            </FormField>
            <FormField label={labels.register.lastNameLabel}>
              <Input
                value={lastName}
                onChange={(event) => setLastName(event.detail.value)}
                placeholder={labels.register.lastNamePlaceholder}
                disabled={isSubmitting}
              />
            </FormField>
            <Button variant="primary" onClick={handleRegister} disabled={isSubmitting}>
              {labels.register.createAccount}
            </Button>
          </SpaceBetween>
        </Container>
      </SpaceBetween>
    </Box>
  );
}
