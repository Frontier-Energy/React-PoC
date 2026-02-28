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

  it('sets offline when check returns a non-ok response', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue({ ok: false } as Response);

    render(
      <ConnectivityProvider checkIntervalMs={60000}>
        <ConnectivityStatusProbe />
      </ConnectivityProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('offline')).toBeInTheDocument();
    });
  });

  it('ignores in-flight connectivity result after unmount', async () => {
    let resolveFetch: ((value: Response) => void) | undefined;
    vi.spyOn(global, 'fetch').mockImplementation(
      () =>
        new Promise<Response>((resolve) => {
          resolveFetch = resolve;
        })
    );

    const { unmount } = render(
      <ConnectivityProvider checkIntervalMs={60000}>
        <ConnectivityStatusProbe />
      </ConnectivityProvider>
    );

    unmount();
    resolveFetch?.({ ok: true } as Response);
    await Promise.resolve();
  });

  it('does not set offline after unmount when in-flight request rejects', async () => {
    let rejectFetch: ((reason?: unknown) => void) | undefined;
    vi.spyOn(global, 'fetch').mockImplementation(
      () =>
        new Promise<Response>((_resolve, reject) => {
          rejectFetch = reject;
        })
    );

    const { unmount } = render(
      <ConnectivityProvider checkIntervalMs={60000}>
        <ConnectivityStatusProbe />
      </ConnectivityProvider>
    );

    unmount();
    rejectFetch?.(new Error('offline'));
    await Promise.resolve();
  });
});
