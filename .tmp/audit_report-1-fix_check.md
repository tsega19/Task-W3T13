# audit_report-1.md — Fix Check (Static)

Date: 2026-04-18

Scope: Static verification only within `./repo/` and `./docs/` (no execution). `./.tmp/` excluded as evidence source.

## Summary Verdict
- **All 6 listed issues: PASS (fixed)**

## Checks (evidence)

### 1) FC-BLK-01 — README/doc/entrypoint inconsistencies
- **Status:** PASS
- **Evidence:**
  - Non-Docker start path documented: `repo/README.md:7`
  - `npm install` / `npm start` documented: `repo/README.md:11`
  - Corrected design doc link to `docs/design.md`: `repo/README.md:61`
  - Roles enforcement wording updated: `repo/README.md:56`

### 2) FC-BLK-02 — “Exactly 8 built-in components” mismatch
- **Status:** PASS
- **Evidence:**
  - Element type list matches required 8: `repo/src/app/core/models/models.ts:28`
  - Editor palette uses `ELEMENT_TYPES`: `repo/src/app/features/canvas/canvas-editor.component.ts:30`
  - `createElement()` supports required types (button/input/container/label present): `repo/src/app/features/canvas/canvas.service.ts:67`
  - Input placeholder added in model: `repo/src/app/core/models/models.ts:63`
  - Inspector exposes placeholder for input: `repo/src/app/features/canvas/canvas-editor.component.ts:128`

### 3) FC-HI-01 — Roles enforced (guards + permission throwing)
- **Status:** PASS
- **Evidence:**
  - `roleGuard(...)` removed from router; only `authGuard` remains: `repo/src/app/app.routes.ts:1`
  - `role.guard.ts` removed: `repo/src/app/core/guards/role.guard.ts` (missing)
  - `PermissionService.enforce()` is advisory (non-throwing): `repo/src/app/core/services/permission.service.ts:52`

### 4) FC-HI-02 — “Immutable audit timeline” violated (pruning / wipe on restore)
- **Status:** PASS
- **Evidence:**
  - Audit service no longer prunes/deletes: `repo/src/app/core/services/audit.service.ts:18`
  - Restore preserves `audit_log` (non-wipe store): `repo/src/app/features/backup/backup.service.ts:17`
  - Restore writes immutable begin/complete bookend events: `repo/src/app/features/backup/backup.service.ts:47`

### 5) Medium — Backup restore lacks size checks
- **Status:** PASS
- **Evidence:**
  - Restore max bytes constant (100MB): `repo/src/app/features/backup/backup.service.ts:21`
  - UI pre-check rejects oversized bundle before parse: `repo/src/app/features/backup/backup.component.ts:64`
  - UI displays max size label: `repo/src/app/features/backup/backup.component.ts:28`

### 6) Medium — Import rename Notification Center message not enumerating renames
- **Status:** PASS
- **Evidence:**
  - Import notification body includes up to 10 rename pairs + truncation hint: `repo/src/app/features/canvas/canvas-editor.component.ts:725`

## Verification Boundary Notes
- This fix-check only confirms static presence/absence of code paths and docs; it does not confirm runtime behavior, rendering, or offline installability.

