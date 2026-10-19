# UI audit — baseline

## Scope and evidence

This audit inspected the checked-in Next.js page, global stylesheet, Expo screen, shared API client, package manifests, backend test layout, and existing project status notes on 17 October 2026. The browser and mobile applications could not be started because the checkout contained neither `node_modules` nor a `pnpm-lock.yaml`, and registry installation did not complete. The visual findings below are therefore source-level findings, not claims of live-device testing.

## Current stack

- Web: Next.js 16, React 19, one client-side page, handcrafted CSS, Playwright configuration and one workflow specification.
- Mobile: Expo 57, React Native 0.86, one `App.tsx` screen, Expo location and image-picker APIs.
- Shared: a TypeScript API client in `packages/api-client`; FastAPI backend with database migrations and workflow tests.
- Existing routing/state: no role-specific route structure. The role branch, forms, list, detail, and review UI reside in monolithic web and mobile files.
- Data/API: the interfaces call FastAPI directly. The supplied project status says the server may be available, but the autonomous default requires a labelled mock adapter when it is not.

## Existing surfaces

| Surface | Status | Notes |
|---|---|---|
| Citizen submission and tracking | Incomplete | Present in both apps as a long single form; lacks the requested five-step, draft-resilient journey and scope message. |
| Officer review | Incomplete | A GRO can change status and attach a citizen-visible note. Candidate links, priority explanation, routing, work review, response, appeals, and audit history are absent. |
| Field officer | Missing | No assignments, offline queue, evidence capture workflow, or review submission. |
| Senior dashboard | Missing | No labelled metrics, map, trends, hotspot caveat, or export. |
| Technical admin | Missing | No users/roles, jurisdiction, mapping, or deadline configuration screens. |
| Loading/empty/error/offline/success coverage | Incomplete | Basic busy/error/empty text exists; explicit offline, loading skeleton, and designed recovery states do not. |

## Defects and risks

### P0 — blocking the requested work

1. The repository lacks a `pnpm-lock.yaml` and installed packages. No source build, typecheck, test, E2E, or visual audit can currently run.
2. The project has no Git metadata, preventing the requested small, reviewable commits.
3. The local workspace package was declared as a registry dependency (`*`); Phase 0 corrects it to `workspace:*`.

### P1 — material product and compliance gaps

1. Both app screens violate the required architecture: role UI, forms, requests, and controls are concentrated in one file rather than role-isolated features with app-owned primitives.
2. Raw colours, font sizes, spacing, and visible string literals appear throughout UI source; no shared token package or message catalogue exists.
3. No persistent Demo data label, mock transport, configuration-based deadline, offline handling, i18n scaffold, route error boundary, or sign-out redirect from an environment URL exists.
4. Current status lifecycle (`submitted`, `under_review`, `in_progress`, `resolved`, `rejected`) does not represent the required typed lifecycle and actor permissions.
5. The web and mobile reporting forms require exact coordinates and lack map selection, address search, accuracy display, autosaved drafts, second concern, and structured evidence states.
6. Current supplied copy refers to a map picker as planned. The target UI must omit unavailable controls and present a working experience instead.

### P2 — design and usability gaps

1. The web desktop layout has a two-column form/detail design but no phone navigation pattern, tablet rail, desktop review workspace, container-query behaviour, dark theme, or safe-area treatment.
2. CSS uses an older green palette rather than the specified civic-blue token system and does not establish the required type scale, 4-point spacing rhythm, or content-width strategy.
3. The mobile screen uses fixed style literals and a single scroll view; it has no tab shell, font-scale policy, orientation/split-view behaviour, or explicit keyboard controller strategy.

## Stack decision

The repository already uses the blueprint target of **Next.js + TypeScript** for web and **Expo + TypeScript** for mobile. Retain this stack. Replacing web with Vite would introduce avoidable migration risk and offers no evidence-backed benefit. The Phase 1 restructuring should preserve API behaviour while introducing packages for pure core logic, tokens, and mock data.

## Phase plan

1. Phase 0: restore reproducible package installation, lockfile, checks, and evidence collection.
2. Phase 1: isolate app structure, create core/tokens/mock packages, shared lifecycle, message catalogue, themes, app shells, and states.
3. Phase 2: replace the citizen form with the mobile-first reporting, tracking, feedback, and appeal flows.
4. Phase 3: create the web officer workspace with officer-confirmed incident, priority, routing, response, and appeal work.
5. Phase 4: implement field assignment, offline-safe evidence handling, and later synchronisation.
6. Phase 5: provide read-only, clearly labelled reports/incidents analytics and exploratory maps.
7. Phase 6: run full E2E, accessibility, performance, fresh-clone, and human-review checks.
