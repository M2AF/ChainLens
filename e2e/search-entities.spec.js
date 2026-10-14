const { test, expect: baseExpect } = require('@playwright/test');
const expect=baseExpect.configure({timeout:15000}); test.setTimeout(60000);
const HASH='0x'+'a'.repeat(64), ADDRESS='0x'+'1'.repeat(40), POLICY='a'.repeat(56);
async function fixture(page) {
  const calls=[],errors=[]; page.on('pageerror',e=>errors.push(e.message));
  await page.route('https://chainlens-search.guildfordking.workers.dev/**',r=>r.fulfill({json:{results:[]}}));
  await page.route('**/api/**',r=>{
    const u=new URL(r.request().url()); if(u.hostname.endsWith('workers.dev'))return r.fallback();
    if(u.pathname==='/api/search/assets') {
      calls.push(u.pathname+u.search);
      const kind=u.searchParams.get('kind'),chain=u.searchParams.get('chain')||'monad';
      if(u.searchParams.get('q')==='missing')return r.fulfill({status:503,json:{error:'Fixture metadata unavailable'}});
      return r.fulfill({json:{assets:[{key:chain+':'+ADDRESS,kind:kind==='collection'?'collection':'token',chain,name:'Example asset',symbol:'EX',address:chain==='cardano'?POLICY:ADDRESS,source:'Fixture provider'}],partial:false}});
    }
    if(u.pathname==='/api/search/transaction') {
      calls.push(u.pathname+u.search);
      return r.fulfill({json:{kind:'transaction',chain:u.searchParams.get('chain'),hash:HASH,state:'successful',value:'1.0',symbol:'ETH',fee:'0.001',block:'42',source:'Public RPC',from:ADDRESS,transfers:[{type:'Token',contract:ADDRESS,from:ADDRESS,to:ADDRESS,amountRaw:'1000'}]}});
    }
    return r.fulfill({json:{}});
  });
  return{calls,errors};
}
test('token-name search qualifies identity, copies it and uses safe explorer links',async({page,context})=>{
  const f=await fixture(page);await context.grantPermissions(['clipboard-read','clipboard-write']);await page.setViewportSize({width:1440,height:1000});
  await page.goto('/search?q='+encodeURIComponent('token EX on Monad'));
  const card=page.locator('[data-result-kind=token]');await expect(card.getByText('Example asset (EX)',{exact:true})).toBeVisible();
  await expect(card.getByText('monad · token',{exact:true})).toBeVisible();
  await card.getByRole('button',{name:'Copy Example asset identity'}).click();await expect.poll(()=>page.evaluate(()=>navigator.clipboard.readText())).toBe(ADDRESS);
  await expect(card.getByRole('link',{name:'Inspect on explorer ↗'})).toHaveAttribute('href','https://monadscan.com/address/'+ADDRESS);
  await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:'test-results/search-assets-desktop.png',fullPage:true});expect(f.calls.length).toBe(2);expect(f.errors).toEqual([]);
  await page.route('**/api/search/assets**',r=>r.fulfill({json:{assets:[{kind:'token',chain:'cardano',key:'cardano:native',address:null,name:'Cardano',symbol:'ADA',isNative:true,source:'ChainLens network catalog'}],partial:false}}));
  await page.goto('/search?q='+encodeURIComponent('token ADA on Cardano'));await expect(card.getByText('Native asset · no contract address',{exact:true})).toBeVisible();await expect(card.getByRole('button',{name:'Copy Cardano identity'})).toHaveCount(0);
});
test('ambiguous hash requires network; receipt status and transfers fit mobile',async({page,context})=>{
  const f=await fixture(page);await context.grantPermissions(['clipboard-read','clipboard-write']);await page.setViewportSize({width:390,height:844});await page.goto('/search?q='+HASH);
  const card=page.getByTestId('entity-search-results');await expect(card.getByText(/Choose a network/)).toBeVisible();expect(f.calls).toHaveLength(0);
  await card.getByLabel('Search network').selectOption('base');await expect(card.getByText('base · Included successfully',{exact:true})).toBeVisible();
  await card.getByText('Transfer / output summary · 1',{exact:true}).click();await expect(card.getByText(/Quantity: 1000/)).toBeVisible();
  await card.getByRole('button',{name:'Copy transaction hash'}).click();await expect.poll(()=>page.evaluate(()=>navigator.clipboard.readText())).toBe(HASH);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:'test-results/search-transaction-mobile.png',fullPage:true});expect(f.errors).toEqual([]);
});
test('collection intent selects correct category; provider errors retain retry',async({page})=>{
  const f=await fixture(page);await page.goto('/search?q='+encodeURIComponent('collection Sappy Seals'));
  const card=page.locator('[data-result-kind=collection]');await expect(page.getByLabel('Result type')).toHaveCount(0);await expect(card.getByText('Example asset (EX)',{exact:true})).toBeVisible();
  await expect(page.getByRole('search').getByRole('button',{name:'Search',exact:true})).toBeEnabled();await page.locator('#chainlens-search').fill('token missing on Base');await page.getByRole('search').getByRole('button',{name:'Search',exact:true}).click();
  await expect(card.getByText('Fixture metadata unavailable',{exact:true})).toBeVisible();const count=f.calls.length;await card.getByRole('button',{name:'Retry lookup'}).click();await expect.poll(()=>f.calls.length).toBe(count+1);expect(f.errors).toEqual([]);
});
test('collection names reuse loaded NFT data during metadata outages and exclude spam',async({page})=>{
  const f=await fixture(page),ID='ec18dcf5-3271-46fd-8029-41e5b2f39eed';
  await page.addInitScript(t=>localStorage.setItem('cl_token',t),'test.'+Buffer.from(JSON.stringify({sub:ID})).toString('base64url')+'.test');
  const cached={chain:'ethereum',contractAddress:ADDRESS,tokenId:'1',name:'Seal #1',collectionName:'Cached Seals',image:'',isToken:false};
  await page.route('**/api/profile',r=>r.fulfill({json:{id:ID,display_name:'Owner',cl_wallets:[{chain:'evm',address:ADDRESS}],cl_linked_accounts:[]}}));
  const spamAddress='0x'+'3'.repeat(40);
  await page.route('**/api/profile/filters',r=>r.fulfill({json:{entries:{['ethereum:n:'+spamAddress+':2']:{s:'s',t:1}}}}));
  await page.route('**/api/nfts/**',r=>r.fulfill({json:{nfts:new URL(r.request().url()).pathname.includes('/ethereum/')?[cached,{...cached,contractAddress:spamAddress,tokenId:'2',collectionName:'Cached Seals spam'}]:[]}}));
  await page.route('**/api/search/assets**',r=>r.fulfill({status:503,json:{error:'Fixture metadata unavailable'}}));
  await page.goto('/search?q='+encodeURIComponent('collection Cached Seals'));const card=page.locator('[data-result-kind=collection]');
  await expect(card.getByText('Cached Seals',{exact:true})).toBeVisible();await expect(card.getByText('Your loaded collections',{exact:true})).toBeVisible();await expect(card.getByText('Cached Seals spam',{exact:true})).toHaveCount(0);await expect(card.getByText('Fixture metadata unavailable',{exact:true})).toBeVisible();expect(f.errors).toEqual([]);
});

