import { test, expect, Page } from '@playwright/test';
import * as fs from 'fs';

const ADMIN = {
  user: process.env['SEED_ADMIN_USERNAME'] ?? 'admin',
  pass: process.env['SEED_ADMIN_PASSPHRASE'] ?? 'demo-change-me-admin'
};

/**
 * Install a pre-navigation init script that records every `new Worker(...)`
 * call on `window.__WORKER_URLS__`. This is the only way to observe worker
 * construction from the E2E harness without the app cooperating — once the
 * spy is in place, any feature path that reaches a `new Worker(new URL(...))`
 * call leaves a trace we can assert on. We match on *count deltas*, not on
 * URL substrings, because esbuild's hashed chunk names don't preserve the
 * source filename in production builds.
 */
async function installWorkerSpy(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const urls: string[] = [];
    (window as unknown as { __WORKER_URLS__: string[] }).__WORKER_URLS__ = urls;
    const OriginalWorker = window.Worker;
    class SpyWorker extends OriginalWorker {
      constructor(scriptURL: string | URL, options?: WorkerOptions) {
        super(scriptURL, options);
        try { urls.push(typeof scriptURL === 'string' ? scriptURL : scriptURL.href); } catch { /* noop */ }
      }
    }
    (window as unknown as { Worker: typeof Worker }).Worker = SpyWorker as unknown as typeof Worker;
  });
}

async function workerUrlCount(page: Page): Promise<number> {
  return page.evaluate(() => (window as unknown as { __WORKER_URLS__: string[] }).__WORKER_URLS__.length);
}

async function loginAndOpenCanvas(page: Page, projectName: string): Promise<void> {
  await page.goto('/');
  await page.waitForURL(/login/);
  await page.getByTestId('login-username').fill(ADMIN.user);
  await page.getByTestId('login-passphrase').fill(ADMIN.pass);
  await page.getByTestId('login-submit').click();
  await page.waitForURL(/projects/);
  await page.getByTestId('project-create').click();
  await page.getByTestId('form-name').fill(projectName);
  await page.getByTestId('form-description').fill('Worker E2E');
  await page.getByTestId('form-save').click();
  await page.getByText(projectName).first().click();
  await page.getByTestId('new-canvas-name').fill('Canvas');
  await page.getByTestId('new-canvas-create').click();
  await page.waitForURL(/canvas/);
}

test.describe('Worker runtime — end-to-end execution', () => {
  test('import feature spawns a worker and imports valid rows (asserts on summary body)', async ({ page }) => {
    await installWorkerSpy(page);
    await loginAndOpenCanvas(page, 'Worker-Import');
    const before = await workerUrlCount(page);

    const payload = JSON.stringify([
      { id: 'n1', type: 'button', x: 10, y: 10, text: 'A' },
      { id: 'n2', type: 'input', x: 50, y: 10, placeholder: 'type…' }
    ]);
    const fileChooser = page.waitForEvent('filechooser');
    await page.getByTestId('action-import').click();
    (await fileChooser).setFiles({
      name: 'payload.json',
      mimeType: 'application/json',
      buffer: Buffer.from(payload, 'utf8')
    });
    // Body-content assertion, not just status.
    await expect(page.getByText(/Imported:\s*2/)).toBeVisible();
    // And: a worker was constructed as part of this flow.
    expect(await workerUrlCount(page)).toBeGreaterThan(before);
  });

  test('SVG export spawns a worker and writes a real SVG document', async ({ page }) => {
    await installWorkerSpy(page);
    await loginAndOpenCanvas(page, 'Worker-SVG');
    await page.getByTestId('tool-button').click();
    await expect(page.locator('[data-testid^="el-"]').first()).toBeVisible();
    const before = await workerUrlCount(page);

    const download = page.waitForEvent('download');
    await page.getByTestId('action-export-svg').click();
    const d = await download;
    expect(d.suggestedFilename()).toMatch(/\.svg$/);

    // Read the downloaded file from disk and verify it is an SVG document.
    const path = await d.path();
    expect(path).toBeTruthy();
    const body = fs.readFileSync(path as string, 'utf8');
    expect(body).toMatch(/<svg[\s>]/);
    expect(body).toMatch(/<\/svg>/);
    expect(await workerUrlCount(page)).toBeGreaterThan(before);
  });

  test('PNG export attempts the worker and writes a file whose header is a valid PNG signature', async ({ page }) => {
    await installWorkerSpy(page);
    await loginAndOpenCanvas(page, 'Worker-PNG');
    await page.getByTestId('tool-button').click();
    const before = await workerUrlCount(page);

    const download = page.waitForEvent('download');
    await page.getByTestId('action-export-png').click();
    const d = await download;
    expect(d.suggestedFilename()).toMatch(/\.png$/);
    const path = await d.path();
    expect(path).toBeTruthy();
    const buf = fs.readFileSync(path as string);
    // A real PNG starts with the 8-byte signature 89 50 4E 47 0D 0A 1A 0A.
    expect(buf.slice(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
    // PNG path tries the worker first. Even if OffscreenCanvas isn't available
    // and the fallback kicks in, the worker must have been constructed.
    expect(await workerUrlCount(page)).toBeGreaterThan(before);
  });

  test('autosave-driven version creation spawns the version-compact worker', async ({ page }) => {
    await installWorkerSpy(page);
    await loginAndOpenCanvas(page, 'Worker-Compact');
    await page.getByTestId('tool-button').click();
    const before = await workerUrlCount(page);
    // Default autosave interval is 10s; one cycle calls createVersion with
    // the worker-based compactor. Wait a bit longer than the interval so the
    // tick has had a chance to fire.
    await page.waitForTimeout(12_000);
    expect(await workerUrlCount(page)).toBeGreaterThan(before);
  });
});
