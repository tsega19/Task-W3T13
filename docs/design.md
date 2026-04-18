# FlowCanvas Offline Studio - Design

Pure frontend, offline-first diagramming SPA. No backend; all persistence is local (IndexedDB + LocalStorage).

## Module layout

```
repo/src/app/
|-- config/                      # AppConfigService - reads window.__FC_ENV__, typed defaults
|-- logging/                     # LoggerService (redaction, buffered, pluggable sink)
|-- core/
|   |-- models/models.ts         # Typed records for every store
|   |-- services/
|   |   |-- db.service.ts        # IndexedDB via idb + typed per-store facades
|   |   |-- crypto.util.ts       # sha256Hex, uuid
|   |   |-- notification.service.ts  # Toasts + in-app message log
|   |   |-- session-storage.util.ts  # Typed LocalStorage helpers
|   |   |-- audit.service.ts     # Append-only audit timeline
|   |   |-- auth.service.ts      # SHA-256 login, 3-strike cooldown, inactivity watch
|   |   |-- permission.service.ts# Capability matrix - UI filter only (not enforcement)
|   |   `-- broadcast.service.ts # BroadcastChannel wrapper + conflict signal
|   `-- guards/
|       `-- auth.guard.ts        # Redirects to /login when session=null
|-- features/
|   |-- auth/                    # Login screen
|   |-- projects/                # ProjectService + ProjectListComponent
|   |-- canvas/                  # CanvasService + CanvasEditorComponent + import/export helpers
|   |-- admin/                   # Dictionaries/templates/tags/announcements
|   |-- reviewer/                # Reviews + tickets
|   |-- diagnostics/             # Storage, health checks, audit timeline view
|   `-- backup/                  # Backup/restore JSON bundle
|-- workers/
|   |-- import.worker.ts
|   |-- export-svg.worker.ts
|   `-- version-compact.worker.ts
`-- shared/components/           # Toast container, modal, conflict banner
```

## Config flow

1. `repo/docker-entrypoint.sh` reads env vars at container start and writes an `env.js` file that defines `window.__FC_ENV__`.
2. `index.html` loads `env.js` before the Angular bundle.
3. `AppConfigService` is the single reader of `window.__FC_ENV__`; the rest of the app depends on `AppConfigService`.
4. Typed defaults in `buildAppConfig()` cover every variable so local dev without Docker works unchanged.

## Routing and guards

- Router uses `authGuard` only (session required).
- Routes: `login`, `projects`, `canvas editor`, `admin`, `reviews`, `diagnostics`, `backup`.

## Roles - UI convenience filter only (not enforcement)

Roles exist to reduce UI clutter and guide workflows. The app is local-only and single-user per browser profile.

- Components use `PermissionService.can(capability)` to hide/disable UI affordances.
- The app does not use role guards for routing; all non-login routes require only an authenticated session.

Capability matrix (UI filtering):

| Capability | Admin | Editor | Reviewer |
|---|---|---|---|
| project.create/edit/delete | ✓ | ✓ |  |
| project.pin/feature | ✓ |  |  |
| canvas.edit/import/export | ✓ | ✓ |  |
| review.create | ✓ | ✓ | ✓ |
| admin.panel | ✓ |  |  |
| diagnostics.view | ✓ | ✓ |  |
| backup.manage | ✓ |  |  |

## IndexedDB schema

Database: `flowcanvas_db`, version 1. All stores use `keyPath`. Indexes noted.

| Store | Key | Indexes | Purpose |
|---|---|---|---|
| users | id | username (unique) | Seeded at boot; SHA-256 passwordHash; cooldown tracking |
| projects | id | name_ci | Business entities (max 50) |
| canvases | id | projectId | Diagrams (max 20 per project; max 5,000 elements each) |
| versions | id | canvasId | 30 per canvas; oldest pruned when creating the 31st |
| audit_log | id | - | Append-only audit timeline |
| reviews | id | canvasId | Reviews: open/resolved/rejected |
| tickets | id | reviewId | Tickets: priority + status |
| blobs | key | - | Image ArrayBuffers; <= 50 MB each |

## Element palette and constraints

Exactly eight built-in elements:

1. Text
2. Button
3. Input
4. Image
5. Container
6. Label
7. Flow Node
8. Sticky Note

Hard constraints:

- Max 5,000 elements per canvas; cap is enforced with a blocking modal.
- Undo/redo stack size: 200.
- Import max nodes: 1,000 (with validation + dedupe rename).

## Autosave + versioning

- Dirty state is set after every mutation.
- Autosave interval is configurable (default: 10s).
- Version snapshots are created at a coarser cadence (default: 60s gap) and capped at 30 versions per canvas.
- Rollback first saves a "pre-rollback" version, then applies the selected snapshot.

## Undo/redo

- Circular undo stack with a fixed capacity (200 steps).
- Cleared on canvas load and after rollback.

## Web Worker contracts

Workers exist to keep UI responsive during heavy operations.

| Worker | IN | OUT |
|---|---|---|
| import.worker | `{ type:'IMPORT', payload:{ raw, format, existingIds, maxNodes, remainingCap } }` | `{ type:'IMPORT_RESULT', imported, skipped, renamed, total }` |
| export-svg.worker | `{ type:'EXPORT_SVG', payload:{ elements, connections, blobMap } }` | `{ type:'SVG_STRING', svg }` |
| version-compact.worker | `{ type:'COMPACT', payload:{ versions, maxVersions } }` | `{ type:'DELETE_VERSION', id }` × N + `{ type:'COMPACT_DONE' }` |

Implementation note:

- Validation and rendering helpers live outside workers so they can be unit tested; workers are thin "forwarders".

## BroadcastChannel (multi-tab)

- Channel: `flowcanvas-sync`.
- On every canvas save, the editor broadcasts `{ type:'canvas-saved', canvasId, timestamp, tabId }`.
- If another tab saves the currently open canvas, a conflict banner appears with actions:
  - Reload latest
  - Keep mine

## Logging

`LoggerService.info(module, submodule, message, data?)` emits:

```
[module][submodule] message   { redacted data }
```

- Redaction removes typical sensitive keys (`password`, `token`, `secret`, etc.).
- In-memory buffer is capped (used by Diagnostics).

## Diagnostics

Diagnostics focuses on locally verifiable signals:

- Storage estimate (usage/quota/percent) via `navigator.storage.estimate()`.
- IndexedDB health check via a sentinel write/read/delete round trip.
- Audit timeline view (append-only log).

## Backup and restore

Backup is a single JSON bundle that can be exported and imported to recreate local state:

- Projects, canvases, versions, reviews, tickets, blobs, and audit timeline.

Contract:

- Restore should preserve the audit timeline as an immutable record where feasible; destructive "wipe" flows must be explicit to the user.
