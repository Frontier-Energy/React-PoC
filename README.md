# QHVAC Inspection Tool

An offline-first inspection application built with React, TypeScript, and Cloudscape Design Components. The app runs as a PWA, stores working data locally in IndexedDB, and syncs queued inspections to the API when connectivity returns.

## Features

- [x] **Offline-first workflow**: cached shell plus durable local data storage
- [x] **IndexedDB persistence**: inspections, current session, form data, sync queue, and worker leases
- [x] **Background upload queue**: retries failed uploads with backoff and idempotency keys
- [x] **Tenant-aware app model**: tenant bootstrap controls branding, enabled forms, and login requirements
- [x] **User-scoped data isolation**: inspection storage is partitioned by tenant and user
- [x] **Dynamic forms**: schema-driven sections, conditional visibility, and validation
- [x] **Attachment support**: uploaded files and signatures are stored locally and included in sync
- [x] **Localization**: bundled fallback labels with API-loaded translations
- [x] **Responsive PWA**: installable on desktop and mobile

## Tech Stack

- **Frontend**: React 18 + TypeScript
- **UI**: Cloudscape Design Components
- **Routing**: React Router
- **Build**: Vite
- **PWA**: `vite-plugin-pwa` with service worker registration in `src/main.tsx`
- **Testing**: Vitest + Testing Library
- **Storage**: IndexedDB for app data and files, `localStorage` for lightweight preferences and auth state

## Getting Started

### Prerequisites

- Node.js 18+
- npm 9+

### Local Development

```bash
git clone https://github.com/yourusername/React-PoC.git
cd React-PoC
npm install
npm run dev
```

The dev server runs at `http://localhost:5173`.

### Environment

The app uses `VITE_API_BASE_URL` when provided. If it is unset, the code falls back to the default API base URL defined in `src/config.ts`.

### Build

```bash
npm run build
```

### Tests

```bash
npm test
npm run lint
```

## Offline Behavior

1. Build and preview the app:

```bash
npm run build
npm run preview
```

2. Open the app in Chrome or Edge.
3. In DevTools, switch the Network tab from `Online` to `Offline`.
4. Refresh the page to confirm the PWA shell loads from cache.
5. Create or edit an inspection.
6. Confirm that inspection data remains available offline and sync resumes after reconnecting.

## Application Model

This is no longer a simple single-tenant form demo.

- **Tenant bootstrap**: the app requests `/tenant-config` and merges the response with local tenant defaults.
- **Tenant selection**: the active tenant comes from stored preference first, then hostname fallback.
- **Login gating**: routes are protected when the tenant bootstrap marks login as required.
- **Localization**: the app starts with bundled fallback labels, then fetches translations for the selected language.
- **Background sync**: a headless `BackgroundUploadManager` continuously drains the local sync queue while online.

## Storage Model

Inspection persistence is split by responsibility.

### IndexedDB

Primary inspection data lives in IndexedDB.

- `react-poc-app-data`
- Stores: `inspections`, `currentSessions`, `formData`, `syncQueue`, `workerLeases`, `meta`
- Scope key format: `{tenantId}:{userId}`
- Migrates legacy inspection records from older `localStorage` keys on first access

Attachment blobs live in a second IndexedDB database.

- `react-poc-form-files`
- Store: `files`

### localStorage

`localStorage` is still used, but only for lightweight browser state.

- Tenant preference
- Theme preference
- Font preference
- Language preference
- User auth state (`userId`, roles)
- Legacy customization values that are lazily migrated into newer preference keys

## Sync Model

Unsynced inspections are queued locally and uploaded in the background.

- Queue entries are stored per tenant/user scope.
- Each queue record keeps a durable idempotency key.
- Failed uploads are retried with exponential backoff and jitter.
- A worker lease in IndexedDB prevents multiple tabs from processing the same queue concurrently.
- Uploaded inspections are removed from the queue after success.

## Project Structure

```text
src/
|-- BackgroundUploadManager.tsx    # Online/offline-aware queue processor
|-- ConnectivityContext.tsx        # Connectivity checks and status state
|-- Layout.tsx                     # Shared app shell for authenticated routes
|-- LocalizationContext.tsx        # Language state and translation loading
|-- TenantBootstrapContext.tsx     # Tenant bootstrap fetch + config state
|-- appPreferences.ts              # localStorage-backed UI preferences
|-- appState.ts                    # Preference state + cross-tab notifications
|-- auth.ts                        # Simple auth persistence and permissions
|-- config.ts                      # Tenant resolution and API URL builders
|-- main.tsx                       # App bootstrap + provider composition
|-- routes.tsx                     # Route tree and auth guards
|-- syncQueue.ts                   # Local sync queue and worker lease logic
|-- components/
|   `-- FormRenderer.tsx           # Schema-driven form renderer
|-- pages/
|   |-- Home.tsx
|   |-- Login.tsx
|   |-- Register.tsx
|   |-- NewInspection.tsx
|   |-- FillForm.tsx
|   |-- MyInspections.tsx
|   `-- DebugInspection.tsx
|-- repositories/
|   `-- inspectionRepository.ts    # Inspection/form data persistence layer
|-- resources/
|   |-- electrical.json
|   |-- electrical-sf.json
|   |-- hvac.json
|   |-- safety-checklist.json
|   `-- translations/
`-- utils/
    |-- appDataStore.ts            # IndexedDB storage + localStorage migration
    |-- fileStorage.ts             # IndexedDB file/blob storage
    `-- FormValidator.ts           # Validation and visibility logic
```

## Forms and Content

Form schemas are loaded from the API at `/form-schemas/:formType`. The repository still includes local schema assets under `src/resources/` for supported form types:

- `electrical`
- `electrical-sf`
- `hvac`
- `safety-checklist`

Translations are fetched from `/translations/:language` with bundled fallback labels used when the request fails.

## Routes

- `/` redirects to `/home` or `/login` based on tenant bootstrap and auth state
- `/login` handles tenant-aware login
- `/register` handles tenant-aware registration
- `/home` shows the main landing page
- `/new-inspection` starts a new inspection
- `/fill-form/:sessionId` edits an inspection session
- `/my-inspections` lists saved inspections for the active tenant/user scope
- `/debug-inspection/:sessionId` inspects stored data for a session

## Deployment to Azure

The project is set up for Azure Static Web Apps.

- Build output: `dist`
- SPA routing should fall back to `index.html`
- The frontend expects the API endpoints described in `src/config.ts`

The existing GitHub Actions workflow builds and deploys the app on pushes and pull requests to `main`.

## Scripts

```bash
npm run dev
npm run build
npm run preview
npm run typecheck
npm run lint
npm test
npm run test:coverage
```

## Browser Support

- Chrome / Edge 90+
- Firefox 88+
- Safari 14+
- Modern mobile browsers

## License

MIT
