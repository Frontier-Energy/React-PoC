# Plan: Tenant Customization (Spec 001)

## Scope

Implement tenant awareness and tenant switching across authentication and in-app pages, aligned to `spec.md`.

## Requirements Mapping

- FR-001 predefined tenants: add a fixed tenant catalog in configuration.
- FR-001 default tenant (`frontierDemo`): resolve from hostname with fallback.
- FR-001 user can change tenant: expose tenant dropdown in customization drawer.
- Scenario: show tenant on sign-in page.
- Scenario: show tenant across app pages.
- Scenario: tenant appears in customization flyout as selectable dropdown.
- Edge case: invalid hostname format defaults to `frontierDemo`.

## Implementation Steps

1. Tenant model and resolution
- Define tenant catalog in `src/config.ts`.
- Support hostname resolution for `xxx.qcontrol.frontierenergy.com`.
- Persist/read selected tenant from local customization storage.
- Keep API URL helpers tenant-aware.

2. Layout + customization integration
- Extend layout customization state to include `tenantId`.
- Render active tenant in app header.
- Add tenant `Select` control in customization drawer.
- On tenant change, apply tenant UI defaults (theme/font) for visible UI response.

3. Authentication page visibility
- Show active tenant on `Login` page.
- Show active tenant on `Register` page.

4. Localization updates
- Add localization labels for tenant field names in `en` and `es`.

5. Validation
- Build app to verify TypeScript and bundling pass.

## Definition of Done

- Tenant is always displayed on sign-in and routed app pages.
- Customization drawer includes tenant dropdown and updates active tenant.
- Invalid/non-matching hostname falls back to `frontierDemo`.
- App compiles successfully.
