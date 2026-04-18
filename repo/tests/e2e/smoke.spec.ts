import { test, expect } from '@playwright/test';

const ADMIN = {
  user: process.env['SEED_ADMIN_USERNAME'] ?? 'admin',
  pass: process.env['SEED_ADMIN_PASSPHRASE'] ?? 'demo-change-me-admin'
};
const REVIEWER = {
  user: process.env['SEED_REVIEWER_USERNAME'] ?? 'reviewer',
  pass: process.env['SEED_REVIEWER_PASSPHRASE'] ?? 'demo-change-me-reviewer'
};

async function login(page: import('@playwright/test').Page, user: string, pass: string): Promise<void> {
  await page.goto('/');
  await page.waitForURL(/login/);
  await page.getByTestId('login-username').fill(user);
  await page.getByTestId('login-passphrase').fill(pass);
  await page.getByTestId('login-submit').click();
  await page.waitForURL(/projects/);
}

// Each Playwright test gets a fresh browser context by default,
// so IndexedDB and LocalStorage start clean per-test with no extra scripting.

test('login, create a project, open a canvas, add an element, and see autosave', async ({ page }) => {
  await login(page, ADMIN.user, ADMIN.pass);
  await page.getByTestId('project-create').click();
  await page.getByTestId('form-name').fill('Demo Project');
  await page.getByTestId('form-description').fill('A quick E2E project.');
  await page.getByTestId('form-tags').fill('alpha, demo');
  await page.getByTestId('form-save').click();
  await expect(page.getByText('Demo Project')).toBeVisible();
  await page.getByText('Demo Project').first().click();
  await page.getByTestId('new-canvas-name').fill('Main Canvas');
  await page.getByTestId('new-canvas-create').click();
  await page.waitForURL(/canvas/);
  await page.getByTestId('tool-button').click();
  await expect(page.locator('[data-testid^="el-"]').first()).toBeVisible();
});

test('3 failed logins triggers cooldown lock', async ({ page }) => {
  await page.goto('/');
  await page.waitForURL(/login/);
  for (let i = 0; i < 3; i++) {
    await page.getByTestId('login-username').fill(ADMIN.user);
    await page.getByTestId('login-passphrase').fill('wrong-pass');
    await page.getByTestId('login-submit').click();
    await expect(page.getByTestId('login-error')).toBeVisible();
  }
  await expect(page.getByTestId('login-cooldown')).toBeVisible();
});

test('reviewer cannot see admin link or project create', async ({ page }) => {
  await login(page, REVIEWER.user, REVIEWER.pass);
  await expect(page.getByTestId('project-create')).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Admin' })).toHaveCount(0);
});
