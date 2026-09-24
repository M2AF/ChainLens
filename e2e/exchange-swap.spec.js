const { test, expect } = require('@playwright/test');

/** Choose an asset in the logo picker (it replaced the native <select>). */
async function pickAsset(page, name, key) {
  await page.getByRole('button', { name }).click();
  await page.locator(`[role="listbox"][aria-label="${name}"] [data-key="${key}"]`).click();
}

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
  await pickAsset(page, 'Send asset', 'sol:sol');
  await pickAsset(page, 'Receive asset', 'eth:eth');
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

test('destination and refund auto-fill from profile wallets, verified before watch-only', async ({ page }) => {
  const EVM = '0x01faf6dfc230d755141d84d7cb980dd68f5efe13';
  const SOL = '3noTuHnQdHkat2w5rBx18vAACMzFUvB5LodEe5vMN98d';
  const BTC = 'bc1qt6cx7977r8xttn5rg42d2ulnlc7agspycd600w';
  await page.addInitScript(() => localStorage.setItem('cl_token', 'playwright-exchange-token'));
  await page.route('**/api/profile', route => route.fulfill({ json: {
    id: 'u1', display_name: 'tester', cl_linked_accounts: [],
    cl_wallets: [
      { id: 'w1', chain: 'solana', address: '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU', watch_only: true, is_primary: false, label: 'Whale I follow' },
      { id: 'w2', chain: 'solana', address: SOL, watch_only: false, is_primary: false, label: 'My Phantom' },
      { id: 'w3', chain: 'bitcoin', address: BTC, watch_only: true, is_primary: true, label: null },
      { id: 'w4', chain: 'evm', address: EVM, watch_only: false, is_primary: true, label: 'Main' },
    ] } }));
  await page.route('**/api/profile/**', route => route.fulfill({ json: { entries: {} } }));
  await page.route('**/api/chat/**', route => route.fulfill({ json: {} }));
  await page.goto('/magic-swap');
  await page.getByTestId('exchange-swap-mode').click();
  // SOL -> BTC: the signed-in Solana wallet refunds; the only BTC wallet is watch-only and says so.
  await expect(page.locator('#exchange-refund')).toHaveValue(SOL);
  await expect(page.getByTestId('exchange-panel')).toContainText('Auto-filled from your profile: My Phantom');
  await expect(page.locator('#exchange-destination')).toHaveValue(BTC);
  await expect(page.getByTestId('exchange-panel')).toContainText('watch only, make sure you control it');
  // An asset no profile wallet can hold is left for the user to paste.
  await pickAsset(page, 'Receive asset', 'xrp:xrp');
  await expect(page.locator('#exchange-destination')).toHaveValue('');
  await pickAsset(page, 'Receive asset', 'usdc:eth');
  await expect(page.locator('#exchange-destination')).toHaveValue(EVM);
  // A typed address wins and survives a pair change.
  await page.locator('#exchange-destination').fill('0x000000000000000000000000000000000000dEaD');
  await pickAsset(page, 'Receive asset', 'eth:eth');
  await expect(page.locator('#exchange-destination')).toHaveValue('0x000000000000000000000000000000000000dEaD');
  // Flipping re-derives both sides from the profile.
  await page.getByRole('button', { name: 'Flip exchange direction' }).click();
  await expect(page.locator('#exchange-destination')).toHaveValue(SOL);
  await expect(page.locator('#exchange-refund')).toHaveValue(EVM);
});

test('the asset picker shows logos and filters by name', async ({ page }) => {
  await page.goto('/magic-swap');
  await page.getByTestId('exchange-swap-mode').click();
  await page.getByRole('button', { name: 'Send asset' }).click();
  const list = page.locator('[role="listbox"][aria-label="Send asset"]');
  await expect(list.locator('[data-key="btc:btc"] img')).toHaveAttribute('src', /trustwallet\/assets\/master\/blockchains\/bitcoin/);
  await page.getByLabel('Search send asset').fill('tether');
  await expect(list.getByRole('option')).toHaveCount(1);
  await page.keyboard.press('Enter');
  await expect(page.getByRole('button', { name: 'Send asset' })).toContainText('USDT');
});
