const { test, expect } = require('@playwright/test');

test('desktop sidebar opens Magic Swap as a page and centers utility dialogs', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  const nav = page.getByRole('navigation', { name: 'Main navigation' });
  await expect(nav.getByRole('button', { name: 'Magic Swap' })).toBeVisible();
  await expect(page.getByPlaceholder('Search anything, an app, or a wallet...')).toBeVisible();
  expect(await page.locator('.cl-search-content').evaluate(el => parseFloat(getComputedStyle(el).paddingTop))).toBe(180);

  await nav.getByRole('button', { name: 'Magic Swap' }).click();
  await expect(page).toHaveURL(/\/magic-swap$/);
  await expect(page.getByTestId('magic-swap-page')).toBeVisible();
  await expect(page.getByTestId('evm-wallet')).toBeVisible();
  await page.getByTestId('exchange-swap-mode').click();
  await expect(page.getByTestId('exchange-panel')).toBeVisible();
  await page.reload();
  await expect(page.getByTestId('magic-swap-page')).toBeVisible();
  await expect(page.getByTestId('evm-wallet')).toBeVisible();

  for (const [label, testId, close] of [
    ['Wallet', 'wallet-dialog', 'Close wallet'],
    ['Donate', 'donate-dialog', 'Close donate'],
  ]) {
    await nav.getByRole('button', { name: label }).click();
    const dialog = page.getByTestId(testId);
    await expect(dialog).toBeVisible();
    const box = await dialog.boundingBox();
    expect(Math.abs(box.x + box.width / 2 - 720)).toBeLessThan(8);
    expect(Math.abs(box.y + box.height / 2 - 450)).toBeLessThan(8);
    await page.screenshot({ path: `test-results/${testId}.png` });
    await dialog.getByRole('button', { name: close }).click();
    await expect(dialog).toBeHidden();
  }

  await nav.getByRole('button', { name: 'Chat' }).click();
  const chat = page.getByTestId('chat-panel');
  await expect(chat).toBeVisible();
  const before = await chat.boundingBox();
  const header = chat.locator('header').first();
  const headerBox = await header.boundingBox();
  await page.mouse.move(headerBox.x + 100, headerBox.y + 24);
  await page.mouse.down();
  await page.mouse.move(headerBox.x + 260, headerBox.y - 100, { steps: 6 });
  await page.mouse.up();
  const after = await chat.boundingBox();
  expect(after.x).toBeGreaterThan(before.x + 100);
  expect(after.y).toBeLessThan(before.y - 50);
  await chat.getByRole('button', { name: 'Pin chat' }).click();
  await expect(chat.getByRole('button', { name: 'Unpin chat' })).toHaveAttribute('aria-pressed', 'true');
  await nav.getByRole('button', { name: 'Search' }).click();
  await expect(chat).toBeVisible();
  await chat.getByRole('button', { name: 'Close chat' }).click();
  await expect(chat).toBeHidden();
  expect(errors).toEqual([]);
  await page.evaluate(() => { localStorage.setItem('darkMode', 'true'); localStorage.setItem('cl_theme', 'dark'); });
  await page.reload();
  await page.screenshot({ path: 'test-results/sidebar-desktop-dark.png' });
});

test('mobile menu opens and closes the sidebar', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  const nav = page.getByRole('navigation', { name: 'Main navigation' });
  await expect(page.getByRole('button', { name: 'Open menu' })).toBeVisible();
  await page.getByRole('button', { name: 'Open menu' }).click();
  await expect(nav.getByRole('button', { name: 'Magic Swap' })).toBeVisible();
  await page.screenshot({ path: 'test-results/sidebar-mobile-open.png' });
  await nav.getByRole('button', { name: 'Magic Swap' }).click();
  await expect(page).toHaveURL(/\/magic-swap$/);
  await expect(page.getByTestId('magic-swap-page')).toBeVisible();
  await expect(page.locator('.cl-sidebar')).not.toHaveClass(/open/);
  await page.getByRole('button', { name: 'Open menu' }).click();
  await nav.getByRole('button', { name: 'Donate' }).click();
  await expect(page.getByTestId('donate-dialog')).toBeVisible();
  await page.getByTestId('donate-dialog').getByRole('button', { name: 'Close donate' }).click();
  await expect(page.getByTestId('donate-dialog')).toBeHidden();
});
