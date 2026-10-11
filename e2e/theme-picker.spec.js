const { test, expect } = require('@playwright/test');
const path = require('node:path');
const { buildPrecompiledPage } = require('../precompile-page');
const compiled = buildPrecompiledPage(path.resolve(__dirname, '../public'));
if (!compiled) throw new Error('Theme journey requires a compiled homepage');

/**
 * The theme picker, and the gate in front of it.
 *
 * These run against the static server (e2e/static-server.js), so every /api call
 * is mocked here. The one that matters is /api/profile/themes: it answers both
 * "may this account use themes" and "which ones has MagicMoney synced", and the
 * picker is drawn entirely from that reply.
 */

const ME = {
  id: 'ec18dcf5-3271-46fd-8029-41e5b2f39eed',
  display_name: 'criptoejesus',
  avatar_url: null,
  provider: 'google',
  cl_wallets: [{ id: 'wallet-1', chain: 'evm', address: '0x01faf6dfc230d755141d84d7cb980dd68f5efe13', watch_only: false }],
  cl_linked_accounts: [{ id: 'social-1', provider: 'google', display_name: 'criptoejesus' }],
};

/** Crimson, from the wallet's shipped set — the theme these tests wear. */
const CRIMSON_PAGE = 'rgb(24, 6, 10)';
/** Stock Tailwind slate-50 / slate-950: the app with no theme on it. */
const STOCK_LIGHT_PAGE = 'rgb(248, 250, 252)';
const STOCK_DARK_PAGE = 'rgb(2, 6, 23)';

const SYNCED = {
  // A theme built in the wallet…
  'custom-cherry': { n: 'Cherry', c: { bg: '#2a0512', accent: '#ff2d6f', text: '#ffe3ee' }, t: 1755000000000 },
  // …and one deleted there. A tombstone is not an absence, so it arrives in the
  // payload and must not reach the picker.
  'custom-retired': { n: '', c: { bg: '', accent: '', text: '' }, t: 1755000001000, d: 1 },
};

async function installThemeMocks(page, { themes = null, signedIn = true } = {}) {
  await page.route('http://127.0.0.1:10777/', route => route.fulfill({contentType:'text/html',body:compiled.html}));
  await page.route('**/_compiled/**',route => {
    const code=compiled.assets.get(new URL(route.request().url()).pathname);
    return code ? route.fulfill({contentType:'application/javascript',body:code}) : route.abort();
  });
  // The palette contract is tested independently of translucent finishes.
  await page.addInitScript(() => localStorage.setItem('cl_texture.v1','flat'));
  const response = structuredClone(themes || { eligible: false, walletLinked: false, socialLinked: false, entries: {} });
  if (signedIn) {
    await page.addInitScript(() => localStorage.setItem('cl_token', 'playwright-theme-token'));
  }
  await page.route('**/api/profile', route => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify(ME),
  }));
  await page.route('**/api/profile/filters', route => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify({ entries: {} }),
  }));
  await page.route('**/api/profile/themes', async route => {
    if (route.request().method() === 'PUT') {
      if (!response.eligible) return route.fulfill({ status: 403, body: '{"error":"Not eligible"}' });
      const incoming = route.request().postDataJSON().entries;
      for (const [id, entry] of Object.entries(incoming)) {
        if (!response.entries[id] || entry.t >= response.entries[id].t) response.entries[id] = entry;
      }
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(response) });
  });
  await page.route('**/api/chat/**', route => route.fulfill({
    status: 200, contentType: 'application/json', body: '{}',
  }));
}

