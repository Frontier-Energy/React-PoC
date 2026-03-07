import { useEffect } from 'react';
import { useConnectivity } from './ConnectivityContext';
import { backgroundUploadRuntime } from './backgroundUploadRuntime';

export function BackgroundUploadManager() {
  const { status: connectivityStatus } = useConnectivity();

  useEffect(() => {
    backgroundUploadRuntime.setConnectivityStatus(connectivityStatus);
    return undefined;
  }, [connectivityStatus]);

  return null;
}
