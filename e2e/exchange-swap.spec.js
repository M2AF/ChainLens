const { test, expect } = require('@playwright/test');

test('native Exchange Swap quotes, creates, resumes and polls without embedding provider widget', async ({ page }) => {
  let created = 0;
  await page.route('**/api/exchange/quote?**', route => route.fulfill({ json: {
    quoteId: 'quote-test', expiresAt: Date.now() + 120000,
    from: { ticker: 'sol', network: 'sol', label: 'SOL', name: 'Solana', key: 'sol:sol' },
    to: { ticker: 'eth', network: 'eth', label: 'ETH', name: 'Ethereum', key: 'eth:eth' },
    amount: '1', fixed: false, provider: 'simpleswap', estimatedAmount: '0.02', min: '0.1', max: '10',
  } }));
  await page.route('**/api/exchange/create', async route => {
    created++;
    const body = route.request().postDataJSON();
    expect(body.quoteId).toBe('quote-test');
    expect(body.addressTo).toBe('0x01faF6DFc230d755141D84d7cB980dd68f5Efe13');
    await route.fulfill({ json: { id: 'simple-123', provider: 'simpleswap', status: 'waiting',
      addressFrom: '3noTuHnQdHkat2w5rBx18vAACMzFUvB5LodEe5vMN98d',
      addressTo: body.addressTo, amountFrom: '1', amountTo: '0.02', extraIdFrom: null,
    } });
  });
  await page.route('**/api/exchange/status/simpleswap/simple-123', route => route.fulfill({ json: {
    id: 'simple-123', provider: 'simpleswap', status: 'confirming', amountTo: '0.02',
  } }));
  await page.goto('/magic-swap');
  await page.getByTestId('exchange-swap-mode').click();
  await expect(page.getByTestId('exchange-panel')).toBeVisible();
  await expect(page.locator('#simpleswap-frame')).toHaveCount(0);
  await page.getByLabel('Send asset').selectOption('sol:sol');
  await page.getByLabel('Receive asset').selectOption('eth:eth');
  await page.getByLabel('Amount to send').fill('1');
  await page.getByTestId('exchange-get-quote').click();
  await expect(page.getByTestId('exchange-quote')).toContainText('SimpleSwap');
  await page.screenshot({ path: 'test-results/exchange-quote-desktop.png', fullPage: true });
  await page.locator('#exchange-destination').fill('0x01faF6DFc230d755141D84d7cB980dd68f5Efe13');
  await page.getByTestId('exchange-create').click();
  await expect(page.getByTestId('exchange-deposit-address')).toContainText('3noTuHn');
  expect(created).toBe(1);
  await page.reload();
  await page.getByTestId('exchange-swap-mode').click();
  await expect(page.getByTestId('exchange-status')).toContainText('simple-123');
  await expect(page.getByTestId('exchange-status')).toContainText('confirming');
  await expect(page.getByTestId('exchange-steps').locator('li').nth(0)).toHaveAttribute('data-state', 'done');
  await expect(page.getByTestId('exchange-steps').locator('li').nth(1)).toHaveAttribute('data-state', 'active');
  expect(created).toBe(1);
});

test('an amount below the provider minimum blocks creation and says why', async ({ page }) => {
  await page.route('**/api/exchange/quote?**', route => route.fulfill({ json: {
    quoteId: 'quote-min', expiresAt: Date.now() + 120000,
    from: { key: 'sol:sol', label: 'SOL' }, to: { key: 'btc:btc', label: 'BTC' }, amount: '0.05', fixed: false,
    provider: 'simpleswap', estimatedAmount: '0.00001', min: '0.1', max: '10',
  } }));
  await page.goto('/magic-swap');
  await page.getByTestId('exchange-swap-mode').click();
  await page.getByLabel('Amount to send').fill('0.05');
  await page.getByTestId('exchange-get-quote').click();
  await page.locator('#exchange-destination').fill('bc1qt6cx7977r8xttn5rg42d2ulnlc7agspycd600w');
  await expect(page.getByTestId('exchange-create')).toHaveText('Minimum 0.1 SOL');
  await expect(page.getByTestId('exchange-create')).toBeDisabled();
});

test('Exchange Swap is readable on a fresh mobile load', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/magic-swap');
  await page.getByTestId('exchange-swap-mode').click();
  await expect(page.getByTestId('exchange-panel')).toBeVisible();
  await page.screenshot({ path: 'test-results/exchange-mobile.png', fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
});

test('changing an amount discards a quote that arrives late', async ({ page }) => {
  let answer;
  await page.route('**/api/exchange/quote?**', async route => {
    await new Promise(resolve => { answer = resolve; });
    await route.fulfill({ json: { quoteId: 'late', expiresAt: Date.now() + 120000,
      from: { key: 'sol:sol' }, to: { key: 'btc:btc' }, amount: '1',
      provider: 'simpleswap', estimatedAmount: '0.001', min: '0.1', max: '10' } });
  });
  await page.goto('/magic-swap');
  await page.getByTestId('exchange-swap-mode').click();
  await page.getByLabel('Amount to send').fill('1');
  await page.getByTestId('exchange-get-quote').click();
  await expect.poll(() => typeof answer).toBe('function');
  await page.getByLabel('Amount to send').fill('2');
  answer();
  await expect(page.getByTestId('exchange-quote')).toHaveCount(0);
  await expect(page.getByTestId('exchange-get-quote')).toBeEnabled();
});
