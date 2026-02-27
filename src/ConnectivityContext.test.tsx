import { render, screen, waitFor } from '@testing-library/react';
import { ConnectivityProvider, useConnectivity } from './ConnectivityContext';

function ConnectivityStatusProbe() {
  const { status } = useConnectivity();
  return <div>{status}</div>;
}

describe('ConnectivityProvider', () => {
  it('throws when useConnectivity is used outside provider', () => {
    expect(() => render(<ConnectivityStatusProbe />)).toThrow(
      'useConnectivity must be used within a ConnectivityProvider'
    );
  });

  it('sets online when check succeeds', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue({ ok: true } as Response);

    render(
      <ConnectivityProvider checkIntervalMs={60000}>
        <ConnectivityStatusProbe />
      </ConnectivityProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('online')).toBeInTheDocument();
    });
  });

  it('sets offline when check fails', async () => {
    vi.spyOn(global, 'fetch').mockRejectedValue(new Error('offline'));

    render(
      <ConnectivityProvider checkIntervalMs={60000}>
        <ConnectivityStatusProbe />
      </ConnectivityProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('offline')).toBeInTheDocument();
    });
  });
});