test('create, edit and delete a theme across reloads', async ({ page }) => {
  await installThemeMocks(page, { themes: ELIGIBLE });
  await page.goto('/');
  await page.getByTestId('theme-picker-button').click();
  await page.getByTestId('theme-create').click();
  await expect(page.getByTestId('theme-editor')).toBeVisible();
  await page.getByLabel('Theme name').fill('Ocean');
  await page.getByLabel('Background hex').fill('#102030');
  await page.getByLabel('Accent hex').fill('#33ccaa');
  await page.getByLabel('Text hex').fill('#ffffff');
  await page.getByRole('button', { name: 'Create theme', exact: true }).click();
  await expect(page.getByTestId('theme-editor')).toHaveCount(0);
  await expect(page.getByTestId('theme-picker-button')).toContainText('Ocean');
  await expect(shell(page)).toHaveCSS('background-color', 'rgb(16, 32, 48)');

  await page.reload();
  await page.getByTestId('theme-picker-button').click();
  await expect(page.getByTestId('theme-option-custom-cherry')).toBeVisible();
  await page.getByRole('button', { name: 'Edit Ocean' }).click();
  await page.getByLabel('Theme name').fill('Deep Ocean');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByTestId('theme-picker-button')).toContainText('Deep Ocean');

  await page.getByTestId('theme-picker-button').click();
  await page.getByRole('button', { name: 'Edit Deep Ocean' }).click();
  await page.getByRole('button', { name: 'Delete theme' }).click();
  await page.getByRole('button', { name: 'Click again to delete' }).click();
  await expect(page.getByTestId('theme-picker-button')).toContainText('Dark');
  await page.reload();
  await page.getByTestId('theme-picker-button').click();
  await expect(page.getByRole('button', { name: 'Edit Deep Ocean' })).toHaveCount(0);
});

test('a shipped theme can be recoloured and reverted through the profile', async ({ page }) => {
  await installThemeMocks(page, { themes: ELIGIBLE });
  await page.goto('/');
  await page.getByTestId('theme-picker-button').click();
  await page.getByRole('button', { name: 'Edit Crimson' }).click();
  await page.getByLabel('Background hex').fill('#123456');
  await page.getByRole('button', { name: 'Save colours' }).click();
  await expect(page.getByTestId('theme-picker-button')).toContainText('Crimson');
  await expect(shell(page)).toHaveCSS('background-color', 'rgb(18, 52, 86)');
  await page.reload();
  await expect(shell(page)).toHaveCSS('background-color', 'rgb(18, 52, 86)');
  await page.getByTestId('theme-picker-button').click();
  await page.getByRole('button', { name: 'Edit Crimson' }).click();
  await page.getByRole('button', { name: 'Revert to default' }).click();
  await expect(shell(page)).toHaveCSS('background-color', CRIMSON_PAGE);
});

const ELIGIBLE = { eligible: true, walletLinked: true, socialLinked: true, entries: SYNCED };

/** The app shell, whose background is the page colour a theme sets. */
const shell = (page) => page.locator('#root > div').first();

test('signed out, the control is still the Light/Dark switch', async ({ page }) => {
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  await installThemeMocks(page, { signedIn: false });
  await page.goto('/');

  await expect(page.getByTestId('theme-toggle')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('theme-picker')).toHaveCount(0);
  await expect(shell(page)).toHaveCSS('background-color', STOCK_LIGHT_PAGE);

  await page.getByRole('switch', { name: 'Dark mode' }).click();
  await expect(shell(page)).toHaveCSS('background-color', STOCK_DARK_PAGE);
  expect(pageErrors).toEqual([]);
});

test('signed in without chat access, the themes stay locked away', async ({ page }) => {
  // Same rule as chat: a verified wallet AND a Google or Discord login. The
  // server says no, and the client must not draw the picker anyway.
  await installThemeMocks(page, {
    themes: { eligible: false, walletLinked: true, socialLinked: false, entries: SYNCED },
  });
  await page.goto('/');

  await expect(page.getByTestId('theme-toggle')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('theme-picker')).toHaveCount(0);
});

test('an eligible account gets twenty-two shipped themes and its own synced ones', async ({ page }) => {
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  await installThemeMocks(page, { themes: ELIGIBLE });
  await page.goto('/');

  await page.getByTestId('theme-picker-button').click();
  const menu = page.getByTestId('theme-menu');
  await expect(menu).toBeVisible();

  // Light and Dark, twenty-two shipped themes, and Cherry.
  await expect(menu.locator('[data-testid^="theme-option-"]')).toHaveCount(25);
  await expect(page.getByTestId('theme-option-moonlight')).toBeVisible();
  await expect(page.getByTestId('theme-option-sappy-seals')).toBeVisible();
  await expect(page.getByTestId('theme-option-custom-cherry')).toBeVisible();
  // Deleted in the wallet: the tombstone travels, the theme does not.
  await expect(page.getByTestId('theme-option-custom-retired')).toHaveCount(0);
  expect(pageErrors).toEqual([]);
});

