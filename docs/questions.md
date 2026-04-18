# FlowCanvas Offline Studio - Questions (5) with Assumptions and Solutions

This document intentionally focuses on five high-impact questions. Each includes:

- **Answer**: the expected behavior in the product.
- **Assumption**: what we assume to be true about environment or usage.
- **Solution**: what to build/configure/do to satisfy the requirement.

## 1) Is there a backend API?

**Answer:** No. The app is a pure frontend SPA; persistence is local (IndexedDB + LocalStorage) and there are no server endpoints.

**Assumption:** The deployment environment is air-gapped or untrusted for network access, so the product must run fully offline.

**Solution:** Keep all features client-side and document the internal “API” as service contracts + storage schema (`docs/api_aspec.md`). Avoid adding any network dependency for core flows.

## 2) What does "offline-first" mean here?

**Answer:** The app should keep working without internet and remain usable after refresh/restart.

**Assumption:** Browsers used support Service Workers and IndexedDB (modern Chromium/Firefox/Edge).

**Solution:** Cache static assets via Service Worker and store all user data in IndexedDB (`flowcanvas_db`). Provide a Diagnostics screen that can confirm storage quota and IndexedDB health checks.

## 3) Are roles enforced?

**Answer:** Roles are UI convenience filters only (hide/disable menus/buttons) while routes are protected only by login session.

**Assumption:** This is a single-user-per-browser profile tool (pseudo-login), not a multi-user secure system.

**Solution:** Use `PermissionService.can()` only for UI gating and keep routing protected by `authGuard` only. Document the capability matrix in `docs/design.md`.

## 4) What are the key editor limits (projects/canvases/elements)?

**Answer:** Limits exist to keep the app responsive:

- Up to 50 projects
- Up to 20 canvases per project
- Up to 5,000 elements per canvas (hard cap; block additional adds)
- Undo/redo up to 200 steps

**Assumption:** Users may import or create large diagrams, but we must prevent runaway memory usage and slow UI.

**Solution:** Enforce limits in services/editor logic with user-facing errors/modals. Keep these limits documented in `docs/design.md` and reflected in import/export validation.

## 5) What happens if I open the same canvas in two tabs?

**Answer:** The app detects cross-tab saves and shows a conflict banner offering "Reload latest" or "Keep mine".

**Assumption:** Users sometimes multitask with multiple tabs/windows, and “last save wins” must be made explicit.

**Solution:** Use `BroadcastChannel` (`flowcanvas-sync`) to broadcast `canvas-saved` events and trigger a conflict UI state when another tab saves the currently open canvas. Add a clear UX for resolution and record the choice to the audit timeline when appropriate.
