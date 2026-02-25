# Plan: AI + Spec-Driven Development Website (v1)

## Architectural Priority

Primary constraint: Long-term extensibility.

The system must be easy to evolve without large-scale refactoring. Clear
boundaries and predictable structure are more important than short-term
convenience.

------------------------------------------------------------------------

## High-Level Architecture

Static React application built with Vite, deployed via Azure Static apps.

Design principles: - Clear separation of content, UI, infrastructure,
and service integration. - No tightly coupled global state. -
Feature-driven folder structure. - Offline capability isolated from
application logic.

------------------------------------------------------------------------

## Technology Stack

### Frontend

-   React 18
-   TypeScript
-   Vite (static build output)
-   React Router (client-side routing)

Rationale: - React provides long-term ecosystem stability. - TypeScript
enforces structure as the project grows. - Vite keeps build system
simple and fast. - Router enables future feature expansion without
restructuring.

------------------------------------------------------------------------

## Project Structure

    /src
      /Mail.tsx
      /Pages
        /resources
        /utils
        /tools
      /components
      /layout
      /utils
    /public

### Structure Rules

-   Each feature has its own folder.
-   Shared UI components live in /components.
-   Layout components live in /layout.
-   All API interactions go through /services.
-   Service worker and offline logic live in /pwa.
-   No cross-feature imports unless explicitly shared.

This prevents entangled growth.

------------------------------------------------------------------------

## Routing Strategy

-   Client-side routing with React Router.
-   Top-level routes match Information Architecture.
-   Lazy-load feature routes to enable future performance scaling.

Example:

/ → Home\
/learn → Learn Hub\
/learn/intro → 30-minute intro\
/tools → Tools\
/templates → Templates

------------------------------------------------------------------------

## Content Strategy

Content stored as: - Markdown files where possible. - MDX considered if
interactive examples are required.

------------------------------------------------------------------------

## Offline Strategy (Feature 002)


Design constraints: - Cache static assets. - Network-first for API
calls. - Offline fallback page. - Versioned cache invalidation strategy.

Service worker must remain isolated from core app logic.

------------------------------------------------------------------------

## Web Service Integration

All external communication flows through:

/src/services/api.ts

Rules: - Centralized base URL configuration. - No direct fetch calls
inside components. - Typed request/response models. - Future-compatible
with backend introduction.

------------------------------------------------------------------------

## CI/CD

GitHub Actions workflow:

On push to main: 1. Install dependencies 2. Run lint 3. Run tests 4.
Build 5. Deploy dist/ to Azure Static Pages

Deployment must be deterministic and repeatable.

------------------------------------------------------------------------

## Extensibility Strategy

Future-ready for:

-   Backend integration (APIM, connected to web service)
-   Search capability
-   Authentication (if required)

All future features should be implementable without restructuring root
folders.

------------------------------------------------------------------------

## Tradeoffs

-   No SSR 
-   No global state library (add only if required)

------------------------------------------------------------------------

## Definition of Architectural Done (v1)

-   Folder structure established
-   Routing implemented
-   Layout shell complete
-   Feature placeholders exist for all top-level pages
-   CI workflow runs successfully
-   Site deploys to GitHub Pages


## Design System

Cloudscape Design System (React components)

Rationale:
- Structured and accessible component library
- Scales for future interactive features
- Enforces consistency across features

Rules:
- All UI components use Cloudscape primitives.
- No custom styling outside layout utilities.
- Layout wrappers may be created, but must not duplicate Cloudscape components.