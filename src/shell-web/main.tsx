import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from '../app-core/App';
import { router } from '../app-core/routes';
import '@cloudscape-design/global-styles/index.css';
import './global.css';
import { platform } from './platform';

platform.updates.register();
platform.telemetry.start(router);

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App router={router} />
  </React.StrictMode>
);