test('choosing a theme repaints the app and outlives a reload', async ({ page }) => {
  await installThemeMocks(page, { themes: ELIGIBLE });
  await page.goto('/');

  await page.getByTestId('theme-picker-button').click();
  await page.getByTestId('theme-option-crimson').click();

  await expect(page.getByTestId('theme-menu')).toHaveCount(0);
  await expect(shell(page)).toHaveCSS('background-color', CRIMSON_PAGE);
  await expect(page.getByTestId('theme-picker-button')).toContainText('Crimson');
  // A light theme would leave the dark utility classes rendering the light
  // branch, so the tone has to be stamped as well as the colours.
  await expect(page.locator('html')).toHaveAttribute('data-cl-tone', 'dark');

  await page.reload();
  await expect(shell(page)).toHaveCSS('background-color', CRIMSON_PAGE);
});

test('a synced theme renders from the colours the wallet wrote', async ({ page }) => {
  await installThemeMocks(page, { themes: ELIGIBLE });
  await page.goto('/');
  await expect(page.getByTestId('theme-picker-button')).toBeVisible();

  const sidebar = page.locator('.cl-sidebar');
  await expect(sidebar).toHaveCSS('background-color', 'rgb(255, 255, 255)');

  await page.getByTestId('theme-picker-button').click();
  await page.getByTestId('theme-option-custom-cherry').click();

  await expect(shell(page)).toHaveCSS('background-color', 'rgb(42, 5, 18)');
  await expect(sidebar).toHaveCSS('background-color', 'rgb(54, 6, 23)');
  await expect(page.getByTestId('theme-picker-button')).toContainText('Cherry');
});

test('losing access falls back to the tone the user was looking at', async ({ page }) => {
  await installThemeMocks(page, { themes: ELIGIBLE });
  await page.goto('/');
  await page.getByTestId('theme-picker-button').click();
  await page.getByTestId('theme-option-crimson').click();
  await expect(shell(page)).toHaveCSS('background-color', CRIMSON_PAGE);

  // The account stops qualifying — a wallet removed, or simply signed out. The
  // stored choice is still Crimson, but nothing may render it, and dropping the
  // user onto a white page would be the jarring answer.
  await page.unroute('**/api/profile/themes');
  await page.route('**/api/profile/themes', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ eligible: false, walletLinked: true, socialLinked: false, entries: {} }),
  }));
  await page.reload();

  await expect(page.getByTestId('theme-toggle')).toBeVisible({ timeout: 30_000 });
  await expect(shell(page)).toHaveCSS('background-color', STOCK_DARK_PAGE);
});

