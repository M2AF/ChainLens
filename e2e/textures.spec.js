const { test, expect } = require('@playwright/test');
const path = require('node:path');
const { buildPrecompiledPage } = require('../precompile-page');
// Exercise the production precompile path; no runtime Babel CDN dependency.
const compiled = buildPrecompiledPage(path.resolve(__dirname, '../public'));
if (!compiled) throw new Error('Texture journey requires a compiled homepage');

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
  await page.route('http://127.0.0.1:10777/', route => route.fulfill({ contentType: 'text/html', body: compiled.html }));
  await page.route('**/_compiled/**', route => {
    const code = compiled.assets.get(new URL(route.request().url()).pathname);
    return code ? route.fulfill({ contentType: 'application/javascript', body: code }) : route.abort();
  });
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


SYNCED['custom-builtin-liquid-glass'] = { n:'Recoloured', c:{bg:'#ffffff',accent:'#ff0000',text:'#000000'}, t:1755000001000 };
const ELIGIBLE = { eligible: true, walletLinked: true, socialLinked: true, entries: SYNCED };

test('texture remains independent across palettes, previews, art and reload', async ({ page }) => {
  test.setTimeout(120_000);
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await installThemeMocks(page, { themes: ELIGIBLE });
  await page.goto('/');
  await page.getByTestId('theme-picker-button').click();
  const toneSwitch = page.getByRole('switch', { name: /Two-tone surfaces/ });
  await expect(toneSwitch).toHaveAttribute('aria-checked', 'true');
  await toneSwitch.click();
  await page.getByTestId('theme-picker-button').click();
  for (const id of ['flat','grain','fade']) {
    await page.getByTestId('theme-picker-button').click();
    await page.getByTestId(`texture-option-${id}`).click();
    await expect(page.locator('html')).toHaveAttribute('data-texture', id);
    await expect(page.locator('html')).toHaveAttribute('data-material-active', '');
    await page.getByTestId('theme-option-grape').click();
    await expect(page.locator('html')).toHaveAttribute('data-surface-tone', 'matching');
    await expect.poll(() => page.locator('.cl-sidebar').evaluate(el => getComputedStyle(el).backgroundColor === getComputedStyle(document.querySelector('.cl-art-app')).backgroundColor)).toBe(true);
    if (id === 'flat') await expect(page.locator('.cl-art-app')).toHaveCSS('background-image', 'none');
    else await expect(page.locator('.cl-art-app')).not.toHaveCSS('background-image', 'none');
    await page.screenshot({ path: `test-results/texture-${id}-chainlens.png` });
  }
  await page.getByTestId('theme-picker-button').click();
  await toneSwitch.click();
  await expect(page.locator('html')).toHaveAttribute('data-surface-tone', 'layered');
  expect(await page.locator('.cl-sidebar').evaluate(el => getComputedStyle(el).backgroundColor !== getComputedStyle(document.querySelector('.cl-art-app')).backgroundColor)).toBe(true);
  await page.getByTestId('theme-picker-button').click();
  await page.screenshot({ path: 'test-results/texture-fade-two-tone-chainlens.png' });
  await page.getByTestId('theme-picker-button').click();
  await toneSwitch.click();
  await page.getByTestId('theme-picker-button').click();
  for (const id of ['moonlight','crimson','grape','matrix','white-gold','midnight','cardano','milady','monad','abstract','bitcoin','sappy-seals','custom-cherry']) {
    await page.getByTestId('theme-picker-button').click();
    await page.getByTestId(`theme-option-${id}`).click();
    await expect(page.locator('html')).toHaveAttribute('data-material-active', '');
    await expect(page.locator('html')).toHaveAttribute('data-texture', 'fade');
    if (id === 'white-gold') {
      expect(await page.locator('.cl-search-hero').evaluate(hero => {
        const rgb = color => { const channels = color.match(/[\d.]+/g).map(Number); return { r: channels[0], g: channels[1], b: channels[2] }; };
        const bg = rgb(getComputedStyle(hero).backgroundColor);
        return window.chainlensThemes.contrastRatio(rgb(getComputedStyle(hero.querySelector('h1')).color), bg) >= 4.5;
      })).toBe(true);
      await page.screenshot({ path: 'test-results/texture-light-chainlens.png' });
    }
  }
  await page.getByTestId('theme-picker-button').click();
  await page.getByTestId('theme-option-liquid-glass').click();
  await expect(page.locator('html')).toHaveAttribute('data-cl-art-theme','liquid-glass');
  await expect(page.locator('html')).toHaveAttribute('data-cl-tone','dark');
  await expect(page.locator('html')).not.toHaveAttribute('data-surface-active');
  await page.getByTestId('theme-picker-button').click();
  await expect(page.getByTestId('theme-edit-liquid-glass')).toHaveCount(0);
  await page.getByTestId('texture-option-flat').click();
  await toneSwitch.click();
  await page.getByTestId('theme-picker-button').click();
  for (const width of [360,1400]) {
    await page.setViewportSize({width,height:900});
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({path:`test-results/liquid-glass-chainlens-${width}.png`});
  }
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-cl-art-theme','liquid-glass');
  await page.getByTestId('theme-picker-button').click();
  await page.getByTestId('texture-option-fade').click();
  await toneSwitch.click();
  await page.getByTestId('theme-option-mallard-order').click();
  await expect(page.locator('html')).not.toHaveAttribute('data-material-active');
  await page.getByTestId('theme-picker-button').click();
  await page.getByTestId('theme-create').click();
  // ChainLens previews inside the editor; the app retains its saved art skin.
  await expect(page.locator('html')).not.toHaveAttribute('data-material-active');
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(page.locator('html')).not.toHaveAttribute('data-material-active');
  await page.getByTestId('theme-picker-button').click();
  await page.getByTestId('theme-option-crimson').click();
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-texture', 'fade');
  await expect(page.locator('html')).toHaveAttribute('data-surface-tone', 'matching');
  await expect(page.locator('html')).toHaveAttribute('data-material-active', '');
  for (const width of [360, 900, 1400]) {
    await page.setViewportSize({ width, height: 900 });
    await page.getByTestId('theme-picker-button').click();
    await page.getByTestId('texture-option-fade').scrollIntoViewIfNeeded();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `test-results/texture-picker-${width}-chainlens.png` });
    await page.getByTestId('texture-option-glass').click();
    await expect(page.locator('html')).not.toHaveAttribute('data-material-active');
    await expect(page.locator('.cl-sidebar')).toHaveCSS('backdrop-filter', 'blur(22px) saturate(1.55)');
    const matchingGlass = await page.locator('.cl-sidebar').evaluate(el => getComputedStyle(el).backgroundColor);
    expect(matchingGlass).toContain('0.22');
    await toneSwitch.click();
    expect(await page.locator('.cl-sidebar').evaluate(el => getComputedStyle(el).backgroundColor)).not.toBe(matchingGlass);
    await page.getByTestId('theme-picker-button').click();
    await page.screenshot({ path: `test-results/texture-glass-two-tone-${width}-chainlens.png` });
    await page.getByTestId('theme-picker-button').click();
    await toneSwitch.click();
    await page.getByTestId('texture-option-fade').click();
    await page.getByTestId('theme-picker-button').click();
  }
  await page.getByTestId('theme-picker-button').click();
  await page.getByTestId('texture-option-glass').click();
  await page.getByTestId('theme-option-white-gold').click();
  expect(await page.locator('.cl-search-hero').evaluate(hero => {
    const channels = color => color.match(/[\d.]+/g).map(Number);
    const rgb = color => { const c = channels(color); return { r:c[0], g:c[1], b:c[2] }; };
    const page = rgb(getComputedStyle(document.querySelector('.cl-art-app')).backgroundColor);
    return window.chainlensThemes.contrastRatio(rgb(getComputedStyle(hero.querySelector('h1')).color), page) >= 4.5;
  })).toBe(true);
  await page.screenshot({ path: 'test-results/texture-glass-light-chainlens.png' });
  expect(errors).toEqual([]);
});

