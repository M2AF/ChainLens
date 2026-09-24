const { test, expect } = require('@playwright/test');

test('Search, Scanner, Market and Profile align below the theme control on desktop', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.addInitScript(() => localStorage.setItem('cl_token', 'spacing-test-token'));
  await page.route('**/api/profile/themes', route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ eligible: true, walletLinked: true, socialLinked: true, entries: {} }),
  }));
  await page.route('**/api/profile', route => route.fulfill({
    status: 200, contentType: 'application/json', body: '{}',
  }));
  await page.goto('/');
  const picker = page.getByTestId('theme-picker-button');
  await expect(picker).toBeVisible();
  const pickerBox = await picker.boundingBox();
  const pickerBottom = pickerBox.y + pickerBox.height;
  const nav = page.getByRole('navigation', { name: 'Main navigation' });
  const tops = [];

  for (const tab of ['Search', 'Scanner', 'Market', 'Profile']) {
    await nav.getByRole('button', { name: tab, exact: true }).click();
    const panel = page.locator('.cl-primary-content > main, .cl-primary-content > div.max-w-6xl, .cl-primary-content > div.max-w-3xl').first();
    await expect(panel).toBeVisible();
    const top = (await panel.boundingBox()).y;
    expect(top, `${tab} should clear the theme control`).toBeGreaterThanOrEqual(pickerBottom + 16);
    tops.push(top);
  }

  expect(Math.max(...tops) - Math.min(...tops)).toBeLessThanOrEqual(2);
});
