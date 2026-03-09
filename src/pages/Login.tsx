import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Header, Container, SpaceBetween, FormField, Input, Button, Box, Link } from '@cloudscape-design/components';
import { authApplicationService } from '../application/authApplicationService';
import { getActiveTenant } from '../config';
import { useLocalization } from '../LocalizationContext';

export function Login() {
  const [email, setEmail] = useState('');
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [isLookupLoading, setIsLookupLoading] = useState(false);
  const navigate = useNavigate();
  const { labels } = useLocalization();
  const tenant = getActiveTenant();

  const handleEmailLookup = async () => {
    const trimmed = email.trim();
    if (!trimmed) {
      setLookupError(labels.login.emailRequired);
      return null;
    }
    setIsLookupLoading(true);
    setLookupError(null);
    try {
      const result = await authApplicationService.lookupLoginIdentity(trimmed);
      return result.userId;
    } catch (error) {
      setLookupError(labels.login.lookupError);
      console.error('Login lookup failed:', error);
      return null;
    } finally {
      setIsLookupLoading(false);
    }
  };

  const handleLogin = async () => {
    if (!email.trim()) {
      setLookupError(labels.login.emailRequired);
      return;
    }
    const lookedUp = await handleEmailLookup();
    const resolvedUserId = lookedUp?.trim() || '';
    if (!resolvedUserId) {
      setLookupError(labels.login.lookupNoUserId);
      return;
    }
    navigate('/my-inspections', { replace: true });
  };

  return (
    <Box padding="l">
      <SpaceBetween size="l">
        <Box variant="small" color="text-status-inactive">
          {labels.login.tenantLabel}: {tenant.displayName}
        </Box>
        <Header variant="h1">{labels.login.title}</Header>
        <Container>
          <SpaceBetween size="m">
            <FormField label={labels.login.emailLabel} errorText={lookupError || undefined}>
              <Input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.detail.value)}
                placeholder={labels.login.emailPlaceholder}
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
                {labels.login.login}
              </Button>
              <Link onFollow={() => navigate('/register')}>{labels.login.createAccount}</Link>
            </SpaceBetween>
          </SpaceBetween>
        </Container>
      </SpaceBetween>
    </Box>
  );
}
