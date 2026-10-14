const {test,expect:baseExpect}=require('@playwright/test');const expect=baseExpect.configure({timeout:15000});test.setTimeout(60000);
const ID='3f2c6cb8-2a43-4b69-bf5e-099ef63be79f',ADDRESS='0x01faF6DFc230d755141D84d7cB980dd68f5Efe13';
async function fixture(page){
  const calls=[],errors=[];page.on('pageerror',e=>errors.push(e.message));
  page.on('console',message=>{if(message.type()==='error'&&message.text().includes('same key'))errors.push(message.text());});
  await page.route('https://chainlens-search.guildfordking.workers.dev/**',r=>r.fulfill({json:{results:[]}}));
  await page.route('https://art.example/**',r=>r.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80"><rect width="80" height="80" fill="#dd99dd"/></svg>'}));
  await page.route('**/api/**',r=>{
    const u=new URL(r.request().url());if(u.hostname.endsWith('workers.dev'))return r.fallback();const path=u.pathname;
    if(path==='/api/search/people'){calls.push(u);return r.fulfill({json:{people:[{id:ID,display_name:'Collector',avatar_url:'https://art.example/avatar.svg',avatar_nft_key:'ethereum:n:'+ADDRESS+':1',match:u.searchParams.has('address')?'public-wallet':'name'}],truncated:false}});}
    if(path.startsWith('/api/resolve/')){calls.push(u);return r.fulfill({json:{address:ADDRESS,domain:'collector.nad',chain:'monad',service:'Nad Name Service'}});}
    if(path==='/api/profiles/'+ID)return r.fulfill({json:{id:ID,display_name:'Collector',public_wallets:false,public_favorites:false,avatar_url:'https://art.example/avatar.svg',avatar_nft_key:'ethereum:n:'+ADDRESS+':1'}});
    if(path.endsWith('/favorites'))return r.fulfill({json:{assets:[],hidden:true,total:0}});
    if(path==='/api/search/assets'||path==='/api/search/transaction')calls.push(u);
    return r.fulfill({json:{}});
  });return{calls,errors};
}
test('workflow requests find matching tools and App Hub preserves the action filter',async({page})=>{
  const f=await fixture(page);await page.setViewportSize({width:1440,height:1000});await page.goto('/search?q='+encodeURIComponent('bridge Monad to Solana'));
  const card=page.getByTestId('action-search-results');await expect(card.getByRole('heading',{name:'Bridge tools'})).toBeVisible();await expect(card.getByRole('link').filter({hasText:'Relay'})).toBeVisible();await expect(card.getByRole('link').filter({hasText:'Thorchain'})).toHaveCount(0);
  await page.screenshot({path:'test-results/search-actions-desktop.png',fullPage:true});await card.getByRole('button',{name:'Explore in App Hub →'}).click();
  await expect(page.getByPlaceholder(/Search.*apps/i)).toHaveValue('bridge Monad to Solana');await expect(page.getByRole('heading',{name:'Relay',exact:true})).toBeVisible();expect(f.calls).toHaveLength(0);expect(f.errors).toEqual([]);
});
test('staking, lending and swap intents retain networks and avoid retired staking choices',async({page})=>{
  const f=await fixture(page);await page.setViewportSize({width:390,height:844});await page.goto('/search?q='+encodeURIComponent('stake SOL'));
  const card=page.getByTestId('action-search-results');await expect(card.getByRole('heading',{name:'Staking tools'})).toBeVisible();await expect(card.getByRole('link').filter({hasText:'Jito'})).toBeVisible();await expect(card.getByRole('link').filter({hasText:'Lido'})).toHaveCount(0);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:'test-results/search-staking-mobile.png',fullPage:true});
  for(const[q,heading]of[['lend USDC on Base','Lending tools'],['swap ADA to USDC on Cardano','Swap tools']]){await page.getByRole('search').getByRole('button',{name:'Search',exact:true}).waitFor({state:'visible'});await expect(page.getByRole('search').getByRole('button',{name:'Search',exact:true})).toBeEnabled();await page.locator('#chainlens-search').fill(q);await page.getByRole('search').getByRole('button',{name:'Search',exact:true}).click();await expect(card.getByRole('heading',{name:heading})).toBeVisible();await expect(card.getByRole('link').first()).toBeVisible();}
  expect(f.calls).toHaveLength(0);expect(f.errors).toEqual([]);
});
test('display name and resolved domain find public profiles with existing NFT avatars and deep links',async({page})=>{
  const f=await fixture(page);await page.goto('/search?q=Collector');const people=page.getByTestId('people-search-results');await expect(people.getByText('Collector',{exact:true})).toBeVisible();await expect(people.locator('[data-avatar-kind="nft"]')).toBeVisible();await expect(people.getByText('Display name match',{exact:true})).toBeVisible();
  await expect(people).toHaveCount(1);await expect(page.getByRole('heading',{name:'Public profiles',exact:true})).toHaveCount(1);await page.evaluate(()=>document.fonts.ready);await people.evaluate(el=>el.scrollIntoView({block:'center'}));await people.screenshot({path:'test-results/search-people-card.png',animations:'disabled'});await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:'test-results/search-people-desktop.png',fullPage:true,animations:'disabled'});await people.getByRole('button').click();await expect(page).toHaveURL(new RegExp(ID+'$'));await expect(page.getByRole('heading',{name:'Collector',exact:true})).toBeVisible();
  await page.goto('/search?q=collector.nad');await expect(people.getByText('Publicly linked wallet match',{exact:true})).toBeVisible();expect(f.calls.filter(u=>u.pathname==='/api/resolve/nad/collector.nad')).toHaveLength(1);const match=f.calls.find(u=>u.pathname==='/api/search/people'&&u.searchParams.has('address'));expect(match.searchParams.get('address')).toBe(ADDRESS);expect(f.errors).toEqual([]);
});
