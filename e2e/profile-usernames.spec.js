const {test,expect:baseExpect}=require('@playwright/test');const expect=baseExpect.configure({timeout:15000});test.setTimeout(90000);
const ID='ec18dcf5-3271-46fd-8029-41e5b2f39eed',OTHER='3f2c6cb8-2a43-4b69-bf5e-099ef63be79f';
async function fixture(page,{signedIn=true}={}){
  const errors=[],claims=[];let username=null;
  page.on('pageerror',e=>errors.push(e.message));
  if(signedIn)await page.addInitScript(t=>localStorage.setItem('cl_token',t),'test.'+Buffer.from(JSON.stringify({sub:ID})).toString('base64url')+'.test');
  const owner=()=>({id:ID,username,display_name:'Stylized Display Name',cl_wallets:[],cl_linked_accounts:[],public_wallets:false,public_favorites:false});
  await page.route('https://chainlens-search.guildfordking.workers.dev/**',r=>r.fulfill({json:{results:[]}}));
  await page.route('**/api/**',r=>{
    const u=new URL(r.request().url()),path=u.pathname;
    if(u.hostname.endsWith('workers.dev'))return r.fallback();
    if(path==='/api/profile')return r.fulfill({json:owner()});
    if(path==='/api/profile/username'){
      const value=r.request().postDataJSON().username.trim().replace(/^@/,'').toLowerCase();claims.push(value);
      if(value==='taken')return r.fulfill({status:409,json:{error:'That username is already claimed. Try another.'}});
      username=value;return r.fulfill({json:{id:ID,username}});
    }
    if(path==='/api/search/people')return r.fulfill({json:{people:[{...owner(),username:username||'collector',match:'username'}],truncated:false}});
    if(path==='/api/profiles/'+ID)return r.fulfill({json:owner()});
    if(path==='/api/profiles/'+OTHER)return r.fulfill({json:{id:OTHER,username:'friend_name',display_name:'Other Display Name',public_wallets:false,public_favorites:false}});
    if(path.endsWith('/favorites'))return r.fulfill({json:{assets:[],hidden:true,total:0}});
    return r.fulfill({json:{}});
  });return{errors,claims};
}
test('owner claims username above ID, conflict preserves identity, copy and changes survive reload',async({page,context})=>{
  const f=await fixture(page);await context.grantPermissions(['clipboard-read','clipboard-write']);await page.setViewportSize({width:1440,height:1000});await page.goto('/'+ID);
  const panel=page.getByRole('region',{name:'ChainLens username'});
  await expect(panel.getByRole('button',{name:'Claim username'})).toBeVisible();
  await panel.screenshot({path:'test-results/profile-username-claim-desktop.png'});
  await page.setViewportSize({width:390,height:844});await panel.screenshot({path:'test-results/profile-username-claim-mobile.png'});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.setViewportSize({width:1440,height:1000});
  expect((await panel.boundingBox()).y).toBeLessThan((await page.getByRole('button',{name:'Copy ChainLens ID',exact:true}).boundingBox()).y);
  await panel.getByLabel('Username',{exact:true}).fill('taken');await panel.getByRole('button',{name:'Claim username'}).click();await expect(panel.getByRole('alert')).toContainText('already claimed');
  await panel.getByLabel('Username',{exact:true}).fill('Collector_12');await panel.getByRole('button',{name:'Claim username'}).click();await expect(panel.getByText('@collector_12',{exact:true})).toBeVisible();
  await expect(page.getByText('Stylized Display Name',{exact:true})).toBeVisible();
  await panel.getByRole('button',{name:'Copy username'}).click();await expect.poll(()=>page.evaluate(()=>navigator.clipboard.readText())).toBe('@collector_12');
  expect((await panel.boundingBox()).width).toBeLessThan(400);
  expect((await panel.boundingBox()).height).toBeLessThan(45);
  const nameBox=await panel.getByText('@collector_12',{exact:true}).boundingBox(),copyBox=await panel.getByRole('button',{name:'Copy username'}).boundingBox();expect(copyBox.x-(nameBox.x+nameBox.width)).toBeLessThan(16);
  await page.screenshot({path:'test-results/profile-username-desktop.png',fullPage:true});
  await panel.getByRole('button',{name:'Edit',exact:true}).click();await panel.getByLabel('Username',{exact:true}).fill('collector_new');await panel.getByRole('button',{name:'Save username'}).click();await expect(panel.getByText('@collector_new',{exact:true})).toBeVisible();
  await page.reload();await expect(panel.getByText('@collector_new',{exact:true})).toBeVisible();
  await page.setViewportSize({width:390,height:844});await panel.screenshot({path:'test-results/profile-username-mobile.png'});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  expect(f.claims).toEqual(['taken','collector_12','collector_new']);expect(f.errors).toEqual([]);
});
test('public profiles and username search show display name, username and stable UUID',async({page,context})=>{
  const f=await fixture(page,{signedIn:false});await context.grantPermissions(['clipboard-read','clipboard-write']);await page.goto('/'+OTHER);
  const panel=page.getByRole('region',{name:'ChainLens username'});await expect(panel.getByText('@friend_name',{exact:true})).toBeVisible();await expect(panel.getByRole('button',{name:'Edit'})).toHaveCount(0);
  await panel.getByRole('button',{name:'Copy username'}).click();await expect.poll(()=>page.evaluate(()=>navigator.clipboard.readText())).toBe('@friend_name');await page.screenshot({path:'test-results/profile-public-username.png',fullPage:true});
  await page.goto('/search?q='+encodeURIComponent('@collector'));const result=page.getByTestId('people-search-results');await expect(result.getByText('@collector',{exact:true})).toBeVisible();await expect(result.getByText('Stylized Display Name',{exact:true})).toBeVisible();await expect(result.getByText(ID,{exact:true})).toBeVisible();await expect(result.getByText('Username match',{exact:true})).toBeVisible();
  await result.screenshot({path:'test-results/search-username.png'});await result.getByRole('button').click();await expect(page).toHaveURL(new RegExp(ID+'$'));expect(f.errors).toEqual([]);
});

test('usernames that match action words remain searchable with or without @',async({page})=>{
  await fixture(page,{signedIn:false});
  await page.route('**/api/search/people**',r=>r.fulfill({json:{people:[{id:ID,username:'swap',display_name:'Stylized Name',match:'username'}],truncated:false}}));
  await page.goto('/search?q='+encodeURIComponent('@swap'));const people=page.getByTestId('people-search-results');await expect(people.getByText('@swap',{exact:true})).toBeVisible();await expect(page.getByTestId('action-search-results')).toHaveCount(0);
  await expect(page.getByRole('search').getByRole('button',{name:'Search',exact:true})).toBeEnabled();await page.locator('#chainlens-search').fill('swap');await page.getByRole('search').getByRole('button',{name:'Search',exact:true}).click();await expect(people.getByText('@swap',{exact:true})).toBeVisible();await expect(page.getByTestId('action-search-results')).toBeVisible();
});
