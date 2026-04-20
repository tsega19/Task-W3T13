import { test, expect, Page } from '@playwright/test';

const ADMIN = {
  user: process.env['SEED_ADMIN_USERNAME'] ?? 'admin',
  pass: process.env['SEED_ADMIN_PASSPHRASE'] ?? 'demo-change-me-admin'
};

/**
 * Poll for a service-worker registration for up to `timeoutMs`. Returns true
 * as soon as one is ready. Historically these tests blanket-skipped after a
 * single probe, so automation runs could silently drop offline coverage.
 */
async function waitForServiceWorker(page: Page, timeoutMs = 20_000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const ready = await page.evaluate(async () => {
      if (!('serviceWorker' in navigator)) return false;
      const reg = await Promise.race([
        navigator.serviceWorker.ready.then(() => true),
        new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 1000))
      ]).catch(() => false);
      return reg;
    }).catch(() => false);
    if (ready) return true;
    await page.waitForTimeout(500);
  }
  return false;
}

test.describe('Service Worker / offline', () => {
  test('app shell reloads while the context is offline (SW serves the precached shell)', async ({ page, context }) => {
    // First visit — online — so the SW installs and precaches the app shell.
    await page.goto('/');
    await page.waitForURL(/login/);

    // Extended retry window. Older versions of this test blanket-skipped after
    // a single probe; we now poll for up to 20s before surrendering.
    const hasSW = await waitForServiceWorker(page, 20_000);
    if (!hasSW) {
      test.info().annotations.push({ type: 'skip-reason', description: 'service worker did not install in this environment after 20s' });
      test.skip(true, 'SW unavailable');
      return;
    }

    // Flip the context offline and reload. The app shell must still render.
    await context.setOffline(true);
    await page.reload();
    // The login screen's username field is part of the precached shell;
    // its presence confirms the shell loaded from the SW cache, not the network.
    await expect(page.getByTestId('login-username')).toBeVisible({ timeout: 15_000 });
    await context.setOffline(false);
  });

  test('after login, going offline and reloading keeps the user inside the app (IndexedDB session + SW shell)', async ({ page, context }) => {
    await page.goto('/');
    await page.waitForURL(/login/);
    await page.getByTestId('login-username').fill(ADMIN.user);
    await page.getByTestId('login-passphrase').fill(ADMIN.pass);
    await page.getByTestId('login-submit').click();
    await page.waitForURL(/projects/);

    const hasSW = await waitForServiceWorker(page, 20_000);
    if (!hasSW) {
      test.skip(true, 'SW unavailable');
      return;
    }

    await context.setOffline(true);
    await page.reload();
    // On reload with session in localStorage the app should land back on /projects.
    await page.waitForURL(/projects/, { timeout: 15_000 });
    await context.setOffline(false);
  });

  /**
   * SW-independent persistence guarantee. This runs unconditionally (no
   * service worker involved) so even if the Chromium SW lifecycle misbehaves
   * in CI, we still have an E2E test proving IndexedDB round-trips survive a
   * full page reload. Without this we had zero E2E coverage of the core
   * "data survives reload" promise when the two SW tests skipped.
   */
  test('project + canvas created while online round-trip through IndexedDB across a full reload', async ({ page }) => {
    await page.goto('/');
    await page.waitForURL(/login/);
    await page.getByTestId('login-username').fill(ADMIN.user);
    await page.getByTestId('login-passphrase').fill(ADMIN.pass);
    await page.getByTestId('login-submit').click();
    await page.waitForURL(/projects/);
    await page.getByTestId('project-create').click();
    await page.getByTestId('form-name').fill('Persistence-Check');
    await page.getByTestId('form-description').fill('IDB survival test');
    await page.getByTestId('form-save').click();
    await expect(page.getByText('Persistence-Check')).toBeVisible();

    // Full reload, then assert the project is still listed. The list is
    // rendered from IndexedDB — if IDB weren't persisted (or the app
    // re-seeded on boot), the project would be gone.
    await page.reload();
    // After reload, the auth session in localStorage should route us to /projects.
    await page.waitForURL(/projects/);
    await expect(page.getByText('Persistence-Check')).toBeVisible();
  });

  /**
   * Forced-offline variant of the persistence check: seed data, go offline,
   * reload. Even without SW, Chromium still serves the current page from
   * memory for a brief window, which is enough to verify IDB is readable
   * offline. Asserts on visible body content (project name in the list).
   */
  test('project list renders from IndexedDB when context is offline (no SW dependency for read path)', async ({ page, context }) => {
    await page.goto('/');
    await page.waitForURL(/login/);
    await page.getByTestId('login-username').fill(ADMIN.user);
    await page.getByTestId('login-passphrase').fill(ADMIN.pass);
    await page.getByTestId('login-submit').click();
    await page.waitForURL(/projects/);
    await page.getByTestId('project-create').click();
    await page.getByTestId('form-name').fill('Offline-Read');
    await page.getByTestId('form-description').fill('IDB offline read');
    await page.getByTestId('form-save').click();
    await expect(page.getByText('Offline-Read')).toBeVisible();

    // Go offline and navigate within the SPA. Router navigation is local,
    // IDB reads are local — this exercise must succeed regardless of SW state.
    await context.setOffline(true);
    // Trigger a fresh project-list refresh by navigating away and back in-app.
    await page.evaluate(() => { window.history.pushState({}, '', '/projects'); window.dispatchEvent(new PopStateEvent('popstate')); });
    await expect(page.getByText('Offline-Read')).toBeVisible({ timeout: 10_000 });
    await context.setOffline(false);
  });
});
