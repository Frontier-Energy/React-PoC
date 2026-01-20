import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Header, Container, SpaceBetween, FormField, Input, Button, Box } from '@cloudscape-design/components';
import { setUserId } from '../auth';
import { getLoginUrl } from '../config';

export function Login() {
  const [email, setEmail] = useState('');
  const [userId, setUserIdInput] = useState('');
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [isLookupLoading, setIsLookupLoading] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  const handleEmailLookup = async () => {
    const trimmed = email.trim();
    if (!trimmed) {
      setLookupError(null);
      return;
    }
    setIsLookupLoading(true);
    setLookupError(null);
    try {
      const response = await fetch(getLoginUrl(), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email: trimmed }),
      });
      if (!response.ok) {
        throw new Error(`Login lookup failed with status ${response.status}`);
      }
      const payload = (await response.json()) as { userID: string };
      setUserIdInput(payload.userID || '');
    } catch (error) {
      setLookupError('Unable to look up user ID. Check the email and try again.');
      setUserIdInput('');
      console.error('Login lookup failed:', error);
    } finally {
      setIsLookupLoading(false);
    }
  };

  const handleLogin = () => {
    const trimmed = userId.trim();
    if (!trimmed) {
      return;
    }
    setUserId(trimmed);
    const state = location.state as { from?: string } | null;
    navigate(state?.from || '/', { replace: true });
  };

  return (
    <Box padding="l">
      <SpaceBetween size="l">
        <Header variant="h1">Sign In</Header>
        <Container>
          <SpaceBetween size="m">
            <FormField label="Email" errorText={lookupError || undefined}>
              <Input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.detail.value)}
                placeholder="you@example.com"
                onBlur={handleEmailLookup}
                onKeyDown={(event) => {
                  if (event.detail.key === 'Enter') {
                    handleEmailLookup();
                  }
                }}
                disabled={isLookupLoading}
              />
            </FormField>
            <FormField label="User ID" description="Enter the ID used for inspection submissions.">
              <Input
                value={userId}
                onChange={(event) => setUserIdInput(event.detail.value)}
                placeholder="e.g., tech-001"
                onKeyDown={(event) => {
                  if (event.detail.key === 'Enter') {
                    handleLogin();
                  }
                }}
              />
            </FormField>
            <Button variant="primary" onClick={handleLogin} disabled={!userId.trim()}>
              Login
            </Button>
          </SpaceBetween>
        </Container>
      </SpaceBetween>
    </Box>
  );
}
