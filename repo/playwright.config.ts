import { defineConfig, devices } from '@playwright/test';

const baseURL = process.env['E2E_BASE_URL'] ?? 'http://localhost:4200';

// Chromium strips default ports (80 for http, 443 for https) when matching the
// --unsafely-treat-insecure-origin-as-secure allowlist. Passing only
// `http://flowcanvas:80` silently mismatches the browser-side origin
// `http://flowcanvas`, which in turn makes `navigator.serviceWorker` disappear
// from the page — previously hidden by `test.skip()` branches in the offline
// spec. Emit both forms so the allowlist matches regardless.
function secureAllowlist(url: string): string {
  try {
    const u = new URL(url);
    const withPort = `${u.protocol}//${u.host}`;
    const stripped = `${u.protocol}//${u.hostname}`;
    return Array.from(new Set([withPort, stripped])).join(',');
  } catch {
    return url;
  }
}

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  forbidOnly: !!process.env['CI'],
  retries: 0,
  workers: 1,
  reporter: [['list'], ['html', { outputFolder: '.tmp/playwright-report', open: 'never' }]],
  use: {
    baseURL,
    trace: 'retain-on-failure',
    launchOptions: {
      // Browser-only SHA-256 via WebCrypto requires a secure context. When tests
      // run inside Docker, baseURL is http://flowcanvas:80 (not a secure origin),
      // so we explicitly mark it safe so window.crypto.subtle AND
      // navigator.serviceWorker are available.
      args: [
        `--unsafely-treat-insecure-origin-as-secure=${secureAllowlist(baseURL)}`,
        '--disable-features=IsolateOrigins,site-per-process'
      ]
    }
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } }
  ]
});
