# Tasks: 002 Tenant Initial View

## User Story 1 - Initial view settings (P1)

- [x] T001 [US1] Add startup tenant bootstrap endpoint support in `src/config.ts`.
- [x] T002 [US1] Implement tenant bootstrap fetch/mapping/persistence in `src/tenantBootstrap.ts`.
- [x] T003 [US1] Add `TenantBootstrapProvider` with generic loading page in `src/TenantBootstrapContext.tsx`.
- [x] T004 [US1] Wire startup bootstrap into app root in `src/main.tsx`.
- [x] T005 [US1] Make auth guard conditional on tenant `loginRequired` in `src/routes.tsx`.
- [x] T006 [US1] Prevent manual `/login` usage when tenant does not require login in `src/pages/Login.tsx`.
- [x] T007 [US1] Restrict available inspection forms to tenant-enabled forms in `src/pages/NewInspection.tsx`.
- [x] T008 [US1] Restrict available new-form options to tenant-enabled forms in `src/pages/NewForm.tsx`.
- [x] T009 [US1] Add unit tests for bootstrap behavior with mocked upstream API in `src/tenantBootstrap.test.ts`.
- [x] T010 [US1] Update existing affected tests in `src/pages/Login.test.tsx` and `src/config.test.ts`.

## Validation

- [x] V001 Run unit tests: `npm test` (40 passed).
- [x] V002 Run build: `npm run build` (success).

