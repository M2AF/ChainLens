const { test, expect: baseExpect } = require('@playwright/test');
const expect = baseExpect.configure({ timeout: 15000 });
test.setTimeout(60000);
const ADDRESS = '0x01faF6DFc230d755141D84d7cB980dd68f5Efe13';
async function mocks(page) {
  const calls = [], scans = [], errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.route('https://chainlens-search.guildfordking.workers.dev/**', route => route.fulfill({ status: 503, json: { error: 'Fixture web search unavailable' } }));
  await page.route('**/api/**', route => {
    if (new URL(route.request().url()).hostname.endsWith('workers.dev')) return route.fallback();
    const path = new URL(route.request().url()).pathname;
    if (path.startsWith('/api/resolve/')) {
      calls.push(path);
      if (path.endsWith('/missing.nad')) return route.fulfill({ status: 404, json: { error: 'This .nad name has no resolved wallet address.' } });
      if (path.endsWith('/offline.nad')) return route.fulfill({ status: 503, json: { error: 'Nad Name Service is temporarily unavailable. Try again.' } });
      return route.fulfill({ json: { address: ADDRESS, domain: 'criptoejesus.nad', chain: 'monad', service: 'Nad Name Service' } });
    }
    if (path.startsWith('/api/nfts/')) {
      scans.push(path);
      return route.fulfill({ json: { nfts: [] } });
    }
    return route.fulfill({ json: {} });
  });
  return { calls, scans, errors };
}
test('NNS search resolves even if web search fails; Copy and Scan reuse the exact address', async ({ page, context }) => {
  const f = await mocks(page); await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/search?q=criptoejesus.nad');
  const card = page.getByTestId('scanner-search-result');
  await expect(card.getByRole('heading', { name: 'Monad .nad domain' })).toBeVisible();
  await expect(card.locator('code')).toHaveText(ADDRESS);
  await card.getByRole('button', { name: 'Copy resolved wallet address' }).click();
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(ADDRESS);
  await expect(card.getByRole('button', { name: 'Copy resolved wallet address' })).toHaveText('Copied ✓');
  await expect(page.getByText('Fixture web search unavailable')).toBeVisible();
  await page.screenshot({ path: 'test-results/nad-search-desktop.png', fullPage: true });
  await card.getByRole('button', { name: 'Scan in ChainLens →' }).click();
  await expect(page.getByPlaceholder('0x... or domain, comma-separated')).toHaveValue(ADDRESS);
  await page.getByRole('button', { name: 'SCAN ASSETS', exact: true }).click();
  await expect(page.getByRole('button', { name: 'SCAN ASSETS', exact: true })).toBeEnabled();
  expect(f.calls).toEqual(['/api/resolve/nad/criptoejesus.nad']);
  expect(f.scans.length).toBeGreaterThan(0);
  expect(f.scans.every(path => path.endsWith('/' + ADDRESS))).toBe(true);
  expect(f.errors).toEqual([]);
});
test('direct Scanner .nad input uses NNS instead of Unstoppable', async ({ page }) => {
  const f = await mocks(page); await page.goto('/');
  await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('button', { name: 'Scanner', exact: true }).click();
  await page.getByPlaceholder('0x... or domain, comma-separated').fill('criptoejesus.nad');
  await page.getByRole('button', { name: 'SCAN ASSETS', exact: true }).click();
  await expect.poll(() => f.calls.length).toBe(1);
  await expect(page.getByRole('button', { name: 'SCAN ASSETS', exact: true })).toBeEnabled();
  expect(f.calls).toEqual(['/api/resolve/nad/criptoejesus.nad']);
  expect(f.scans.length).toBeGreaterThan(0);
  expect(f.errors).toEqual([]);
});
test('mobile NNS search fits and distinguishes missing names from outages; later searches reset the result', async ({ page }) => {
  const f = await mocks(page); await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/search?q=criptoejesus.nad');
  const card = page.getByTestId('scanner-search-result');
  await expect(card.locator('code')).toHaveText(ADDRESS);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/nad-search-mobile.png', fullPage: true });
  for (const [name, message] of [['missing.nad', 'no resolved wallet'], ['offline.nad', 'temporarily unavailable']]) {
    await expect(page.getByRole('search').getByRole('button', { name: 'Search', exact: true })).toBeEnabled();
    await page.locator('#chainlens-search').fill(name);
    await page.getByRole('search').getByRole('button', { name: 'Search', exact: true }).click();
    await expect(card.getByRole('status')).toContainText(message);
    await expect(card.locator('code')).toHaveCount(0);
    await expect(card.getByRole('button', { name: 'Scan in ChainLens →' })).toBeDisabled();
  }
  expect(f.errors).toEqual([]);
});
