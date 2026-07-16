# MedCareSO renderer modularization (v2.1.1)

## Scope and compatibility

This refactor keeps the existing Electron preload, database, authentication, licensing, visual layout, and user workflows. It introduces native browser ES modules without adding a frontend framework or a bundler. Electron continues to load `src/renderer/index.html` through `file://`, so development and packaged builds use the same module graph.

When no package configuration exists, the compatibility default is intentionally permissive: shared features and all known specialty modules are enabled. An explicit empty `enabledSpecialties` list disables every specialty. The configured active specialty is repaired to the first enabled specialty when necessary.

## Initial audit

The original renderer consisted of one 6,000+ line HTML document, a 16,000+ line stylesheet, and more than thirty order-dependent classic scripts. The audit found:

- duplicate IDs for inventory pagination and medication forms;
- duplicate declarations inside calendar and rehabilitation scripts;
- cross-script global helper collisions for escaping, date formatting, currency formatting, rich text, colors, and mojibake repair;
- direct `window.api` access spread throughout patient, appointment, and inventory controllers;
- package configuration fetched independently by multiple scripts;
- specialty scripts loaded unconditionally at startup;
- extensive inline event handlers and implicit global compatibility dependencies.

The duplicate IDs were renamed to semantic, unique IDs. Superseded functions were removed and remaining helper names were scoped to their domain. `scripts/check-renderer-html.mjs` and `scripts/check-renderer-globals.mjs` now prevent these regressions.

## Runtime architecture

The bootstrap order is explicit:

1. Wait for the DOM.
2. Load the current user and package configuration once.
3. Publish immutable compatibility context through `window.medcareApp`.
4. Initialize shared feature modules.
5. Dynamically import enabled specialty entry points.
6. Start the remaining legacy application initialization.

`src/renderer/app/bootstrap.js` owns this sequence. The new directories have focused responsibilities:

```text
renderer/
  app/                 application bootstrap
  core/
    api/               normalized IPC invocation and errors
    auth/              current-user loading
    legacy/            explicit temporary window bridge
    logging/           structured, non-sensitive diagnostics
    package/           normalized and cached package configuration
    router/            section access and lifecycle routing
    specialty/         specialty registry and conditional loader
    state/             application store and event bus
  features/
    patients/          API, state, forms, search, safe list rendering
    appointments/      API, state, safe patient selector
    inventory/         API, state, pagination
  shared/utils/        DOM helpers
  specialties/         lazy specialty entry points
```

Native ES modules were selected because they work in Electron's packaged `file://` renderer and avoid introducing a build-time/runtime mismatch. Vite can be considered later when the remaining classic scripts and inline handlers have been migrated.

Electron keeps renderer sandboxing enabled. Because sandboxed preload scripts cannot `require()` arbitrary local files, `scripts/build-preload.mjs` inlines the shared IPC contract into the generated `src/preload/preload-bundled.cjs`. Development, tests and packaging regenerate this file automatically; `preload.cjs` and `src/shared/ipc-contracts.cjs` remain the editable sources.

## API and state rules

Feature code calls its domain API adapter, never `window.api` directly. `invokeApi` converts failed backend envelopes and thrown IPC errors to `ApiError`, preserves error codes, supports loading callbacks and optional timeouts, and unwraps successful `data` values including explicit `null`. Compatibility controllers use `invokeLegacyApi` only while they still expect legacy envelopes.

The shared response contract is:

```js
{ success: true, data: value }
{ success: false, error: { code: 'ERROR_CODE', message: 'Readable message' } }
```

`appState` is the cross-feature store. Feature-local mutable values remain in their feature state modules. `eventBus` is used for meaningful domain notifications such as `patient:created`, `patient:updated`, `appointment:updated`, and `inventory:changed`; it is not a second API layer.

Patient search uses a request version so slow responses cannot overwrite newer searches. Rendering helpers build DOM nodes with `textContent` and event listeners instead of interpolating patient data into HTML.

## Packages and specialties

`packageConfigService` is the only package configuration reader. It normalizes current and legacy fields, caches the startup request, exposes feature/specialty predicates, and supports a deliberate refresh after configuration changes.

The specialty registry maps stable specialty IDs to dynamic imports and navigation sections:

- `general` -> shared application only;
- `rehabilitation` (including legacy `mpr`) -> rehabilitation, physiotherapy staff, and daily summary;
- `dentistry` -> dentistry;
- `cardiology` -> cardiology.

Only enabled registry entries are imported. A disabled specialty therefore does not execute its legacy script. Reconciliation destroys modules that were disabled at runtime, imports newly enabled modules, and updates navigation availability. Specialty entry points expose `init()` and `destroy()`; their destroy paths remove registered compatibility globals and close long-lived resources such as the dentistry socket.

Treatment plans remain a shared classic module because the existing application exposes them outside a dentistry-only package. Reclassifying them would be a behavior change and should be done only after a product-level package decision.

## Legacy boundary

Twenty-six classic scripts remain in `index.html`. Their order is still significant and is checked for global declaration collisions. Migrated patient, calendar, inventory, rehabilitation, physiotherapy staff, daily summary, dentistry, and cardiology scripts are no longer static tags.

Temporary globals are published only through `core/legacy/legacy-bridge.js` or deliberate existing assignments. This bridge documents compatibility with inline handlers and classic modules while allowing globals to be unregistered during teardown. New modules must import dependencies instead of adding implicit globals.

The CSP removes `unsafe-eval` and restricts content to local resources and required localhost WebSocket connections. `unsafe-inline` remains temporarily because the legacy HTML still contains inline handlers and the early theme script. Removing it requires migrating those handlers to delegated listeners.

## Quality gates

Run the complete renderer and IPC suite with:

```powershell
npm test
```

It covers unique HTML IDs, classic-script global collisions, API error/response behavior, package defaults and validation, conditional specialty imports, feature foundations, safe patient/appointment rendering, inventory pagination, ES-module imports, and preload/backend IPC synchronization.

Build the packaged Windows application with:

```powershell
npm run build
```

For future modules:

- use `init()`/`destroy()` for listeners, timers, sockets, and subscriptions;
- keep one cleanup callback for every registered listener or subscription;
- add IPC calls to a domain API adapter;
- render untrusted values with `textContent`;
- add a registry entry for specialty-only code and verify a disabled-package test;
- run `npm test`, a development Electron smoke test, and a packaged Windows smoke test.

## Remaining migration backlog

The next safe slices are patient details/documents, payments/expenses, waiting room, treatment plans, analysis/imaging, settings, and package administration. Each slice should move its IPC access into an adapter, replace inline handlers, add lifecycle cleanup, and then remove its classic script tag. Splitting the large HTML and CSS should follow component migration so selectors and navigation behavior remain stable.
