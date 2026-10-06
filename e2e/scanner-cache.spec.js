const { test, expect } = require('@playwright/test');
const id = '00000000-0000-4000-8000-000000000001';
const address = '0x1111111111111111111111111111111111111111';
const token = 'fixture.' + Buffer.from(JSON.stringify({ sub: id })).toString('base64url') + '.fixture';

test('Scanner reuses all Profile NFT pages and shows them while a token source stalls', async ({ page }) => {
  test.setTimeout(90000);
  await page.setViewportSize({ width:1920, height:1080 });
  const errors = [], nftRequests = [];
  let blocked = false, release;
  const gate = new Promise(resolve => { release = resolve; });
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(token => localStorage.setItem('cl_token', token), token);
  await page.route('**/api/**', async route => {
    const url = new URL(route.request().url());
    if (url.pathname === '/api/profile') return route.fulfill({ json: { id, display_name: 'Cache collector', cl_wallets: [{ chain: 'evm', address, is_primary: true }] } });
    if (url.pathname.startsWith('/api/nfts/')) {
      nftRequests.push(url.pathname + url.search);
      const chain = url.pathname.split('/')[3];
      const second = url.searchParams.has('pageKey');
      const other = !url.pathname.endsWith(address);
      return route.fulfill({ json: { nfts: chain === 'base' ? [{ chain, contractAddress: '0xcollection', tokenId: second ? '2' : '1', name: other ? (second ? 'Other wallet page two' : 'Other wallet page one') : (second ? 'Cached page two' : 'Cached page one'), image: '' }] : [], nextPageKey: chain === 'base' && !second ? 'page-two' : null } });
    }
    if (url.pathname.startsWith('/api/tokens/base/')) { blocked = true; await gate; return route.abort().catch(() => {}); }
    return route.fulfill({ json: { entries: {}, passkeys: [], coins: [], nfts: [], transactions: [] } });
  });
  await page.goto('/?tab=profile');
  const nav = page.getByRole('navigation', { name: 'Main navigation' });
  await nav.getByRole('button', { name: 'Profile', exact: true }).click();
  await expect(page.locator('.profile-summary b')).toHaveText('2');
  await expect(page.getByText('Loading linked wallets…', { exact: false })).toHaveCount(0);
  const count = nftRequests.length;
  await page.clock.install();
  await page.getByRole('button', { name: 'Scan my wallets', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Favorite Cached page one', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Favorite Cached page two', exact: true })).toBeVisible();
  await expect.poll(() => blocked).toBe(true);
  expect(nftRequests.length).toBe(count);
  await page.screenshot({ path: 'test-results/scanner-profile-cache.png', fullPage:true });
  await page.clock.runFor(31000);
  await expect(page.getByRole('button', { name: 'SCAN ASSETS', exact: true })).toBeEnabled();
  await expect(page.getByText(/base.*tokens: Request timed out/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Favorite Cached page two', exact: true })).toBeVisible();
  expect(nftRequests.length).toBe(count);
  release();
  await page.getByRole('button', { name: 'CLEAR', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Favorite Cached page one', exact: true })).toHaveCount(0);
  await page.getByPlaceholder('0x... or domain, comma-separated').fill('0x2222222222222222222222222222222222222222');
  await page.getByRole('button', { name: 'SCAN ASSETS', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Favorite Other wallet page two', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Favorite Cached page one', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'SCAN ASSETS', exact: true })).toBeEnabled();
  expect(nftRequests.length).toBeGreaterThan(count);
  await page.getByRole('button', { name: 'CLEAR', exact: true }).click();
  expect(errors).toEqual([]);
});
