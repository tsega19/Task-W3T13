# FlowCanvas Offline Studio - API Specification (Internal)

This project is a **pure frontend** Angular SPA (no backend). "API" in this context means:

- Public TypeScript service contracts used by UI features.
- Local persistence schema (IndexedDB).
- Cross-thread messaging contracts (Web Workers).
- Cross-tab messaging contracts (BroadcastChannel).

Source of truth for types: `repo/src/app/core/models/models.ts`.

## 1) Data model (domain types)

### 1.1 Users and session

- `UserRole`: `'admin' | 'editor' | 'reviewer'`
- `UserRecord`
  - `username` is unique (IndexedDB index `users.username`).
  - `passwordHash` is a SHA-256 hex digest (pseudo-login; local only).
  - Cooldown fields: `failedAttempts`, `cooldownUntil?`.
- `SessionInfo`
  - `issuedAt`, `lastActivity` drive inactivity logout.

### 1.2 Projects

- `ProjectRecord`
  - `tags: string[]`
  - `pinned: boolean`, `featured: boolean`
  - `canvasCount: number`

Constraints (enforced in services/UI):

- Max projects: **50**
- Max canvases per project: **20**

### 1.3 Canvas

- `CanvasRecord`
  - `elements: CanvasElement[]`
  - `connections: CanvasConnection[]`
  - `groups: CanvasGroup[]`
  - `viewState: CanvasViewState`
  - `tags: string[]`
- `CanvasViewState`: `zoom`, `panX`, `panY`, `gridSize`

Element palette (exactly eight):

`ElementType` is one of: `['text','button','input','image','container','label','flow-node','sticky-note']`

Hard limits:

- Max elements per canvas: **5,000** (blocking modal)
- Undo steps: **200** (circular)

### 1.4 Versions

- `VersionRecord`
  - `snapshotJson` contains a full serialized `CanvasRecord` snapshot.
  - `versionNumber` increments per canvas.

Retention:

- Max versions per canvas: **30** (oldest pruned when creating the 31st)

### 1.5 Audit timeline (immutable)

- `AuditEntry`
  - `action`, `entityType`, `entityId`
  - optional `durationMs` for timing-based traces

Contract:

- Audit is append-only by design (do not delete/prune in normal flows).

### 1.6 Reviews and tickets

- `ReviewRecord`
  - `status`: `'open' | 'resolved' | 'rejected'`
- `TicketRecord`
  - `priority`: `'low' | 'medium' | 'high'`
  - `status`: `'open' | 'in-progress' | 'done'`
  - `attachmentIds: string[]` (keys into blobs)

### 1.7 Blobs (images)

- `BlobRecord`
  - `key` is the primary key.
  - `data: ArrayBuffer` holds the binary.

Limits:

- Max blob size: **50 MB** (enforced at pick/import time)

## 2) Persistence API (IndexedDB)

Implementation: `repo/src/app/core/services/db.service.ts`.

Database:

- `DB_NAME = flowcanvas_db`
- `DB_VERSION = 1`

Stores:

| Store | KeyPath | Indexes | Purpose |
|---|---|---|---|
| `users` | `id` | `username` (unique) | Local pseudo-login users |
| `projects` | `id` | `name_ci` | Project entities |
| `canvases` | `id` | `projectId` | Canvas entities |
| `versions` | `id` | `canvasId` | Version snapshots |
| `audit_log` | `id` | - | Immutable audit timeline |
| `reviews` | `id` | `canvasId` | Reviews linked to a canvas |
| `tickets` | `id` | `reviewId` | Tickets linked to a review |
| `blobs` | `key` | - | Binary payloads (images) |

Typed facades (call patterns):

