const { test, expect } = require('@playwright/test');
const { EVM_CHAINS } = require('../public/chain-catalog');
const profileId = '00000000-0000-4000-8000-000000000001';
const token = 'fixture.' + Buffer.from(JSON.stringify({ sub: profileId })).toString('base64url') + '.fixture';
// Provider metadata varies: objects, scalar values and malformed array members.
const traitShapes = [{ category: 'PFP' }, 'not-an-array', 42, null, [null, 'bad', { trait_type: 'category', value: 'art' }], [{ trait_type: null, value: 'unknown' }]];
const art = i => `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="500" height="500"><rect width="500" height="500" fill="${['#a591ff','#66d6c3','#ffa8b2','#ffce68','#6daee5','#c9b2d5'][i%6]}"/><circle cx="250" cy="255" r="150" fill="#fff" opacity=".3"/><path d="m130 290 120-160 120 160-120 90z" fill="${i%2?'#182b49':'#fff'}" opacity=".8"/><circle cx="220" cy="247" r="12" fill="#13243b"/><circle cx="280" cy="247" r="12" fill="#13243b"/><path d="M226 275Q250 298 274 275" fill="none" stroke="#13243b" stroke-width="8" stroke-linecap="round"/></svg>`)}`;

test('profile preloads all linked wallets, retains mounted artwork, filters stars and saves a 3:1 banner', async ({ page }) => {
  test.setTimeout(90000);
  await page.setViewportSize({width:1920,height:1080});
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  const wallets = [
    { id: 'one', chain: 'evm', address: '0x1111111111111111111111111111111111111111', is_primary: true },
    { id: 'two', chain: 'evm', address: '0x2222222222222222222222222222222222222222', watch_only: true },
    { id: 'sol', chain: 'solana', address: 'fixtureSolanaAddress' },
    { id: 'ada', chain: 'cardano', address: 'addr1fixture' },
  ];
  let profile = { id: profileId, display_name: 'criptoejesus', cl_wallets: wallets, cl_linked_accounts: [{ provider: 'google', username: 'criptoejesus' }], avatar_url: art(1), banner_url: null };
  let entries = {}, bannerWrites = 0;
  const requests = [];
  await page.addInitScript(t => { localStorage.setItem('cl_token',t); localStorage.setItem('darkMode','true'); },token);
  await page.route('**/api/**', async route => {
    const url = new URL(route.request().url()), body = route.request().postDataJSON();
    if (url.pathname === '/api/profile') {
      if (route.request().method() === 'PATCH') { profile = { ...profile, ...body }; if (body.banner_url !== undefined) bannerWrites++; }
      return route.fulfill({ json: profile });
    }
    if (url.pathname === '/api/profile/filters') { if (body?.entries) entries = { ...entries, ...body.entries }; return route.fulfill({ json: { entries } }); }
    if (url.pathname.startsWith('/api/nfts/')) {
      requests.push(url.pathname);
      const chain = url.pathname.split('/')[3];
      const nfts = chain === 'base' ? Array.from({length:18}, (_,offset) => { const i = offset + (url.searchParams.has('pageKey') ? 18 : 0); return { chain, contractAddress: `0xcollection${i < 16 ? Math.floor(i/4) : i}`, tokenId: String(i), name: `Gallery NFT #${i}`, collectionName: ['Dreamers','Chromatic Club','Soft Shapes','Orbit Friends'][Math.floor(i/4)] || `Edition ${i}`, image: art(i), floorPriceUsd: i < 16 ? [5,500,50,100][Math.floor(i/4)] : i === 16 ? 0 : null, category: i%4 === 0 ? 'pfp' : i%4 === 1 ? 'art' : i%4 === 2 ? 'gaming' : 'music' }; }) : ['solana','cardano'].includes(chain) ? [{chain,contractAddress:'policy', tokenId:'mint'+chain, name:chain+' collectible',collectionName:'Cross-chain editions',image:art(4),floorPriceUsd:chain === 'solana' ? 200 : null}] : [];
      nfts.forEach((nft, i) => { nft.metadata = { traits: traitShapes[i % traitShapes.length] }; });
      return route.fulfill({json:{nfts,nextPageKey:chain === 'base' && !url.searchParams.has('pageKey') ? 'next-page' : null}});
    }
    if (url.pathname.includes('/passkey/available')) return route.fulfill({json:{available:true}});
    return route.fulfill({ json: { entries:{},passkeys:[], coins:[], nfts:[], transactions:[] } });
  });
  await page.goto('/?tab=profile');
  const nav = page.getByRole('navigation', { name: 'Main navigation' });
  await nav.getByRole('button', { name: 'Profile', exact:true }).click();
  await expect(page.locator('.profile-summary b')).toHaveText('38');
  for (const wallet of wallets.slice(0,2)) for (const chain of EVM_CHAINS) expect(requests).toContain(`/api/nfts/${chain.id}/${wallet.address}`);
  expect(requests).toContain('/api/nfts/solana/fixtureSolanaAddress');
  expect(requests).toContain('/api/nfts/cardano/addr1fixture');
  await expect(page.locator('.profile-tile-caption strong').first()).toHaveText('Chromatic Club');
  await expect(page.locator('.profile-tile-caption strong').nth(1)).toHaveText('Cross-chain editions');
  await expect(page.locator('.profile-tile-caption strong').nth(2)).toHaveText('Orbit Friends');
  await expect(page.locator('.profile-tile-caption').first()).toContainText('Floor $500.00');
  await expect(page.locator('.profile-tile-caption').last()).toContainText('Floor unavailable');
  await page.screenshot({path:'test-results/profile-portfolio-desktop.png'});
  await page.getByText('Linked wallets · 4', {exact:true}).click();
  await expect(page.getByRole('heading',{name:'Linked Wallets',exact:true})).toBeVisible();
  await page.getByText('Social accounts & passkeys',{exact:true}).click();
  await expect(page.getByRole('heading',{name:'Passkeys',exact:true})).toBeVisible();
  await page.screenshot({path:'test-results/profile-portfolio-account.png'});
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByText('Linked wallets · 4', {exact:true}).click();
  await page.getByText('Social accounts & passkeys',{exact:true}).click();
  const img = page.locator('.profile-art img').first();
  await img.evaluate(el => el.dataset.retained = 'yes');
  const count = requests.length;
  await nav.getByRole('button',{name:'Market',exact:true}).click();
  await nav.getByRole('button',{name:'Profile',exact:true}).click();
  await expect(img).toHaveAttribute('data-retained','yes'); expect(requests.length).toBe(count);
  await page.getByRole('button',{name:'Favorite Gallery NFT #0',exact:true}).click();
  await page.getByRole('button',{name:'Favorites',exact:true}).click();
  await expect(page.locator('.profile-tile')).toHaveCount(1);
  await page.getByRole('button',{name:'Holdings',exact:true}).click();
  await expect(page.locator('.profile-tile')).toHaveCount(38);
  await expect(page.locator('.profile-tile-caption strong').first()).toHaveText('Gallery NFT #0');
  await expect(page.locator('.profile-tile-caption strong').nth(1)).toHaveText('Gallery NFT #4');
  await expect(page.locator('.profile-tile-caption').last()).toContainText('Floor unavailable');
  await page.getByRole('button',{name:'View Gallery NFT #0',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Attributes',exact:true})).toBeVisible();
  await expect(page.getByText('PFP',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Back to Gallery',exact:true}).click();
  await page.getByRole('button',{name:'View Gallery NFT #1',exact:true}).click();
  await expect(page.getByText('No metadata found.',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Back to Gallery',exact:true}).click();
  await page.getByLabel('Filter profile chain').selectOption('solana');
  await expect(page.locator('.profile-tile')).toHaveCount(1);
  await page.getByLabel('Filter profile chain').selectOption('all');
  await page.getByRole('button',{name:'Overview',exact:true}).click();
  const png = await page.evaluate(() => { const c = document.createElement('canvas');c.width=600;c.height=600; const ctx=c.getContext('2d');ctx.fillStyle='#294563';ctx.fillRect(0,0,600,600);ctx.fillStyle='#43c8c2';ctx.fillRect(0,200,600,200);return c.toDataURL().split(',')[1]; });
  await page.getByLabel('Upload profile banner').setInputFiles({name:'banner.png',mimeType:'image/png',buffer:Buffer.from(png,'base64')});
  await expect(page.getByRole('img',{name:'Profile banner',exact:true})).toBeVisible(); expect(bannerWrites).toBe(1);
  const dimensions = await page.getByRole('img',{name:'Profile banner',exact:true}).evaluate(el => [el.naturalWidth,el.naturalHeight]); expect(dimensions).toEqual([1500,500]);
  await page.screenshot({path:'test-results/profile-portfolio-banner.png',fullPage:true});
  await page.setViewportSize({width:390,height:844});
  await expect.poll(() => page.locator('.cl-sidebar').evaluate(el => el.getBoundingClientRect().right)).toBeLessThanOrEqual(0);
  await page.screenshot({path:'test-results/profile-portfolio-mobile.png'});
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.setViewportSize({width:1440,height:1000});
  await page.getByRole('button',{name:'Sign Out',exact:true}).click();
  await expect(page.locator('.profile-art')).toHaveCount(0);
  expect(errors).toEqual([]);
});
