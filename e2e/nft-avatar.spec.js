const {test,expect:baseExpect}=require('@playwright/test');
const expect=baseExpect.configure({timeout:15000});test.setTimeout(90000);
const ID='ec18dcf5-3271-46fd-8029-41e5b2f39eed',contract='0x1111111111111111111111111111111111111111';
async function fixture(page){
  let reads=0;const patches=[];
  const profile={id:ID,display_name:'NFT Collector',avatar_url:null,avatar_nft_key:null,cl_wallets:[{chain:'evm',address:contract}],cl_linked_accounts:[]};
  const items=Array.from({length:40},(_,i)=>({chain:'ethereum',contractAddress:contract,tokenId:String(i),name:i===0?'Scam Voucher':`Seal #${i}`,image:`https://art.example/${i}.svg`,collectionName:'Seals'}));
  const entries={['ethereum:n:'+contract+':1']:{s:'s',t:1},['ethereum:n:'+contract+':2']:{s:'h',t:1},['ethereum:n:'+contract+':3']:{s:'a',t:1}};
  items[3].name='Restored Voucher';
  await page.addInitScript(t=>localStorage.setItem('cl_token',t),'test.'+Buffer.from(JSON.stringify({sub:ID})).toString('base64url')+'.test');
  await page.route('https://art.example/**',route=>route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><rect width="200" height="200" fill="#d8a4de"/><circle cx="100" cy="100" r="60" fill="#c0f0ee"/></svg>'}));
  await page.route('**/api/**',route=>{
    const req=route.request(),path=new URL(req.url()).pathname;
    let body={};
    if(path==='/api/profile'){if(req.method()==='PATCH'){patches.push(req.postDataJSON());Object.assign(profile,req.postDataJSON());}body=profile;}
    else if(path==='/api/profiles/'+ID)body=profile;
    else if(path==='/api/profile/filters')body={entries};
    else if(path.startsWith('/api/nfts/')){reads++;body={nfts:path.includes('/ethereum/')?items:[],nextPageKey:null};}
    else if(path==='/api/chat/status')body={eligible:false};
    else if(path==='/api/profile/themes')body={entries:{}};
    else if(path.includes('/favorites'))body={assets:[],hidden:true};
    return route.fulfill({json:body});
  });
  return {profile,patches,get reads(){return reads;}};
}
test('NFT picker reuses cached collection, respects spam and scrolls past 24; NFT detail and upload persist distinct shapes',async({page})=>{
  const f=await fixture(page);await page.setViewportSize({width:1440,height:1000});await page.goto('/'+ID);
  await expect(page.locator('.profile-summary b')).toHaveText('40');await expect.poll(()=>f.reads).toBe(await page.evaluate(()=>window.ChainLensChains.EVM_CHAINS.length));const reads=f.reads;
  await page.getByRole('button',{name:'Change profile picture',exact:true}).click();const modal=page.getByRole('dialog',{name:'Change Profile Picture'});
  await expect(modal.locator('.cl-avatar-editor-grid button')).toHaveCount(37);
  for(const name of ['Scam Voucher','Seal #1','Seal #2'])await expect(modal.getByRole('button',{name:`Use ${name} as profile picture`,exact:true})).toHaveCount(0);
  await expect(modal.getByRole('button',{name:'Use Restored Voucher as profile picture'})).toBeVisible();
  expect(await modal.locator('.cl-avatar-editor-body').evaluate(el=>el.scrollHeight>el.clientHeight)).toBe(true);
  await modal.getByRole('button',{name:'Use Seal #39 as profile picture'}).click();await expect(modal.locator('[data-avatar-kind="nft"]')).toBeVisible();
  expect(f.reads).toBe(reads);await page.screenshot({path:'test-results/nft-avatar-picker-desktop.png'});
  await modal.getByRole('button',{name:'Save Photo',exact:true}).click();await expect(modal).toBeHidden();
  expect(f.patches[0].avatar_nft_key).toBe('ethereum:n:'+contract+':39');await expect(page.locator('.profile-banner-avatar [data-avatar-kind="nft"]')).toBeVisible();
  const avatar=page.locator('.profile-banner-avatar .cl-avatar');await expect(avatar).toHaveCSS('clip-path',/polygon/);await expect.poll(()=>avatar.evaluate(el=>getComputedStyle(el,'::before').animationName)).toBe('cl-avatar-flow');
  await page.screenshot({path:'test-results/nft-avatar-owner-hexagon.png'});
  await page.emulateMedia({reducedMotion:'reduce'});await expect.poll(()=>avatar.evaluate(el=>getComputedStyle(el,'::before').animationName)).toBe('none');
  await page.getByRole('button',{name:'Change profile picture',exact:true}).click();await modal.getByRole('button',{name:'Upload Photo',exact:true}).click();
  await modal.locator('input[type=file]').setInputFiles({name:'photo.png',mimeType:'image/png',buffer:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2eL8AAAAASUVORK5CYII=','base64')});
  await modal.getByRole('button',{name:'Save Photo',exact:true}).click();await expect(page.locator('.profile-banner-avatar [data-avatar-kind="photo"]')).toBeVisible();expect(f.patches[1].avatar_nft_key).toBe(null);
  await page.getByRole('button',{name:'View Seal #4',exact:true}).first().click();const detail=page.getByRole('dialog',{name:'Seal #4'});await detail.getByRole('button',{name:'Use as profile picture',exact:true}).click();await expect(modal).toBeVisible();await expect(modal.locator('[data-avatar-kind="nft"]')).toBeVisible();await page.keyboard.press('Escape');await expect(modal).toBeHidden();
});
test('NFT avatar picker fits mobile with fixed footer and scrollable contents',async({page})=>{
  await fixture(page);await page.setViewportSize({width:390,height:844});await page.goto('/'+ID);await expect(page.locator('.profile-summary b')).toHaveText('40');await page.getByRole('button',{name:'Change profile picture',exact:true}).click();
  const modal=page.getByRole('dialog',{name:'Change Profile Picture'});const box=await modal.boundingBox();expect(box.x).toBeGreaterThanOrEqual(0);expect(box.y+box.height).toBeLessThanOrEqual(844);
  await modal.getByRole('button',{name:'Use Seal #39 as profile picture'}).click();await expect(modal.getByRole('button',{name:'Save Photo'})).toBeInViewport();await modal.locator('.cl-avatar-editor-body').evaluate(el=>el.scrollTop=0);await page.screenshot({path:'test-results/nft-avatar-picker-mobile.png'});
});
test('public NFT profiles have a moving hexagon while uploaded photos stay circular',async({page})=>{
  const f=await fixture(page);f.profile.avatar_url='https://art.example/39.svg';f.profile.avatar_nft_key='ethereum:n:'+contract+':39';
  await page.addInitScript(()=>localStorage.removeItem('cl_token'));await page.goto('/'+ID);
  const avatar=page.getByRole('region',{name:'Public profile',exact:true}).locator('.cl-avatar');await expect(avatar).toHaveAttribute('data-avatar-kind','nft');
  const before=await avatar.evaluate(el=>getComputedStyle(el,'::before').transform);await expect.poll(()=>avatar.evaluate(el=>getComputedStyle(el,'::before').transform)).not.toBe(before);await page.screenshot({path:'test-results/nft-avatar-public-hexagon.png'});
  f.profile.avatar_nft_key=null;await page.reload();await expect(avatar).toHaveAttribute('data-avatar-kind','photo');await expect(avatar).toHaveCSS('border-radius','50%');
});
