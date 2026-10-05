const { test, expect } = require('@playwright/test');

const feed = () => ({ coverage: 'Global leaders and cross-chain DEX tokens', rows: [
  { id: 'market:btc', symbol: 'btc', name: 'Bitcoin', chain: 'Global', price: 64000, change: 2.3, source: 'CoinGecko', updatedAt: Date.now() },
  ...Array.from({ length: 12 }, (_, i) => ({ id: `dex:${i}`, symbol: `MEME${i}`, name: 'Small token', chain: i % 2 ? 'base' : 'solana', price: 0.0000000123, change: i % 2 ? -5 : null, source: 'DEX Screener', updatedAt: Date.now(), url: `https://dexscreener.com/base/pool${i}` })),
] });

test('Cross-chain ticker moves left, pauses, survives outages, and fits mobile', async ({ page }) => {
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  let offline = false;
  await page.route('**/api/market/ticker', route => route.fulfill(offline ? { status: 503, json: {} } : { json: feed() }));
  await page.route('**/api/market/top100', route => route.fulfill({ json: [] }));
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  const ticker = page.getByRole('region', { name: 'Cross-chain price ticker' });
  await expect(ticker).toContainText('BTC');
  await expect(ticker).toContainText('$0.0000000123');
  await expect(ticker).toContainText('24h —');
  const track = page.locator('.cl-ticker-track');
  const x = () => track.evaluate(el => new DOMMatrix(getComputedStyle(el).transform).m41);
  const start = await x();
  await expect.poll(x).toBeLessThan(start - 2);
  await ticker.hover();
  await expect(track).toHaveCSS('animation-play-state', 'paused');
  await page.getByRole('button', { name: 'Pause price ticker' }).click();
  await page.mouse.move(500, 100);
  await expect(track).toHaveCSS('animation-play-state', 'paused');
  await page.getByRole('button', { name: 'Resume price ticker' }).click();
  await page.locator('.cl-ticker-control').evaluate(el => el.blur());
  await page.mouse.move(500, 100);
  await expect(track).toHaveCSS('animation-play-state', 'running');
  await page.screenshot({ path: 'test-results/ticker-desktop.png' });
  offline = true;
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await expect(ticker).toContainText('Stale');
  await expect(ticker).toContainText('BTC');
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(ticker).toBeVisible();
  expect(await ticker.evaluate(el => el.getBoundingClientRect().left)).toBe(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  await page.screenshot({ path: 'test-results/ticker-mobile.png' });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(track).toHaveCSS('animation-name', 'none');
  expect(errors).toEqual([]);
});

test('Ticker reports unavailable prices without invented values', async ({ page }) => {
  await page.route('**/api/market/ticker', route => route.fulfill({ status: 503, json: {} }));
  await page.route('**/api/market/top100', route => route.fulfill({ json: [] }));
  await page.goto('/');
  await expect(page.getByRole('status')).toContainText('Prices temporarily unavailable');
  await expect(page.locator('.cl-ticker-coin')).toHaveCount(0);
});
