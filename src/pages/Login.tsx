import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Header, Container, SpaceBetween, FormField, Input, Button, Box, Link } from '@cloudscape-design/components';
import { getUserId, setUserId } from '../auth';
import { getLoginUrl } from '../config';

export function Login() {
  const [email, setEmail] = useState('');
  const [userId, setUserIdInput] = useState('');
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [isLookupLoading, setIsLookupLoading] = useState(false);
  const navigate = useNavigate();

  const handleEmailLookup = async () => {
    const trimmed = email.trim();
    if (!trimmed) {
      setLookupError('Email is required.');
      return null;
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
      const payload = (await response.json()) as { userID?: string; userId?: string; userid?: string };
      const resolvedUserId = payload.userID || payload.userId || payload.userid || '';
      setUserIdInput(resolvedUserId);
      setUserId(resolvedUserId);
      return resolvedUserId;
    } catch (error) {
      setLookupError('Unable to look up user ID. Check the email and try again.');
      setUserIdInput('');
      console.error('Login lookup failed:', error);
      return null;
    } finally {
      setIsLookupLoading(false);
    }
  };

  const handleLogin = async () => {
    if (!email.trim()) {
      setLookupError('Email is required.');
      return;
    }
    const lookedUp = await handleEmailLookup();
    const resolvedUserId = lookedUp?.trim() || '';
    if (!resolvedUserId) {
      setLookupError('Login lookup did not return a user ID.');
      return;
    }
    navigate('/my-inspections', { replace: true });
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
                onKeyDown={(event) => {
                  if (event.detail.key === 'Enter') {
                    handleLogin();
                  }
                }}
                disabled={isLookupLoading}
              />
            </FormField>
            
            <SpaceBetween size="s" direction="horizontal">
              <Button variant="primary" onClick={handleLogin} disabled={!email.trim() || isLookupLoading}>
                Login
              </Button>
              <Link onFollow={() => navigate('/register')}>Create an account</Link>
            </SpaceBetween>
          </SpaceBetween>
        </Container>
      </SpaceBetween>
    </Box>
  );
}
