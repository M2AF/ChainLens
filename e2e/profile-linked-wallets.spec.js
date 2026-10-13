const { test, expect } = require('@playwright/test');
test.setTimeout(90000);
const ID = 'ec18dcf5-3271-46fd-8029-41e5b2f39eed';
const wallets = [
  { id: 1, chain: 'evm', label: 'Main wallet', address: '0x01faf6dfc230d755141d84d7cb980dd68f5efe13', is_primary: true },
  { id: 2, chain: 'evm', label: 'Treasury', address: '0x8a4240502b862e8cc41ff001e6f32abcec460102', watch_only: true },
  { id: 3, chain: 'solana', address: '3noTuHnQdHkat2w5rBx18vAACMzFUvB5LodEe5vMN98d', is_primary: true },
  { id: 4, chain: 'cardano', label: 'Long address', address: 'addr1q950qw0ks9t29mavulaa5jr3sk2s50r5jfsddy djs0pazrfh32tdpt7ztt4mhl6t9purm4c9rv555z7r5mulq78aleqcg9c9h'.replace(/ /g, ''), is_primary: true },
  { id: 5, chain: 'bitcoin', address: 'bc1qt6cx7977r8xttn5rg42d2ulnlc7agspycd600w', is_primary: true },
  { id: 6, chain: 'polkadot', address: '1dhUhWA8DZEbT5GmjXTJBuaFJGwtS5YH13Wqz46KtFdDyoS', is_primary: true },
  { id: 7, chain: 'tron', address: 'TD9Fr6Kxsn7zM6zk4Z7YkGjd5RfkaKN8pW', watch_only: true },
  { id: 8, chain: 'dogecoin', address: 'D5k39D3LTe4CviwAkqWRPW6sMgGCtrxp jA'.replace(/ /g, ''), watch_only: true },
];
test('compact linked wallets wrap full addresses, copy exactly, stack actions and retain editing', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.addInitScript(token => localStorage.setItem('cl_token', token), 'test.' + Buffer.from(JSON.stringify({ sub: ID })).toString('base64url') + '.test');
  const profile = { id: ID, display_name: 'Collector', cl_wallets: structuredClone(wallets), cl_linked_accounts: [] };
  const mutations = [], errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.route('**/api/**', route => {
    const req = route.request(), path = new URL(req.url()).pathname;
    let body = {};
    if (path === '/api/profile' || path === '/api/profiles/' + ID) body = profile;
    else if (path.startsWith('/api/profile/wallet/')) {
      const id = Number(path.split('/').pop());
      mutations.push({ method: req.method(), id, body: req.postDataJSON() });
      if (req.method() === 'DELETE') profile.cl_wallets = profile.cl_wallets.filter(w => w.id !== id);
      else Object.assign(profile.cl_wallets.find(w => w.id === id), req.postDataJSON());
      body = { success: true };
    } else if (path.startsWith('/api/nfts/')) body = { nfts: [] };
    else if (path.endsWith('/filters') || path.endsWith('/themes')) body = { entries: {} };
    else if (path.endsWith('/status')) body = { eligible: false };
    return route.fulfill({ json: body });
  });
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/' + ID);
  await page.getByText('Linked wallets · 8', { exact: true }).click();
  const list = page.locator('.profile-wallet-list');
  await expect(list.locator('.profile-wallet-row')).toHaveCount(8);
  for (const wallet of wallets) {
    const row = page.getByTestId('linked-wallet-' + wallet.id);
    await expect(row.locator('code')).toHaveText(wallet.address);
    await row.getByRole('button', { name: `Copy ${wallet.label || ''}`, exact: false }).click();
    await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(wallet.address);
    await expect(row.locator('.profile-wallet-address')).toContainText('Copied');
    const rename = await row.getByTitle('Rename', { exact: true }).boundingBox();
    const remove = await row.getByTitle('Remove', { exact: true }).boundingBox();
    expect(remove.x).toBe(rename.x); expect(remove.y).toBeGreaterThan(rename.y);
  }
  for (const width of [1920, 1024, 768, 390]) {
    await page.setViewportSize({ width, height: 1080 });
    await expect.poll(() => list.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await list.screenshot({ path: `test-results/linked-wallets-${width}.png` });
  }
  const row = page.getByTestId('linked-wallet-2');
  await row.getByTitle('Rename', { exact: true }).click();
  await row.getByPlaceholder('Wallet nickname…').fill('Savings');
  await row.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(row.locator('strong')).toHaveText('Savings');
  await row.getByTitle('Rename', { exact: true }).click();
  await row.getByPlaceholder('Wallet nickname…').fill('Discard this');
  await row.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(row.locator('strong')).toHaveText('Savings');
  await row.getByTitle('Set as primary', { exact: true }).click();
  await expect(row.locator('.profile-wallet-primary')).toHaveText('Primary');
  page.once('dialog', dialog => dialog.accept());
  await row.getByTitle('Remove', { exact: true }).click();
  await expect(row).toHaveCount(0);
  expect(mutations.map(m => m.method)).toEqual(['PATCH', 'PATCH', 'DELETE']);
  expect(errors).toEqual([]);
});
