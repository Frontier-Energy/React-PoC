import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Header, Container, SpaceBetween, FormField, Input, Button, Box } from '@cloudscape-design/components';
import { getRegisterUrl } from '../config';

export function Register() {
  const [email, setEmail] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const navigate = useNavigate();

  const handleRegister = async () => {
    if (!email.trim() || !firstName.trim() || !lastName.trim()) {
      setErrorMessage('Email, first name, and last name are required.');
      return;
    }
    setIsSubmitting(true);
    setErrorMessage(null);
    try {
      const response = await fetch(getRegisterUrl(), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: email.trim(),
          firstName: firstName.trim(),
          lastName: lastName.trim(),
        }),
      });
      if (!response.ok) {
        const isClientError = response.status === 400 || response.status === 422;
        const message = isClientError
          ? 'Registration failed due to invalid input. Please check your details and try again.'
          : 'Registration failed due to a server error. Please try again later.';
        throw new Error(message);
      }
      navigate('/login', { replace: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to register. Please try again.';
      setErrorMessage(message);
      console.error('Registration failed:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Box padding="l">
      <SpaceBetween size="l">
        <Header variant="h1">Register</Header>
        {errorMessage && (
          <Box color="text-status-error">
            {errorMessage}
          </Box>
        )}
        <Container>
          <SpaceBetween size="m">
            <FormField label="Email" errorText={errorMessage || undefined}>
              <Input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.detail.value)}
                placeholder="you@example.com"
                disabled={isSubmitting}
              />
            </FormField>
            <FormField label="First Name">
              <Input
                value={firstName}
                onChange={(event) => setFirstName(event.detail.value)}
                placeholder="First name"
                disabled={isSubmitting}
              />
            </FormField>
            <FormField label="Last Name">
              <Input
                value={lastName}
                onChange={(event) => setLastName(event.detail.value)}
                placeholder="Last name"
                disabled={isSubmitting}
              />
            </FormField>
            <Button variant="primary" onClick={handleRegister} disabled={isSubmitting}>
              Create Account
            </Button>
          </SpaceBetween>
        </Container>
      </SpaceBetween>
    </Box>
  );
}