for (const art of [{ id: 'mallard-order', name: 'Mallard Order' }, { id: 'sealuminati', name: 'Sealuminati' }, { id: 'emonad', name: 'Emonad' }]) {
  test(`${art.name} skin persists, frames real pages and is not editable and clears on access loss`, async ({ page }) => {
    test.setTimeout(120_000);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await installThemeMocks(page, { themes: ELIGIBLE });
    await page.route('**/api/dex/**', route => route.fulfill({ json: { tokens: [], error: null } }));
    await page.route('**/api/market/**', route => route.fulfill({ json: { coins: [], events: [], state: 'unconfigured' } }));
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/');
    const select = async id => {
      await page.getByTestId('theme-picker-button').click();
      await page.getByTestId(`theme-option-${id}`).click();
    };
    const settle = () => page.evaluate(async () => {
      await document.fonts.ready;
      for (const animation of document.getAnimations()) {
        if (Number.isFinite(animation.effect?.getComputedTiming().endTime)) {
          try { animation.finish(); } catch { /* Responsive transition detached. */ }
        }
      }
    });
    const framed = new RegExp(`/themes/${art.id}/frame\\.webp`);
    if (art.id === 'emonad') {
      await page.getByTestId('theme-picker-button').click();
      const ids = await page.locator('[data-testid^=theme-option-]').evaluateAll(els => els.map(el => el.getAttribute('data-testid')));
      expect(ids[ids.indexOf('theme-option-r3tards') - 1]).toBe('theme-option-emonad');
      await page.getByTestId('theme-picker-button').click();
    }
    await select(art.id);
    await expect(page.locator('html')).toHaveAttribute('data-cl-art-theme', art.id);
    await expect(page.locator('.cl-search-hero')).toHaveCSS('border-image-source', framed);
    await expect(page.getByTestId('theme-picker-button')).toContainText(art.name);
    await page.reload();
    await expect(page.getByTestId('theme-picker-button')).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('html')).toHaveAttribute('data-cl-art-theme', art.id);
    for (const width of [1280, 390, 360]) {
      await page.setViewportSize({ width, height: 900 });
      await settle();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await expect(page.getByRole('search').getByRole('button', { name: 'Search', exact: true })).toBeDisabled();
      await page.screenshot({ path: `test-results/${art.id}-search-${width}.png` });
    }
    await page.getByRole('button', { name: 'Open menu', exact: true }).click();
    await expect(page.locator('.cl-sidebar')).toBeInViewport();
    await settle();
    await page.screenshot({ path: `test-results/${art.id}-nav-360.png` });
    await page.locator('.cl-sidebar').getByRole('button', { name: 'Scanner', exact: true }).click();
    await expect(page.locator('.glass-card').filter({ visible: true }).first()).toHaveCSS('border-image-source', framed);
    await settle();
    await page.screenshot({ path: `test-results/${art.id}-scanner-360.png` });
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.locator('.cl-sidebar').getByRole('button', { name: 'Magic Swap', exact: true }).click();
    await expect(page.locator('.dex-swap .panel').first()).toHaveCSS('border-image-source', framed);
    await expect(page.locator('.dex-swap .swap-asset-card').first()).toHaveCSS('border-image-source', framed);
    await expect(page.getByTestId('magic-swap-logo').locator('img').first()).toHaveCSS('image-rendering', 'auto');
    if (art.id === 'emonad') await expect(page.getByTestId('magic-swap-logo').locator('img').first()).toHaveCSS('filter', /grayscale\(1\).*brightness\(1\.2\)/);
    await settle();
    await page.screenshot({ path: `test-results/${art.id}-swap-1280.png` });
    await page.setViewportSize({ width: 390, height: 900 });
    await settle();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `test-results/${art.id}-swap-390.png` });
    // Art palettes retain their identity and have no editor.
    await page.getByTestId('theme-picker-button').click();
    await expect(page.getByRole('button', { name: `Edit ${art.name}`, exact: true })).toHaveCount(0);
    await page.getByTestId('theme-picker-button').click();
    await select('custom-cherry');
    await expect(page.locator('html')).not.toHaveAttribute('data-cl-art-theme');
    await expect(page.locator('.dex-swap .panel').first()).toHaveCSS('border-image-source', 'none');
    await select('dark');
    await expect(page.locator('html')).not.toHaveAttribute('data-cl-art-theme');
    if (art.id === 'emonad') {
      await page.getByTestId('theme-picker-button').click();
      const ids = await page.locator('[data-testid^=theme-option-]').evaluateAll(els => els.map(el => el.getAttribute('data-testid')));
      expect(ids[ids.indexOf('theme-option-r3tards') - 1]).toBe('theme-option-emonad');
      await page.getByTestId('theme-picker-button').click();
    }
    await select(art.id);
    await page.unroute('**/api/profile/themes');
    await page.route('**/api/profile/themes', route => route.fulfill({ json: { eligible: false, walletLinked: true, socialLinked: false, entries: {} } }));
    await page.reload();
    await expect(page.getByTestId('theme-toggle')).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('html')).not.toHaveAttribute('data-cl-art-theme');
    expect(errors).toEqual([]);
  });
}

