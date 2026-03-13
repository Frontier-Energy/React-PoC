import { RouterProvider } from 'react-router-dom';
import type { Router as RemixRouter } from '@remix-run/router';
import { BackgroundUploadManager } from './BackgroundUploadManager';
import { ConnectivityProvider } from './ConnectivityContext';
import { LocalizationProvider } from './LocalizationContext';
import { TenantBootstrapProvider } from './TenantBootstrapContext';

interface AppProps {
  router: RemixRouter;
}

export function App({ router }: AppProps) {
  return (
    <LocalizationProvider>
      <TenantBootstrapProvider>
        <ConnectivityProvider>
          <BackgroundUploadManager />
          <RouterProvider router={router} />
        </ConnectivityProvider>
      </TenantBootstrapProvider>
    </LocalizationProvider>
  );
}