test('plain asset searches automatically show separate token and collection sections with network controls',async({page})=>{
  const f=await fixture(page);
  for(const width of [1440,390]) {
    await page.setViewportSize({width,height:1000});
    await page.goto('/search?q='+encodeURIComponent('emonad on monad blockchain'));
    const tokens=page.locator('[data-result-kind=token]'),collections=page.locator('[data-result-kind=collection]');
    await expect(tokens.getByText('Example asset (EX)',{exact:true})).toBeVisible();
    await expect(collections.getByText('Example asset (EX)',{exact:true})).toBeVisible();
    await expect(tokens.getByLabel('Search network')).toHaveValue('monad');
    await expect(collections.getByLabel('Search network')).toHaveValue('monad');
    await expect(page.getByLabel('Result type')).toHaveCount(0);
    expect(f.calls.filter(c=>c.includes('q=emonad')&&c.includes('chain=monad')).length).toBeGreaterThanOrEqual(2);
    await tokens.getByLabel('Search network').selectOption('base');
    await expect(tokens.getByText('base · token',{exact:true})).toBeVisible();
    await expect(collections.getByLabel('Search network')).toHaveValue('monad');
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    await page.evaluate(()=>scrollTo(0,0));
    await page.screenshot({path:`test-results/search-separate-${width}.png`,fullPage:true});
  }
  expect(f.errors).toEqual([]);
});
