const { test, expect } = require('@playwright/test');

test('Market Watch switches between line and sampled candlesticks without refetching', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/api/market/top100', route => route.fulfill({ json: [{
    id: 'bitcoin', symbol: 'btc', name: 'Bitcoin', image: '', market_cap_rank: 1,
    current_price: 64000, price_change_percentage_24h: 2.3, market_cap: 1_200_000_000_000,
    sparkline_in_7d: { price: [62000, 63000, 64000] },
  }] }));
  let chartRequests = 0;
  const start = Math.floor(1_700_000_000_000 / 3_600_000) * 3_600_000;
  await page.route('https://api.binance.com/api/v3/klines**', route => {
    chartRequests++;
    route.fulfill({ json: Array.from({ length: 168 }, (_, i) => [start + i * 3_600_000, 0, 0, 0, 62000 + i * 12 + Math.sin(i) * 100]) });
  });
  await page.goto('/');
  await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('button', { name: 'Market' }).click();
  await page.getByRole('row', { name: /Bitcoin/ }).click();
  const canvas = page.locator('#priceChart');
  await expect(canvas).toBeVisible();
  await expect.poll(() => canvas.evaluate(el => !!window.Chart.getChart(el))).toBe(true);
  await expect(page.getByRole('button', { name: 'Line chart' })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Candlestick chart' }).click();
  await expect(page.getByRole('button', { name: 'Candlestick chart' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('market-ohlc')).toContainText('Sampled OHLC');
  await expect(page.getByText(/candles · Binance API/)).toBeVisible();
  expect(await canvas.evaluate(el => window.Chart.getChart(el).data.datasets[0].showLine)).toBe(false);
  expect(chartRequests).toBe(1);
  const latestOhlc = await page.getByTestId('market-ohlc').textContent();
  const chartBox = await canvas.boundingBox();
  await page.mouse.move(chartBox.x + 90, chartBox.y + 140);
  await expect.poll(() => page.getByTestId('market-ohlc').textContent()).not.toBe(latestOhlc);
  await page.mouse.move(chartBox.x - 10, chartBox.y - 10);
  await expect(page.getByTestId('market-ohlc')).toHaveText(latestOhlc);
  await page.screenshot({ path: 'test-results/market-candles-desktop.png' });

  await page.getByRole('button', { name: 'Line chart' }).click();
  await expect(page.getByTestId('market-ohlc')).toBeHidden();
  expect(await canvas.evaluate(el => window.Chart.getChart(el).data.datasets[0].showLine)).toBe(true);
  expect(chartRequests).toBe(1);
  await page.getByRole('button', { name: 'Candlestick chart' }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole('button', { name: 'Candlestick chart' })).toBeVisible();
  await expect(page.getByTestId('market-ohlc')).toBeVisible();
  await page.screenshot({ path: 'test-results/market-candles-mobile.png' });
  await page.getByRole('button', { name: '✕' }).click();
  await page.getByRole('row', { name: /Bitcoin/ }).click();
  await expect(page.getByRole('button', { name: 'Candlestick chart' })).toHaveAttribute('aria-pressed', 'true');
  await page.reload();
  await page.getByRole('button', { name: 'Open menu' }).click();
  await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('button', { name: 'Market' }).click();
  await page.getByRole('row', { name: /Bitcoin/ }).click();
  await expect(page.getByRole('button', { name: 'Candlestick chart' })).toHaveAttribute('aria-pressed', 'true');
  expect(errors).toEqual([]);
});
