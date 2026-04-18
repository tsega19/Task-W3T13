import { defineConfig, devices } from '@playwright/test';

const baseURL = process.env['E2E_BASE_URL'] ?? 'http://localhost:4200';

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
      // so we explicitly mark it safe so window.crypto.subtle is available.
      args: [
        `--unsafely-treat-insecure-origin-as-secure=${baseURL}`,
        '--disable-features=IsolateOrigins,site-per-process'
      ]
    }
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } }
  ]
});
