const { test, expect } = require('@playwright/test');
const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');
const walletHook = esbuild.buildSync({ entryPoints: [path.resolve('../Magic Money Wallet/src/renderer/lib/use-nft-favorites.ts')], bundle: true, write: false, platform: 'browser', format: 'iife', globalName: 'WalletFavoriteHook', external: ['react'] }).outputFiles[0].text;
const websiteHook = fs.readFileSync('public/nft-favorites.jsx', 'utf8');
const identity = 'base:n:0xabc:7', key = 'favorite:mainnet:' + identity;
const tokenFor = id => 'test.' + Buffer.from(JSON.stringify({ sub: id })).toString('base64url') + '.test';

test('scanner NFT stars sit over the image and pin favorites without opening details', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.route('**/api/**', route => {
    const url = new URL(route.request().url());
    if (url.pathname.startsWith('/api/nfts/base/')) return route.fulfill({ json: { nfts: [
      { chain: 'base', contractAddress: '0xabc', tokenId: '7', id: 'base-0xabc-7', name: 'Lower NFT', totalValue: '10', image: '', nativePrice: '1' },
      { chain: 'base', contractAddress: '0xabc', tokenId: '8', id: 'base-0xabc-8', name: 'Higher NFT', totalValue: '100', image: '', nativePrice: '10' },
    ] } });
    return route.fulfill({ json: { nfts: [], transactions: [] } });
  });
  await page.goto('/');
  await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('button', { name: 'Scanner', exact: true }).click();
  await page.getByPlaceholder('0x... or domain, comma-separated').fill('0x1111111111111111111111111111111111111111');
  await page.getByRole('button', { name: 'SCAN ASSETS', exact: true }).click();
  const star = page.getByRole('button', { name: 'Favorite Lower NFT', exact: true });
  await expect(star).toBeVisible();
  await star.click();
  await expect(page.getByRole('button', { name: 'Unfavorite Lower NFT', exact: true })).toHaveAttribute('aria-pressed', 'true');
  expect(await page.getByRole('button', { name: /^(Unfavorite|Favorite) (Lower|Higher) NFT$/ }).allTextContents()).toHaveLength(2);
  await expect.poll(() => page.locator('button[aria-label="Unfavorite Lower NFT"]').evaluate(button => button.parentElement.parentElement.parentElement.querySelector('button[aria-pressed]') === button)).toBe(true);
  await page.screenshot({ path: 'test-results/profile-favorites-scanner.png' });
  const toolbar = page.locator('.scanner-toolbar');
  const tabs = page.getByRole('group', { name:'Scanner asset type' });
  const layout = page.getByRole('switch', { name:'List view' });
  const toolbarBox = await toolbar.boundingBox(), tabsBox = await tabs.boundingBox();
  expect(Math.abs(tabsBox.x + tabsBox.width/2 - toolbarBox.x - toolbarBox.width/2)).toBeLessThan(2);
  await expect(layout).toHaveAttribute('aria-checked','false');
  await layout.click();
  await expect(layout).toHaveAttribute('aria-checked','true');
  await expect(page.locator('.group.cursor-pointer > div.w-16')).toHaveCount(2);
  await tabs.getByRole('button', { name:'Tokens', exact:true }).click();
  await expect(layout).toHaveAttribute('aria-checked','true');
  await tabs.getByRole('button', { name:'NFTs', exact:true }).click();
  await expect(page.locator('.group.cursor-pointer > div.w-16')).toHaveCount(2);
  await toolbar.scrollIntoViewIfNeeded();
  await page.screenshot({ path:'test-results/scanner-controls-desktop.png' });
  await layout.focus();
  await page.keyboard.press('Space');
  await expect(layout).toHaveAttribute('aria-checked','false');
  await expect(page.locator('.group.cursor-pointer > div.aspect-square')).toHaveCount(2);
  await page.setViewportSize({ width:390,height:844 });
  await toolbar.scrollIntoViewIfNeeded();
  await expect(layout).toBeVisible();
  await expect(tabs).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path:'test-results/scanner-controls-mobile.png' });
});

