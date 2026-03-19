# QHVAC Multi-Tenant Inspection Platform

An offline-capable, multi-tenant platform for inspection and field workflow delivery, built with React, TypeScript, and Cloudscape Design Components. The current repo already includes tenant branding, tenant bootstrap, localization, role-based customization, durable sync queueing, file uploads, and PWA behavior. That places the product boundary in platform territory rather than in a narrow single-purpose form app.

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

## Product Boundary

This repository should be treated as the frontend for a multi-tenant operations platform that happens to deliver inspection workflows.

In bounds:

- Tenant-aware runtime bootstrap, branding, language, and feature enablement
- Per-tenant and per-user data isolation across local storage and sync processing
- Role-based experience differences, especially for tenant selection and customization
- Offline capture, attachment handling, retryable background synchronization, and explicit conflict resolution for multi-device edits
- Platform-level administration surfaces for tenant configuration, rollout control, and operational support
- Operational concerns such as audit trails, supportability, diagnostics, and SLA-oriented health visibility

Out of bounds:

- Treating the product as a one-off hard-coded form experience for a single customer
- Embedding tenant-specific business rules directly into scattered UI code without governance
- Assuming manual support intervention is an acceptable substitute for admin tooling or observability
- Treating sync, upload, and localization behavior as secondary UX details instead of platform capabilities

## Platform Implications

Because the platform already supports tenant bootstrap, localization, sync queueing, file upload, role-sensitive customization, and PWA/offline behavior, the next design decisions should optimize for controlled multi-tenant operations.

- **Admin tooling**: provide first-class admin surfaces for tenant onboarding, tenant selection, branding overrides, enabled forms, localization choices, login policy, and support actions such as queue retry or inspection troubleshooting.
- **Config governance**: treat tenant bootstrap and UI/runtime configuration as governed artifacts with schema validation, versioning, change history, review/approval flow, and safe rollout or rollback between environments.
- **Auditability**: capture who changed tenant config, roles, forms, translations, and support state, along with what changed, when it changed, and which tenant or user scope was affected.
- **SLA-minded operations**: expose queue depth, retry age, upload failure rate, stale lease detection, bootstrap failures, translation load failures, storage pressure, and tenant-scoped health indicators so support teams can manage reliability intentionally.

## Operating Model

The platform should be designed around a few clear responsibility boundaries.

- **Tenant runtime plane**: bootstrap configuration, branding, login requirements, enabled forms, and localization defaults resolved before normal app use
- **Work execution plane**: inspection capture, attachment storage, local persistence, background sync, and recovery from connectivity loss
- **Admin plane**: governed configuration changes, tenant support tools, diagnostics, and role-restricted operational actions
- **Control and evidence plane**: audit logs, config history, support event traces, and reliability telemetry suitable for compliance and SLA review

## Admin and Governance Requirements

The repo does not need every platform feature implemented yet, but it should be designed so these capabilities fit naturally:

- Tenant configuration must be centrally managed, validated, and promotable across environments
- Role claims should come from the backend identity boundary, with the frontend enforcing capability checks rather than inventing long-term authorization rules
- Support users need visibility into sync failures, stuck uploads, missing files, and tenant bootstrap issues without requiring direct database access
- Configuration changes should be attributable, diffable, and reversible
- Tenant-facing behavior should be explainable from config plus audit records, not tribal knowledge

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
Set the active environment's `apiBearerToken` in `src/app-core/resources/governedAppConfig.json` when APIM requires a JWT, or persist a token at runtime in `localStorage.apiAccessToken` for local debugging.
Set `VITE_PERFORMANCE_TELEMETRY_URL` to a collector endpoint to enable real-user performance telemetry.
Set `VITE_PERFORMANCE_TELEMETRY_SAMPLE_RATE` to a value between `0` and `1` to control sampling density.

### Backend Contracts

The frontend now carries an explicit backend contract snapshot at `contracts/backend.openapi.json` and generated DTOs at `src/contracts/backend.generated.ts`.

- Refresh the snapshot and regenerate types from your local Swagger host with `npm run contracts:refresh`
- Regenerate types from the checked-in snapshot only with `npm run contracts:generate`
- The default Swagger source is `http://localhost:5108/swagger/v1/swagger.json`

Client adapters in `src/contracts/backend.ts` are the boundary between generated transport shapes and the app's domain/runtime models. That layer is where documented Swagger contracts and temporary compatibility shims meet, including the current undocumented upload `409 Conflict` body.

### Build

```bash
npm run build
```

### Tests

```bash
npm test
npm run lint
npm run typecheck
npm run test:coverage
```

### Release Governance

CI enforces release gates before deployment:

```bash
npm run lint
npm run typecheck
npm run test:coverage
npm run audit:deps
npm run build
npm run bundle:check
```

`npm run bundle:check` now enforces both whole-app bundle budgets and route-level budgets for the lazy-loaded shell, support, form, and auth surfaces.
`npm run deps:review` produces an installability review from `npm outdated` and `npm audit`.

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

This is a platform shell for tenant-specific workflow applications, not a simple single-tenant form demo.

- **Tenant bootstrap**: the app requests `/tenant-config?tenantId=:tenantId` and merges the response with local tenant defaults.
- **Tenant selection**: the active tenant comes from stored preference first, then hostname fallback.
- **Login gating**: routes are protected when the tenant bootstrap marks login as required.
- **Localization**: the app starts with bundled fallback labels, then fetches translations for the selected language.
- **Background sync**: a headless `BackgroundUploadManager` continuously drains the local sync queue while online.
- **Role-aware customization**: tenant switching and customization permissions are already role-gated in `src/auth.ts`.
- **Operational diagnostics**: the stored inspection debug route and queue state are early indicators of the admin/support surface the platform needs.

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

### Conflict Resolution

Offline edits now follow an explicit optimistic-concurrency model instead of relying on generic retry behavior.

- Each inspection carries a local `clientRevision`, the last acknowledged `baseServerRevision`, and a fixed merge policy of `manual-on-version-mismatch`.
- Local form edits increment the client revision and clear any stale conflict marker before the next upload is queued.
- Each queued upload sends the current client revision, the base server revision, and the merge policy together with the idempotency key.
- If the backend accepts the upload, the inspection stays `Uploaded` and the server revision returned by the backend becomes the new local base revision.
- If the backend responds with `409 Conflict`, the queue entry moves to a non-retrying `conflict` state and the inspection moves to `Conflict`.
- Conflict handling is operator-visible in the inspection list, debug inspection screen, and support console, including the detected server revision, conflict timestamp, and any conflicting field list returned by the backend.
- Automatic retries continue for transport and transient server failures, but not for version conflicts. A conflicted inspection must be reviewed and explicitly requeued after the operator or user resolves the data divergence.

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

Form schemas are loaded from the API at `/form-schemas/:formType`, but the client now treats tenant-delivered schemas as governed artifacts:

- remote schemas must satisfy the runtime schema contract before they are rendered
- optional compatibility metadata can block artifacts that target a different runtime version
- the app caches the last known good schema per tenant and form type and falls back to that or the bundled baseline when a rollout is bad

Translations are fetched from `/translations/:language` with the same protections:

- translation payloads may only override known keys with compatible value types
- invalid or incompatible rollouts fall back to the last known good artifact, then to bundled labels

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
npm run audit:deps
npm run deps:review
npm run bundle:check
npm run ci:verify
```

## Browser Support

- Chrome / Edge 90+
- Firefox 88+
- Safari 14+
- Modern mobile browsers

## License

MIT

