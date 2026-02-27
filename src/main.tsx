import React from 'react';
import ReactDOM from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';
import { router } from './routes';
import '@cloudscape-design/global-styles/index.css';
import './global.css';
import { ConnectivityProvider } from './ConnectivityContext';
import { BackgroundUploadManager } from './BackgroundUploadManager';
import { LocalizationProvider } from './LocalizationContext';
import { TenantBootstrapProvider } from './TenantBootstrapContext';
import { registerSW } from 'virtual:pwa-register';

registerSW({ immediate: true });

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <LocalizationProvider>
      <TenantBootstrapProvider>
        <ConnectivityProvider>
          <BackgroundUploadManager />
          <RouterProvider router={router} />
        </ConnectivityProvider>
      </TenantBootstrapProvider>
    </LocalizationProvider>
  </React.StrictMode>
);