test('tarot and existing art skins cover Profile, App Hub and Market without filtering user artwork', async ({ page }) => {
  test.setTimeout(120_000);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/api/**', route => route.fulfill({ json: { available: true, entries: {}, coins: [], nfts: [], transactions: [], passkeys: [] } }));
  await installThemeMocks(page, { themes: ELIGIBLE });
  await page.route('**/api/market/top100', route => route.fulfill({ json: [] }));
  await page.route('**/api/market/new-listings', route => route.fulfill({ json: { state: 'live', events: [{ id: 'art-preview', symbols: [], exchange: 'coinbase', markets: [], marketType: 'spot', timestamp: 1700000000000, title: 'Art theme listing preview', url: 'https://example.com/listing' }] } }));
  const avatar = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80"><rect width="80" height="80" fill="#ec4899"/></svg>');
  await page.route('**/api/profile', route => route.fulfill({ json: { ...ME, avatar_url: avatar } }));
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/');
  for (const id of ['mallard-order', 'sealuminati', 'emonad']) {
    await page.getByTestId('theme-picker-button').click();
    await page.getByTestId(`theme-option-${id}`).click();
    await page.locator('.cl-sidebar').getByRole('button', { name: 'Profile', exact: true }).click();
    await expect(page.locator('.profile-banner')).toBeVisible();
    await expect(page.locator('.profile-account .glass-card').first()).toHaveCSS('border-image-source', new RegExp(`/themes/${id}/frame\\.webp`));
    await expect(page.locator('.profile-banner-avatar img')).toHaveCSS('filter', 'none');
    for (const width of [1280, 390]) {
      await page.setViewportSize({ width, height: 900 });
      await page.evaluate(() => document.fonts.ready);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.screenshot({ path: `test-results/${id}-profile-${width}.png` });
    }
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.locator('.cl-sidebar').getByRole('button', { name: 'App Hub', exact: true }).click();
    await expect(page.getByRole('img', { name: 'App Hub', exact: true })).toBeVisible();
    await page.screenshot({ path: `test-results/${id}-apps-1280.png` });
    await page.setViewportSize({ width: 390, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `test-results/${id}-apps-390.png` });
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.locator('.cl-sidebar').getByRole('button', { name: 'Market', exact: true }).click();
    await expect(page.getByRole('img', { name: 'Market Watch', exact: true })).toBeVisible();
    await page.getByRole('group', { name: 'Market Watch view' }).getByRole('button', { name: 'New Listings' }).click();
    await expect(page.getByTestId('new-listings-panel').getByRole('article')).toHaveCSS('border-image-source', new RegExp(`/themes/${id}/frame\\.webp`));
    await page.setViewportSize({ width: 390, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `test-results/${id}-market-390.png` });
    await page.setViewportSize({ width: 1280, height: 900 });
  }
  expect(errors).toEqual([]);
});