test('real wallet and website hooks share stars, tombstones, offline edits and separate profiles/networks', async ({ browser }) => {
  const documents = { one: {}, two: {} };
  const contexts = await Promise.all([browser.newContext(), browser.newContext()]);
  const pages = await Promise.all(contexts.map(c => c.newPage()));
  let offline = false;
  try {
    for (const page of pages) {
      await page.route('**/favorites-harness', route => route.fulfill({ contentType: 'text/html', body: '<script src="https://unpkg.com/react@18/umd/react.production.min.js"></script><script src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js"></script><script src="/asset-filter-key.js"></script><div id="root"></div>' }));
      await page.route('**/api/profile/filters', route => {
        if (offline) return route.abort();
        const token = route.request().headers().authorization?.split(' ')[1];
        const id = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString()).sub;
        if (route.request().method() === 'PUT') {
          const incoming = route.request().postDataJSON().entries;
          for (const [key, entry] of Object.entries(incoming)) if (!documents[id][key] || entry.t > documents[id][key].t) documents[id][key] = entry;
        }
        return route.fulfill({ json: { entries: documents[id] } });
      });
      await page.goto('/favorites-harness');
      await page.waitForFunction(() => !!window.ReactDOM && !!window.assetFilterKey);
    }
    await pages[0].evaluate(({ identity, token }) => {
      window.require = () => React;
      localStorage.setItem('mmw_nft_favorites_v1_mainnet_0xowner', JSON.stringify([identity]));
      const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
      window.wallet = { getAddresses: async () => ({ evm: '0xowner' }), assetFiltersGet: async () => (await (await fetch('/api/profile/filters', { headers })).json()).entries,
        assetFiltersPush: async entries => ({ ...(await (await fetch('/api/profile/filters', { method: 'PUT', headers, body: JSON.stringify({ entries }) })).json()), error: null }) };
    }, { identity, token: tokenFor('one') });
    await pages[0].addScriptTag({ content: walletHook });
    await pages[0].evaluate(identity => {
      function Harness() {
        const [testnet, setTestnet] = React.useState(false);
        const { favorites, toggleFavorite } = WalletFavoriteHook.useNftFavorites('0xowner', testnet);
        return React.createElement('div', null, React.createElement('span', { id: 'star' }, String(favorites.has(identity))),
          React.createElement('button', { onClick: () => toggleFavorite(identity) }, 'Toggle'),
          React.createElement('button', { onClick: () => setTestnet(n => !n) }, 'Network'));
      }
      ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(Harness));
    }, identity);
    await pages[1].addScriptTag({ content: websiteHook });
    await pages[1].evaluate(({ identity, token }) => {
      window.changeProfile = null;
      function Harness() {
        const [profile, setProfile] = React.useState('one'); window.changeProfile = setProfile;
        const jwt = 'test.' + btoa(JSON.stringify({ sub: profile })) + '.test';
        const { favorites, toggleFavorite } = window.useProfileNftFavorites(profile, jwt);
        return React.createElement('div', null, React.createElement('span', { id: 'star' }, String(favorites.has(identity))),
          React.createElement('button', { onClick: () => toggleFavorite({ chain: 'base', contractAddress: '0xABC', tokenId: '7' }) }, 'Toggle'));
      }
      ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(Harness));
    }, { identity, token: tokenFor('one') });
    await expect(pages[0].locator('#star')).toHaveText('true');
    await expect.poll(() => documents.one[key]?.s).toBe('f'); // Migration reaches profile.
    await pages[1].evaluate(() => window.dispatchEvent(new Event('focus')));
    await expect(pages[1].locator('#star')).toHaveText('true');
    await pages[1].getByRole('button', { name: 'Toggle' }).click();
    await expect.poll(() => documents.one[key]?.s).toBe('u');
    await pages[0].evaluate(() => window.dispatchEvent(new Event('focus')));
    await expect(pages[0].locator('#star')).toHaveText('false');
    offline = true;
    await pages[0].getByRole('button', { name: 'Toggle' }).click();
    await expect(pages[0].locator('#star')).toHaveText('true');
    await pages[0].waitForTimeout(1000);
    expect(documents.one[key].s).toBe('u');
    offline = false;
    await pages[0].evaluate(() => window.dispatchEvent(new Event('online')));
    await expect.poll(() => documents.one[key]?.s).toBe('f');
    await pages[1].evaluate(() => window.dispatchEvent(new Event('focus')));
    await expect(pages[1].locator('#star')).toHaveText('true');
    await pages[1].evaluate(() => window.changeProfile('two'));
    await expect(pages[1].locator('#star')).toHaveText('false');
    await pages[1].getByRole('button', { name: 'Toggle' }).click();
    await expect.poll(() => documents.two[key]?.s).toBe('f');
    await pages[0].getByRole('button', { name: 'Network' }).click();
    await expect(pages[0].locator('#star')).toHaveText('false');
    expect(documents.one['favorite:testnet:' + identity]).toBeUndefined();
  } finally { await Promise.all(contexts.map(c => c.close())); }
});