test('saved textures follow the same account gate as palettes', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('cl_texture.v1', 'grain'));
  await installThemeMocks(page, { signedIn: false });
  await page.goto('/');
  await expect(page.getByTestId('theme-toggle')).toBeVisible();
  await expect(page.locator('html')).not.toHaveAttribute('data-material-active');
});


test('Liquid Glass refraction changes backdrop pixels while keeping foreground sharp', async ({page}) => {
  await installThemeMocks(page, {themes:ELIGIBLE});
  await page.goto('/');
  await page.getByTestId('theme-picker-button').click();
  await page.getByTestId('theme-option-liquid-glass').click();
  const hero = page.locator('.cl-search-hero');
  await expect(page.locator('html')).toHaveAttribute('data-cl-art-theme','liquid-glass');
  await page.evaluate(async () => {
    await document.fonts.ready;
    for (const a of document.getAnimations()) if (Number.isFinite(a.effect?.getComputedTiming().endTime)) { try { a.finish(); } catch {} }
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
  expect(await hero.evaluate(el => getComputedStyle(el).backdropFilter)).toContain('optics.svg');
  const lens = await hero.screenshot();
  await hero.evaluate(el => { el.style.setProperty('backdrop-filter','blur(10px) saturate(145%)','important'); });
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const plain = await hero.screenshot();
  expect(lens.equals(plain)).toBe(false);
  await hero.evaluate(el => { el.style.removeProperty('backdrop-filter'); });
});
