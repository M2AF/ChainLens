const { test, expect } = require('@playwright/test');
const timestamp = 1700000000000;
const events = [
  { id: '123', symbols: ['PONS', 'DARK'], exchange: 'bithumb', marketType: 'spot', markets: [], title: 'New token listing', timestamp, url: 'https://example.com/announcement' },
  { id: '456', symbols: ['UNKNOWN'], exchange: 'unsupported', marketType: 'spot', markets: [], title: 'Unmatched token', timestamp, url: 'https://example.com/other' },
];
function chart(symbol, range) {
  return { status: 'available', exchange: 'coinbase', market: symbol + '-USD', symbol, quote: 'USD', range, intervalSeconds: 300, match: 'provider-linked-market', listingExchange: 'bithumb', sourceListingUrl: 'https://newlistings.pro/listings/bithumb/pons-abc', detectedAt: timestamp - 300000, fetchedAt: timestamp,
    coverageStart: timestamp - 900000, coverageEnd: timestamp,
    candles: [0, 1, 2, 3].map((i) => ({ time: timestamp - 900000 + i * 300000, open: 0.42 + i * 0.01, high: 0.44 + i * 0.01, low: 0.41 + i * 0.01, close: 0.43 + i * 0.01, volume: 10 })) };
}
async function openListings(page) {
  await page.goto('/');
  await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('button', { name: 'Market', exact: true }).click();
  await page.getByRole('group', { name: 'Market Watch view' }).getByRole('button', { name: 'New Listings' }).click();
}
test('inline charts label the matched venue, expand, change range/token, and keep missing charts explicit on mobile', async ({ page }) => {
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  const calls = [];
  await page.route('**/api/market/top100', route => route.fulfill({ json: [] }));
  await page.route('**/api/market/new-listings', route => route.fulfill({ json: { state: 'live', events } }));
  await page.route('**/api/market/new-listings/*/chart?*', route => {
    const url = new URL(route.request().url()); calls.push(url.href);
    return route.fulfill({ json: url.pathname.includes('/456/') ? { status: 'unavailable', reason: 'No verified chart source.', candles: [] } : chart(url.searchParams.get('symbol'), url.searchParams.get('range')) });
  });
  await openListings(page);
  const card = page.getByTestId('new-listings-panel').getByRole('article').first();
  const canvas = card.getByRole('img', { name: /price chart/ });
  await expect(canvas).toBeVisible();
  await expect.poll(() => canvas.evaluate(el => !!window.Chart.getChart(el)?.data.datasets[0].data.length)).toBe(true);
  await expect(card).toContainText('Reference for BITHUMB');
  await expect(card).toContainText('Prices are from coinbase');
  await card.getByRole('button', { name: 'Expand chart' }).click();
  await expect(canvas).toHaveJSProperty('clientHeight', 300);
  await expect(card).toContainText('Available history:');
  await card.getByRole('button', { name: '1D', exact: true }).click();
  await expect.poll(() => calls.some(url => url.includes('range=1d'))).toBe(true);
  await card.getByRole('group', { name: 'Chart token' }).getByRole('button', { name: '$DARK', exact: true }).click();
  await expect(card).toContainText('DARK-USD');
  await page.screenshot({ path: 'test-results/new-listings-charts-desktop.png', fullPage: true });
  await card.getByRole('button', { name: 'Collapse chart' }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(() => page.locator('.cl-sidebar').evaluate(el => el.getBoundingClientRect().right <= 1)).toBe(true);
  const missing = page.getByTestId('new-listings-panel').getByRole('article').nth(1);
  await missing.scrollIntoViewIfNeeded();
  await expect(missing).toContainText('No verified chart source.');
  await expect(missing.locator('canvas')).toHaveCount(0);
  await missing.getByRole('button', { name: 'Retry chart' }).click();
  await expect(missing).toContainText('No verified chart source.');
  await card.scrollIntoViewIfNeeded();
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/new-listings-charts-mobile.png', fullPage: true });
  expect(errors).toEqual([]);
});

test('live matched exchange candles render in the actual listing cards', async ({ page }) => {
  test.skip(process.env.LIVE_LISTING_CHARTS !== '1', 'Opt-in live exchange integration check');
  test.setTimeout(60000);
  const { readNewListings } = require('../new-listings-proxy');
  const { createListingIconEnricher } = require('../new-listings-icons');
  const { createListingChartService } = require('../new-listings-charts');
  const feed = await createListingIconEnricher(fetch)(await readNewListings(fetch, 'https://chainlens-search.guildfordking.workers.dev'));
  const service = createListingChartService(fetch, async () => feed);
  const selected = [];
  for (const event of feed.events) {
    const result = await service.chart(String(event.id), event.symbols[0]);
    if (result.status === 'available') selected.push({ event, result });
    if (selected.length === 3) break;
  }
  expect(selected.length).toBeGreaterThan(0);
  await page.route('**/api/market/top100', route => route.fulfill({ json: [] }));
  await page.route('**/api/market/new-listings', route => route.fulfill({ json: { ...feed, events: selected.map(row => row.event) } }));
  await page.route('**/api/market/new-listings/*/chart?*', route => route.fulfill({ json: selected.find(row => route.request().url().includes('/' + row.event.id + '/')).result }));
  await openListings(page);
  for (const card of await page.getByTestId('new-listings-panel').getByRole('article').all()) {
    await card.scrollIntoViewIfNeeded();
    const canvas = card.getByRole('img', { name: /price chart/ });
    await expect(canvas).toBeVisible();
    await expect.poll(() => canvas.evaluate(el => window.Chart.getChart(el)?.data.datasets[0].data.length || 0)).toBeGreaterThan(0);
  }
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.getByRole('switch', { name: 'Dark mode' }).click();
  await page.screenshot({ path: 'test-results/new-listings-charts-live-desktop.png', fullPage: true, animations: 'disabled' });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(() => page.locator('.cl-sidebar').evaluate(el => el.getBoundingClientRect().right <= 1)).toBe(true);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: 'test-results/new-listings-charts-live-mobile.png', fullPage: true });
});
