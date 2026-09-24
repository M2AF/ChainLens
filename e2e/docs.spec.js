const { test, expect } = require('@playwright/test');

test('developer docs use the site sidebar and theme picker', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/docs');

  const nav = page.getByRole('navigation', { name: 'Main navigation' });
  await expect(nav.locator('a')).toHaveText([
    'Search', 'Scanner', 'Magic Swap', 'App Hub', 'Market', 'Chat', 'Profile', 'Docs', 'Wallet', 'Donate',
  ]);
  await expect(nav.getByRole('link', { name: 'Docs' })).toHaveAttribute('aria-current', 'page');
  await expect(page.getByRole('navigation', { name: 'Docs actions' }).getByRole('link')).toHaveText(['GitHub', 'Audit']);
  await expect(page.getByRole('button', { name: 'Choose theme' })).toBeVisible();
  await expect(page.getByText('24', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Choose theme' }).click();
  await page.getByRole('menuitem', { name: 'Dark' }).click();
  await expect(page.getByRole('link', { name: 'GitHub' })).toHaveCSS('color', 'rgb(248, 250, 252)');
  await page.waitForTimeout(250);
  await page.screenshot({ path: 'test-results/docs-desktop-dark.png', fullPage: false });

  await page.getByRole('button', { name: 'Choose theme' }).click();
  await page.getByRole('menuitem', { name: 'Light' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await expect(page.getByRole('button', { name: 'Choose theme' })).toContainText('Light');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.screenshot({ path: 'test-results/docs-desktop-light.png', fullPage: false });

  await nav.getByRole('link', { name: 'Market' }).click();
  await expect(page).toHaveURL(/\?tab=market$/);
  await expect(page.getByRole('navigation', { name: 'Main navigation' }).getByRole('button', { name: 'Market' })).toHaveAttribute('aria-current', 'page', { timeout: 15000 });
  await page.goBack();
  await expect(page).toHaveURL(/\/docs$/);
  await nav.getByRole('link', { name: 'Magic Swap' }).click();
  await expect(page).toHaveURL(/\/magic-swap$/);
  await expect(page.getByRole('heading', { name: 'Magic Swap' })).toBeVisible({ timeout: 15000 });
  await expect(page.getByRole('button', { name: 'DEX Swap' })).toBeVisible();
  expect(errors).toEqual([]);
});

test('docs show synced themes and save a new one', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('cl_token', 'docs-test-token'));
  const profile = { eligible: true, entries: {
    'custom-mint': { n: 'Mint', c: { bg: '#102a26', accent: '#14e29a', text: '#f0fff8' }, t: 100 },
  } };
  await page.route('**/api/profile/themes', async route => {
    if (route.request().method() === 'PUT') Object.assign(profile.entries, route.request().postDataJSON().entries);
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(profile) });
  });
  await page.goto('/docs');
  await page.getByRole('button', { name: 'Choose theme' }).click();
  await expect(page.getByRole('menuitem', { name: 'Mint' })).toBeVisible();
  await page.screenshot({ path: 'test-results/docs-theme-menu.png' });
  await page.getByRole('menuitem', { name: 'Cardano' }).click();
  await expect(page.locator('html')).toHaveCSS('--bg', 'rgb(3 9 26)');
  await page.getByRole('button', { name: 'Choose theme' }).click();
  await page.getByRole('menuitem', { name: 'Mint' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.getByRole('button', { name: 'Choose theme' })).toContainText('Mint');

  await page.getByRole('button', { name: 'Choose theme' }).click();
  await page.getByRole('button', { name: 'Create New' }).click();
  await page.screenshot({ path: 'test-results/docs-theme-editor.png' });
  await page.locator('#themeName').fill('Ocean');
  await page.locator('#themeAccentHex').fill('#22aadd');
  await page.getByRole('button', { name: 'Save theme' }).click();
  await expect(page.getByRole('button', { name: 'Choose theme' })).toContainText('Ocean');
  expect(Object.values(profile.entries).some(entry => entry.n === 'Ocean' && entry.c.accent === '#22aadd')).toBe(true);

  await page.getByRole('button', { name: 'Choose theme' }).click();
  await page.getByRole('button', { name: 'Edit Ocean' }).click();
  await page.locator('#themeName').fill('Deep Ocean');
  await page.getByRole('button', { name: 'Save theme' }).click();
  await expect(page.getByRole('button', { name: 'Choose theme' })).toContainText('Deep Ocean');

  await page.getByRole('button', { name: 'Choose theme' }).click();
  await page.getByRole('button', { name: 'Edit Deep Ocean' }).click();
  await page.getByRole('button', { name: 'Delete theme' }).click();
  await page.getByRole('button', { name: 'Click again to delete' }).click();
  await expect(page.getByRole('button', { name: 'Choose theme' })).toContainText('Dark');
});

test('mobile docs navigation opens without covering content when closed', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/docs');
  const menu = page.getByRole('button', { name: 'Open menu' });
  await expect(menu).toBeVisible();
  await menu.click();
  await expect(page.locator('#siteSidebar')).toHaveClass(/open/);
  await page.waitForTimeout(350); // Allow the sidebar slide animation to finish before visual review.
  await page.screenshot({ path: 'test-results/docs-mobile-open.png' });
  await page.locator('#sidebarClose').click();
  await expect(page.locator('#siteSidebar')).not.toHaveClass(/open/);
  await page.waitForTimeout(350);
  await page.screenshot({ path: 'test-results/docs-mobile-closed.png' });
  expect(errors).toEqual([]);
});
