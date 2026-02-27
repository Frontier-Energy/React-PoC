# Tasks: Tenant Customization (Feature 001)

## Completed

- [x] Add and maintain a predefined tenant catalog with `frontierDemo` default in `src/config.ts`.
- [x] Resolve tenant from hostname pattern `xxx.qcontrol.frontierenergy.com` with fallback to `frontierDemo`.
- [x] Persist and restore selected tenant from customization storage.
- [x] Keep login/register/upload API path helpers tenant-aware.
- [x] Extend layout customization state with `tenantId`.
- [x] Display active tenant in app header for routed pages.
- [x] Add tenant dropdown in customization drawer and wire selection updates.
- [x] Apply tenant-specific UI defaults (theme and font) when tenant changes.
- [x] Display active tenant on login page.
- [x] Display active tenant on register page.
- [x] Provide localization labels for tenant fields in English and Spanish.

## Pending

- [x] Run `npm run build` and confirm TypeScript and bundling succeed.
