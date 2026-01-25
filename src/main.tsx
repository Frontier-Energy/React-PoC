import React from 'react';
import ReactDOM from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';
import { router } from './routes';
import '@cloudscape-design/global-styles/index.css';
import './global.css';
import { ConnectivityProvider } from './ConnectivityContext';
import { BackgroundUploadManager } from './BackgroundUploadManager';
import { LocalizationProvider } from './LocalizationContext';

// Register Service Worker for offline support
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // Service worker registration failed, app will still work online
    });
  });
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <LocalizationProvider>
      <ConnectivityProvider>
        <BackgroundUploadManager />
        <RouterProvider router={router} />
      </ConnectivityProvider>
    </LocalizationProvider>
  </React.StrictMode>
);
