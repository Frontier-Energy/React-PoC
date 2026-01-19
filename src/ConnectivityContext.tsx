import { createContext, useContext, useEffect, useState } from 'react';

export type ConnectivityStatus = 'checking' | 'online' | 'offline';

interface ConnectivityContextValue {
  status: ConnectivityStatus;
  lastCheckedAt: Date | null;
  checkIntervalMs: number;
}

const DEFAULT_CHECK_INTERVAL_MS = 5000;
const DEFAULT_CHECK_URL = '/index.html';

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
      try {
        const response = await fetch(checkUrl, { method: 'HEAD', cache: 'no-store' });
        if (cancelled) {
          return;
        }
        setStatus(response.ok ? 'online' : 'offline');
      } catch {
        if (!cancelled) {
          setStatus('offline');
        }
      } finally {
        if (!cancelled) {
          setLastCheckedAt(new Date());
        }
      }
    };

    checkConnectivity();
    const intervalId = setInterval(checkConnectivity, checkIntervalMs);

    return () => {
      cancelled = true;
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