test('r3tards collab uses supplied artwork, pill controls and isolated materials on real pages', async ({ page }) => {
  test.setTimeout(150_000);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/api/**', route => route.fulfill({ json: { available: true, entries: {}, coins: [], nfts: [], transactions: [], passkeys: [] } }));
  await installThemeMocks(page, { themes: ELIGIBLE });
  await page.route('**/api/dex/**', route => route.fulfill({ json: { tokens: [], error: null } }));
  await page.route('**/api/market/top100', route => route.fulfill({ json: [] }));
  await page.route('**/api/market/new-listings', route => route.fulfill({ json: { state: 'live', events: [{ id: 'r3-art-preview', symbols: [], exchange: 'coinbase', markets: [], timestamp: 1700000000000, title: 'Collab theme listing preview', url: 'https://example.com/listing' }] } }));
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/');
  const select = async id => {
    await page.getByTestId('theme-picker-button').click();
    await page.getByTestId(`theme-option-${id}`).click();
  };
  const screenshot = async name => {
    await page.evaluate(async () => {
      await document.fonts.ready;
      // Finish finite transitions before capture. A transition whose target is
      // hidden by a responsive breakpoint can remain paused indefinitely.
      for (const animation of document.getAnimations()) {
        if (Number.isFinite(animation.effect?.getComputedTiming().endTime)) {
          try { animation.finish(); } catch { /* Timeline may have been detached. */ }
        }
      }
    });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `test-results/r3tards-${name}.png` });
  };
  await select('r3tards');
  await expect(page.locator('html')).toHaveAttribute('data-cl-art-theme', 'r3tards');
  await page.reload();
  await expect(page.getByTestId('theme-picker-button')).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('html')).toHaveAttribute('data-cl-art-theme', 'r3tards');
  await expect(page.locator('.cl-art-app')).toHaveCSS('background-image', /r3tards\/background\.webp/);
  const searchButton = page.getByRole('search').getByRole('button', { name: 'Search', exact: true });
  await expect(searchButton).toHaveCSS('background-color', 'rgb(255, 255, 255)');
  await expect(searchButton).toHaveCSS('color', 'rgb(16, 16, 16)');
  await expect(searchButton).toHaveCSS('border-radius', '999px');
  await expect(page.locator('.cl-search-hero')).toHaveCSS('border-image-source', 'none');
  await expect(page.locator('.cl-search-hero h1')).toHaveCSS('font-family', /CL Schoolbell/);
  await expect(page.locator('.cl-sidebar .cl-nav-item').first()).toHaveCSS('font-family', /CL Plex Mono/);
  for (const width of [1280, 390, 360]) {
    await page.setViewportSize({ width, height: 900 });
    await screenshot(`search-${width}`);
  }
  expect(await page.evaluate(() => document.fonts.check('20px "CL Schoolbell"') && document.fonts.check('14px "CL Plex Mono"'))).toBe(true);
  await page.getByRole('button', { name: 'Open menu', exact: true }).click();
  await screenshot('nav-360');
  await page.locator('.cl-sidebar').getByRole('button', { name: 'Scanner', exact: true }).click();
  await expect(page.locator('.glass-card').filter({ visible: true }).first()).toHaveCSS('border-image-source', 'none');
  await screenshot('scanner-360');
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.locator('.cl-sidebar').getByRole('button', { name: 'Magic Swap', exact: true }).click();
  await expect(page.locator('.dex-swap .swap-asset-card').first()).toHaveCSS('border-image-source', 'none');
  await expect(page.getByTestId('magic-swap-logo').locator('img').first()).toHaveCSS('image-rendering', 'auto');
  await expect(page.getByTestId('magic-swap-logo').locator('img').first()).toHaveCSS('filter', 'grayscale(1)');
  await screenshot('swap-1280');
  await page.setViewportSize({ width: 390, height: 900 });
  await screenshot('swap-390');
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.locator('.cl-sidebar').getByRole('button', { name: 'Profile', exact: true }).click();
  await expect(page.locator('.profile-banner')).toBeVisible();
  await screenshot('profile-1280');
  await page.setViewportSize({ width: 390, height: 900 });
  await screenshot('profile-390');
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.locator('.cl-sidebar').getByRole('button', { name: 'App Hub', exact: true }).click();
  await expect(page.getByRole('img', { name: 'App Hub', exact: true })).toBeVisible();
  await screenshot('apps-1280');
  await page.setViewportSize({ width: 390, height: 900 });
  await screenshot('apps-390');
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.locator('.cl-sidebar').getByRole('button', { name: 'Market', exact: true }).click();
  await page.getByRole('group', { name: 'Market Watch view' }).getByRole('button', { name: 'New Listings' }).click();
  await expect(page.getByTestId('new-listings-panel').getByRole('article')).toHaveCSS('border-image-source', 'none');
  await page.setViewportSize({ width: 390, height: 900 });
  await screenshot('market-390');
  await page.getByTestId('theme-picker-button').click();
  await expect(page.getByRole('button', { name: 'Edit r3tards', exact: true })).toHaveCount(0);
  await page.getByTestId('theme-picker-button').click();
  await expect(page.locator('html')).toHaveAttribute('data-cl-art-theme', 'r3tards');
  await select('sealuminati');
  await expect(page.locator('html')).toHaveAttribute('data-cl-art-theme', 'sealuminati');
  await expect(page.locator('.cl-art-app')).toHaveCSS('background-image', /sealuminati\/cloth\.webp/);
  await select('mallard-order');
  await expect(page.locator('.cl-art-app')).toHaveCSS('background-image', /mallard-order\/stone\.webp/);
  await select('custom-cherry');
  await expect(page.locator('html')).not.toHaveAttribute('data-cl-art-theme');
  await select('dark');
  await expect(page.locator('.cl-art-app')).toHaveCSS('background-image', 'none');
  expect(errors).toEqual([]);
});


