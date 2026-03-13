import { useEffect } from 'react';
import { useConnectivity } from './ConnectivityContext';

const loadBackgroundUploadRuntime = async () => {
  const module = await import('./backgroundUploadRuntime');
  return module.backgroundUploadRuntime;
};

export function BackgroundUploadManager() {
  const { status: connectivityStatus } = useConnectivity();

  useEffect(() => {
    let cancelled = false;

    void loadBackgroundUploadRuntime().then((runtime) => {
      if (cancelled) {
        return;
      }
      runtime.start();
    });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    void loadBackgroundUploadRuntime().then((runtime) => {
      runtime.setConnectivityStatus(connectivityStatus);
    });

    return undefined;
  }, [connectivityStatus]);

  return null;
}
