import { render, screen, waitFor } from '@testing-library/react';
import { Component, type ErrorInfo, type ReactNode } from 'react';
import { ConnectivityProvider, useConnectivity } from './ConnectivityContext';
import { getConnectivityCheckUrl } from './config';

function ConnectivityStatusProbe() {
  const { status, lastCheckedAt, checkIntervalMs } = useConnectivity();
  return (
    <div>
      <div>{status}</div>
      <div data-testid="checked-at">{lastCheckedAt ? 'checked' : 'pending'}</div>
      <div data-testid="interval">{checkIntervalMs}</div>
    </div>
  );
}

class HookErrorBoundary extends Component<
  { children: ReactNode },
  { errorMessage: string | null }
> {
  state = { errorMessage: null };

  static getDerivedStateFromError(error: Error) {
    return { errorMessage: error.message };
  }

  componentDidCatch(_error: Error, _errorInfo: ErrorInfo) {}

  render() {
    if (this.state.errorMessage) {
      return <div data-testid="hook-error">{this.state.errorMessage}</div>;
    }

    return this.props.children;
  }
}

describe('ConnectivityProvider', () => {
  it('throws when useConnectivity is used outside provider', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const expectedErrorHandler = (event: ErrorEvent) => {
      if (event.error instanceof Error && event.error.message === 'useConnectivity must be used within a ConnectivityProvider') {
        event.preventDefault();
      }
    };

    window.addEventListener('error', expectedErrorHandler);

    try {
      render(
        <HookErrorBoundary>
          <ConnectivityStatusProbe />
        </HookErrorBoundary>
      );

      expect(screen.getByTestId('hook-error')).toHaveTextContent(
        'useConnectivity must be used within a ConnectivityProvider'
      );
    } finally {
      window.removeEventListener('error', expectedErrorHandler);
    }
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

    expect(global.fetch).toHaveBeenCalledWith(
      getConnectivityCheckUrl(),
      expect.objectContaining({
        method: 'GET',
        cache: 'no-store',
      })
    );
    expect(screen.getByTestId('checked-at')).toHaveTextContent('checked');
    expect(screen.getByTestId('interval')).toHaveTextContent('60000');
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

  it('keeps the checking state when the request aborts', async () => {
    vi.spyOn(global, 'fetch').mockRejectedValue(new DOMException('aborted', 'AbortError'));

    render(
      <ConnectivityProvider checkIntervalMs={60000}>
        <ConnectivityStatusProbe />
      </ConnectivityProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('checking')).toBeInTheDocument();
      expect(screen.getByTestId('checked-at')).toHaveTextContent('checked');
    });
  });
});