test('r3tards scanner and theme menu fit tall and narrow desktop viewports', async ({ page }) => {
  await page.route('**/api/**', route => route.fulfill({ json: { available: true, entries: {}, coins: [], nfts: [], transactions: [], passkeys: [] } }));
  await installThemeMocks(page, { themes: ELIGIBLE });
  await page.setViewportSize({ width: 1080, height: 1800 });
  await page.goto('/');
  await page.getByTestId('theme-picker-button').click();
  await page.getByTestId('theme-option-r3tards').click();
  await page.locator('.cl-sidebar').getByRole('button', { name: 'Scanner', exact: true }).click();
  for (const [width, height] of [[1080, 1800], [1080, 720], [900, 900], [360, 900]]) {
    await page.setViewportSize({ width, height });
    await page.evaluate(() => document.fonts.ready);
    const fields = page.locator('input[placeholder="0x... or domain, comma-separated"], input[placeholder="SOL, DOT or TRX, comma-separated"], input[placeholder="$handle, addr1, bc1 or DOGE"]');
    const geometry = await fields.evaluateAll(inputs => inputs.map(input => {
      const row = input.closest('.flex.items-center.gap-2');
      const column = row.parentElement.getBoundingClientRect();
      const bounds = row.getBoundingClientRect();
      const toggle = row.querySelector('button').getBoundingClientRect();
      return bounds.left >= column.left - 1 && toggle.right <= column.right + 1 && input.getBoundingClientRect().width > 90;
    }));
    expect(geometry).toEqual([true, true, true]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `test-results/r3tards-scaling-scanner-${width}x${height}.png` });
    await page.getByTestId('theme-picker-button').click();
    const menu = page.getByTestId('theme-menu');
    await expect(menu).toHaveCSS('border-radius', '20px');
    const bounds = await menu.boundingBox();
    expect(bounds.y + bounds.height).toBeLessThanOrEqual(height - 48);
    expect(bounds.height).toBeLessThanOrEqual(640);
    await menu.evaluate(el => { el.scrollTop = el.scrollHeight; });
    await expect(page.getByTestId('theme-create')).toBeInViewport();
    await menu.evaluate(el => { el.scrollTop = 0; });
    await page.screenshot({ path: `test-results/r3tards-scaling-menu-${width}x${height}.png` });
    await page.getByTestId('theme-picker-button').click();
  }
});


test('all art themes ignore legacy profile recolors and expose no editor', async ({ page }) => {
  const arts = require('../public/theme-engine').BUILTIN_THEMES.filter(theme => theme.art);
  const entries = { ...SYNCED };
  for (const art of arts) entries[`custom-builtin-${art.id}`] = { n:art.name, c:{bg:'#123456',accent:'#abcdef',text:'#ffffff'}, t:Date.now() };
  await installThemeMocks(page, { themes:{ ...ELIGIBLE, entries } });
  await page.goto('/');
  for (const art of arts) {
    await page.getByTestId('theme-picker-button').click();
    await expect(page.getByTestId(`theme-edit-${art.id}`)).toHaveCount(0);
    await page.getByTestId(`theme-option-${art.id}`).click();
    await expect(page.locator('html')).toHaveAttribute('data-cl-art-theme', art.id);
    expect(await page.locator('html').evaluate(el => el.style.getPropertyValue('--cl-page'))).toBe(require('../public/theme-engine').toRgbSpaced(require('../public/theme-engine').parseHex(art.colors.bg)));
  }
  await page.getByTestId('theme-picker-button').click();
  await expect(page.getByRole('button', { name:'Edit Crimson',exact:true })).toBeVisible();
});
