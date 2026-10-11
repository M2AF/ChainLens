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


for (const id of ['brushed-metal','leather','velvet','walnut','royal-silk']) {
  SYNCED[`custom-builtin-${id}`] = {n:'Bad recolour',c:{bg:'#ffffff',accent:'#ff0000',text:'#000000'},t:1755000002000};
}
test('natural materials have fixed palettes and retain stock responsive geometry', async ({page}) => {
  test.setTimeout(120_000);
  const errors=[]; page.on('pageerror',e=>errors.push(e.message));
  await installThemeMocks(page,{themes:ELIGIBLE});
  await page.route('**/api/dex/**',route=>route.fulfill({json:{tokens:[],error:null}}));
  await page.goto('/');
  const settle=()=>page.evaluate(async()=>{
    await document.fonts.ready;
    for(const a of document.getAnimations()) if(Number.isFinite(a.effect?.getComputedTiming().endTime)) {try {a.finish();}catch{}}
  });
  for(const id of ['brushed-metal','leather','velvet','walnut','royal-silk']) {
    await page.getByTestId('theme-picker-button').click();
    await expect(page.getByTestId(`theme-edit-${id}`)).toHaveCount(0);
    await page.getByTestId(`theme-option-${id}`).click();
    await expect(page.locator('html')).toHaveAttribute('data-cl-art-theme',id);
    await expect(page.locator('html')).not.toHaveAttribute('data-surface-active');
    expect(await page.locator('html').evaluate((el,id)=>el.style.getPropertyValue('--cl-page')===window.chainlensThemes.paletteFor(window.chainlensThemes.builtinById(id).colors).vars['--cl-page'],id)).toBe(true);
    await expect(page.locator('.cl-search-hero')).toHaveCSS('background-image',new RegExp(id));
    await expect(page.locator('.cl-search-hero')).toHaveCSS('border-radius','20px');
    for(const width of [360,1400]) {
      await page.setViewportSize({width,height:900}); await settle();
      expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
      await page.screenshot({path:`test-results/material-${id}-chainlens-${width}.png`});
    }
    await page.locator('.cl-sidebar').getByRole('button',{name:'Scanner',exact:true}).click();
    await expect(page.locator('.glass-card').filter({visible:true}).first()).toHaveCSS('background-image',new RegExp(id));
    await page.setViewportSize({width:360,height:900}); await settle();
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    await page.screenshot({path:`test-results/material-${id}-scanner-360.png`});
    await page.setViewportSize({width:1400,height:900});
    await page.locator('.cl-sidebar').getByRole('button',{name:'Magic Swap',exact:true}).click();
    await expect(page.locator('.dex-swap .panel').first()).toHaveCSS('background-image',new RegExp(id));
    for(const width of [1400,360]) {
      await page.setViewportSize({width,height:900}); await settle();
      expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
      await page.screenshot({path:`test-results/material-${id}-swap-${width}.png`});
    }
    await page.setViewportSize({width:1400,height:900});
    await page.locator('.cl-sidebar').getByRole('button',{name:'Search',exact:true}).click();
  }
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-cl-art-theme','royal-silk');
  await page.getByTestId('theme-picker-button').click();
  await page.getByTestId('texture-option-fade').click();
  await expect(page.locator('html')).not.toHaveAttribute('data-material-active');
  await page.getByTestId('theme-option-grape').click();
  await expect(page.locator('html')).not.toHaveAttribute('data-cl-art-theme');
  await expect(page.locator('html')).toHaveAttribute('data-material-active','');
  await expect(page.locator('.cl-art-app')).not.toHaveCSS('background-image',/materials/);
  expect(errors).toEqual([]);
});
test('saved natural material does not bypass the theme account gate',async({page})=>{
  await page.addInitScript(()=>localStorage.setItem('cl_theme','royal-silk'));
  await installThemeMocks(page,{signedIn:false}); await page.goto('/');
  await expect(page.getByTestId('theme-toggle')).toBeVisible();
  await expect(page.locator('html')).not.toHaveAttribute('data-cl-art-theme');
});
