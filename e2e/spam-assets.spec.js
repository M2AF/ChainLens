const { test, expect } = require('@playwright/test');

test('old hidden assets become spam in storage and the scanner manager', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('cl_asset_filters_migrated_v1', '1');
    localStorage.setItem('cl_asset_filters_v1', JSON.stringify({
      'base:t:0xaaa': { s: 'h', t: 5000 },
    }));
  });
  await page.goto('/');
  await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('button', { name: 'Scanner' }).click();
  await expect(page.getByRole('button', { name: 'Spam (1)' })).toBeVisible();
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('cl_asset_filters_v1'))['base:t:0xaaa'].s)).toBe('s');
  await page.getByRole('button', { name: 'Spam (1)' }).click();
  await expect(page.getByText('No scanned assets marked as spam.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Restore All Assets' })).toBeVisible();
  await page.screenshot({ path: test.info().outputPath('spam-manager.png') });
});

test('a hidden entry pulled from the shared profile is converted and pushed as spam', async ({ page }) => {
  const pushed = [];
  await page.addInitScript(() => localStorage.setItem('cl_token', 'spam-sync-test'));
  await page.route('**/api/profile', route => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify({ id: 'spam-sync-test', display_name: 'Test', cl_wallets: [], cl_linked_accounts: [] }),
  }));
  await page.route('**/api/profile/filters', route => {
    if (route.request().method() === 'PUT') {
      pushed.push(route.request().postDataJSON().entries);
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ entries: pushed.at(-1) }) });
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ entries: { 'base:t:0xaaa': { s: 'h', t: 5000 } } }) });
  });
  await page.goto('/');
  await expect.poll(() => pushed.at(-1)?.['base:t:0xaaa']?.s, { timeout: 15000 }).toBe('s');
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('cl_asset_filters_v1'))['base:t:0xaaa'].s)).toBe('s');
});