- `db.users.all()`, `db.users.byUsername(username)`, `db.users.put(user)`
- `db.projects.all()`, `db.projects.count()`, `db.projects.put(project)`, `db.projects.delete(id)`
- `db.canvases.byProject(projectId)`, `db.canvases.put(canvas)`, `db.canvases.delete(id)`
- `db.versions.byCanvas(canvasId)`, `db.versions.put(version)`, `db.versions.delete(id)`
- `db.audit.all()`, `db.audit.put(entry)`
- `db.reviews.byCanvas(canvasId)`, `db.reviews.put(review)`, `db.reviews.delete(id)`
- `db.tickets.byReview(reviewId)`, `db.tickets.put(ticket)`, `db.tickets.delete(id)`
- `db.blobs.get(key)`, `db.blobs.put(blob)`, `db.blobs.delete(key)`

Health check:

- `DbService.healthCheck()` performs a real write/read/delete round trip against a sentinel row in `blobs`.
- Returns `{ ok, durationMs, detail }` suitable for recording into the audit timeline.

## 3) Auth API (pseudo-login; local-only)

Primary service: `repo/src/app/core/services/auth.service.ts`.

### 3.1 Login

Inputs:

- `username: string`
- `passphrase: string`

Behavior:

- Hash passphrase using WebCrypto SHA-256.
- Look up user by `username`.
- On mismatch: increment `failedAttempts`.
- Cooldown: after **3** failed attempts, set `cooldownUntil = now + 15 minutes`.
- On success: create `SessionInfo` and persist session to LocalStorage.

### 3.2 Session and inactivity

- `SessionInfo.lastActivity` updates on user interaction and/or periodic checks.
- Inactivity logout: **30 minutes** since last activity.

## 4) Authorization API (roles are UI filters)

Primary service: `repo/src/app/core/services/permission.service.ts`.

Contract:

- Roles are used to **hide/disable UI** affordances for ergonomics.
- There is no role-based route blocking; router uses only `authGuard`.

## 5) Canvas API (editor behaviors)

Primary feature: `repo/src/app/features/canvas/canvas-editor.component.ts` and `repo/src/app/features/canvas/canvas.service.ts`.

Key contracts:

- Element creation/editing respects the **5,000** cap.
- Autosave cadence: every **10 seconds** when dirty.
- Versioning gap: create a version no more frequently than the configured gap (default **60 seconds**).
- Undo/redo: circular stack size **200**.

Import/export helpers (testable outside workers):

- Import validation / normalization: `repo/src/app/features/canvas/import-export.ts`
- SVG render helpers: `repo/src/app/features/canvas/canvas-render.ts`

## 6) Worker message contracts

Workers live under `repo/src/app/workers/`.

### 6.1 Import worker

IN:

```ts
{ type: 'IMPORT', payload: { raw: string, format: 'json'|'csv', existingIds: string[], maxNodes: number, remainingCap: number } }
```

OUT:

```ts
{ type: 'IMPORT_RESULT', imported: number, skipped: number, renamed: number, total: number }
```

### 6.2 Export SVG worker

IN:

```ts
{ type: 'EXPORT_SVG', payload: { elements: CanvasElement[], connections: CanvasConnection[], blobMap: Record<string, ArrayBuffer> } }
```

OUT:

```ts
{ type: 'SVG_STRING', svg: string }
```

### 6.3 Version compaction worker

IN:

```ts
{ type: 'COMPACT', payload: { versions: VersionRecord[], maxVersions: number } }
```

OUT:

- Zero or more: `{ type: 'DELETE_VERSION', id: string }`
- Final: `{ type: 'COMPACT_DONE' }`

## 7) Multi-tab sync contracts (BroadcastChannel)

Primary service: `repo/src/app/core/services/broadcast.service.ts`.

- Channel name: `flowcanvas-sync`
- Message:

```ts
{ type: 'canvas-saved', canvasId: string, timestamp: number, tabId: string }
```

Conflict behavior:

- When a message is received for a canvas currently open in another tab, UI sets a "conflict" signal and shows a conflict banner with:
  - Reload latest
  - Keep mine

## 8) Non-goals (explicitly out of scope)

- Network API, server-side persistence, multi-user collaboration.
- "Real" authentication/authorization security guarantees.
- Server-enforced RBAC (roles are a UI convenience only).
