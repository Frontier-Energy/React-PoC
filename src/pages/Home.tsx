import { Header, SpaceBetween, StatusIndicator, Box } from '@cloudscape-design/components';
import { useConnectivity } from '../ConnectivityContext';

export function Home() {
  const { status, lastCheckedAt } = useConnectivity();

  const statusType = status === 'online' ? 'success' : status === 'offline' ? 'error' : 'in-progress';
  const statusLabel = status === 'online' ? 'Online' : status === 'offline' ? 'Offline' : 'Checking connection...';

  return (
    <SpaceBetween size="m">
      <Header variant="h1">Inspection Forms</Header>
      <Box>
        <StatusIndicator type={statusType}>
          {statusLabel}
          {lastCheckedAt ? ` (last checked ${lastCheckedAt.toLocaleTimeString()})` : ''}
        </StatusIndicator>
      </Box>
    </SpaceBetween>
  );
}
