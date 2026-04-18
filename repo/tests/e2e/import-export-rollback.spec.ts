import { test, expect } from '@playwright/test';

const ADMIN = {
  user: process.env['SEED_ADMIN_USERNAME'] ?? 'admin',
  pass: process.env['SEED_ADMIN_PASSPHRASE'] ?? 'demo-change-me-admin'
};

async function loginAndOpenCanvas(page: import('@playwright/test').Page): Promise<void> {
  await page.goto('/');
  await page.waitForURL(/login/);
  await page.getByTestId('login-username').fill(ADMIN.user);
  await page.getByTestId('login-passphrase').fill(ADMIN.pass);
  await page.getByTestId('login-submit').click();
  await page.waitForURL(/projects/);
  await page.getByTestId('project-create').click();
  await page.getByTestId('form-name').fill('Import/Export Project');
  await page.getByTestId('form-description').fill('E2E flow');
  await page.getByTestId('form-save').click();
  await page.getByText('Import/Export Project').first().click();
  await page.getByTestId('new-canvas-name').fill('Flow');
  await page.getByTestId('new-canvas-create').click();
  await page.waitForURL(/canvas/);
}

test('JSON import renames duplicate ids and shows summary', async ({ page }) => {
  await loginAndOpenCanvas(page);
  await page.getByTestId('tool-button').click(); // element id will be auto-generated
  const importPayload = JSON.stringify([
    { id: 'b1', type: 'button', x: 50, y: 50, text: 'One' },
    { id: 'b1', type: 'button', x: 150, y: 50, text: 'Dup' },
    { id: 'bad!', type: 'button', x: 250, y: 50 }
  ]);
  const fileChooserPromise = page.waitForEvent('filechooser');
  await page.getByTestId('action-import').click();
  const fileChooser = await fileChooserPromise;
  await fileChooser.setFiles({
    name: 'import.json',
    mimeType: 'application/json',
    buffer: Buffer.from(importPayload, 'utf8')
  });
  await expect(page.getByText(/Imported:\s*2/)).toBeVisible();
  await expect(page.getByText(/Renamed:\s*1/)).toBeVisible();
  await expect(page.getByText(/Skipped:\s*1/)).toBeVisible();
});

test('JSON export downloads canvas file', async ({ page }) => {
  await loginAndOpenCanvas(page);
  await page.getByTestId('tool-button').click();
  const downloadPromise = page.waitForEvent('download');
  await page.getByTestId('action-export-json').click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/\.json$/);
});

test('version rollback restores a prior snapshot', async ({ page }) => {
  await loginAndOpenCanvas(page);
  await page.getByTestId('tool-button').click();
  // Trigger autosave + version creation with stubbed time-gap flow.
  // We open the Versions modal after the first autosave tick to capture v1,
  // then add another element and rollback to v1.
  await page.waitForTimeout(11_000);
  await page.getByTestId('tool-button').click();
  await page.waitForTimeout(11_000);
  await page.getByTestId('action-versions').click();
  const rollback = page.getByTestId('version-rollback-1');
  await expect(rollback).toBeVisible();
  await rollback.click();
  await page.getByTestId('rollback-confirm').click();
  await expect(page.locator('[data-testid^="el-"]')).toHaveCount(1);
});
