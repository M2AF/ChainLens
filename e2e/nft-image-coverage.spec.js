const {test,expect}=require('@playwright/test');
const id='00000000-0000-4000-8000-000000000001';
const art='data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80"><rect width="80" height="80" fill="cyan"/></svg>');
test('visible stalled images fall back with bounded work and deferred repairs do not rescan owners',async({page})=>{
 test.setTimeout(90000);await page.setViewportSize({width:1600,height:1100});
 await page.addInitScript(token=>localStorage.setItem('cl_token',token),'fixture.'+Buffer.from(JSON.stringify({sub:id})).toString('base64url')+'.fixture');
 let ownerReads=0,stalls=0;
 await page.route('**/stall-*.png',async()=>{stalls++;await new Promise(()=>{});});
 await page.route('**/api/**',route=>{
  const path=new URL(route.request().url()).pathname;
  if(path==='/api/profile')return route.fulfill({json:{id,display_name:'Coverage test',cl_wallets:[{chain:'cardano',address:'addr1fixture'}],cl_linked_accounts:[]}});
  if(path.startsWith('/api/nfts/')){ownerReads++;return route.fulfill({json:{nfts:Array.from({length:8},(_,i)=>({id:String(i),chain:'cardano',name:'Coverage #'+i,image:art,thumbnailUrl:'/stall-'+i+'.png'})),nextPageKey:null}});}
  return route.fulfill({json:{entries:{},available:true,passkeys:[],coins:[]}});
 });
 await page.goto('/?tab=profile');await expect(page.locator('.profile-art img')).toHaveCount(8);
 await expect.poll(()=>stalls).toBe(6);
 await expect(page.locator('.profile-art img').first()).toHaveAttribute('data-art-status','loaded',{timeout:18000});
 await expect(page.locator('.profile-art img').first()).toHaveAttribute('src',art);
 await page.getByRole('button',{name:'View Coverage #0',exact:true}).click();
 await expect(page.getByRole('button',{name:'Retry artwork',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Retry artwork',exact:true}).click();
 await expect(page.locator('img[alt="Coverage #0"].w-full')).toHaveAttribute('src',art);
 expect(ownerReads).toBe(1);
 await page.screenshot({path:'test-results/nft-image-retry-detail.png'});
});

test('failed token artwork triggers a token-only metadata retry, without rescanning owners',async({page})=>{
 await page.addInitScript(token=>localStorage.setItem('cl_token',token),'fixture.'+Buffer.from(JSON.stringify({sub:id})).toString('base64url')+'.fixture');
 let ownerReads=0,repairs=0;
 await page.route('**/broken.png',route=>route.fulfill({status:404,body:''}));
 await page.route('**/api/**',route=>{
  const path=new URL(route.request().url()).pathname;
  if(path==='/api/profile')return route.fulfill({json:{id,display_name:'Repair test',cl_wallets:[{chain:'cardano',address:'addr1fixture'}],cl_linked_accounts:[]}});
  if(path.startsWith('/api/nfts/')){ownerReads++;return route.fulfill({json:{nfts:[{id:'token-one',chain:'ethereum',contractAddress:'0x'+'1'.repeat(40),tokenId:'1',name:'Repair #1',image:'/broken.png'}],nextPageKey:null}});}
  if(path.startsWith('/api/nft-art/')){repairs++;expect(route.request().method()).toBe('POST');return route.fulfill({json:{pending:false,artwork:{image:art,imageSources:[art],thumbnailUrl:''}}});}
  return route.fulfill({json:{entries:{},available:true,passkeys:[],coins:[]}});
 });
 await page.goto('/?tab=profile');
 await expect(page.locator('.profile-art img')).toHaveAttribute('src',art);
 await expect(page.locator('.profile-art img')).toHaveAttribute('data-art-status','loaded');
 expect(ownerReads).toBe(1);expect(repairs).toBe(1);
});
