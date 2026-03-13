import { createContext, useContext, useEffect, useState } from 'react';
import { getConnectivityCheckUrl } from './config';
import { platform } from './platform';

export type ConnectivityStatus = 'checking' | 'online' | 'offline';

interface ConnectivityContextValue {
  status: ConnectivityStatus;
  lastCheckedAt: Date | null;
  checkIntervalMs: number;
}

const DEFAULT_CHECK_INTERVAL_MS = 5000;
const DEFAULT_CHECK_URL = getConnectivityCheckUrl();

const ConnectivityContext = createContext<ConnectivityContextValue | undefined>(undefined);

interface ConnectivityProviderProps {
  children: React.ReactNode;
  checkIntervalMs?: number;
  checkUrl?: string;
}

export function ConnectivityProvider({
  children,
  checkIntervalMs = DEFAULT_CHECK_INTERVAL_MS,
  checkUrl = DEFAULT_CHECK_URL,
}: ConnectivityProviderProps) {
  const [status, setStatus] = useState<ConnectivityStatus>('checking');
  const [lastCheckedAt, setLastCheckedAt] = useState<Date | null>(null);

  useEffect(() => {
    let cancelled = false;

    const checkConnectivity = async () => {
      const controller = new AbortController();
      try {
        const response = await platform.connectivity.fetch(checkUrl, {
          method: 'GET',
          cache: 'no-store',
          signal: controller.signal,
        });
        if (cancelled) {
          return;
        }
        setStatus(response.ok ? 'online' : 'offline');
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') {
          return;
        }
        if (!cancelled) {
          setStatus('offline');
        }
      } finally {
        if (!cancelled) {
          setLastCheckedAt(new Date());
        }
      }

      return () => controller.abort();
    };

    let abortPendingCheck: () => void = () => {};

    const runConnectivityCheck = async () => {
      abortPendingCheck();
      abortPendingCheck = (await checkConnectivity()) ?? (() => {});
    };

    void runConnectivityCheck();
    const intervalId = setInterval(runConnectivityCheck, checkIntervalMs);

    return () => {
      cancelled = true;
      abortPendingCheck();
      clearInterval(intervalId);
    };
  }, [checkIntervalMs, checkUrl]);

  return (
    <ConnectivityContext.Provider value={{ status, lastCheckedAt, checkIntervalMs }}>
      {children}
    </ConnectivityContext.Provider>
  );
}

export function useConnectivity() {
  const context = useContext(ConnectivityContext);
  if (!context) {
    throw new Error('useConnectivity must be used within a ConnectivityProvider');
  }
  return context;
}
