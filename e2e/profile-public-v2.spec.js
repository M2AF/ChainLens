const {test,expect:baseExpect}=require('@playwright/test');const expect=baseExpect.configure({timeout:15000});test.setTimeout(60000);
const ME='ec18dcf5-3271-46fd-8029-41e5b2f39eed',OTHER='3f2c6cb8-2a43-4b69-bf5e-099ef63be79f';
const KEY='ethereum:n:0x1111111111111111111111111111111111111111:7';
const NFT={key:KEY,id:'ethereum-0x1111111111111111111111111111111111111111-7',chain:'ethereum',contractAddress:'0x1111111111111111111111111111111111111111',tokenId:'7',name:'Favorite Seal',collection:'Seals',image:'https://images.example/seal.svg',isToken:false};
async function fixture(page,{signedIn=true}={}){
  const me={id:ME,display_name:'criptoejesus',avatar_url:null,cl_wallets:[],cl_linked_accounts:[],public_favorites:true,public_wallets:true};
  let starred=true,friend=false,blocked=false,pending=false,reports=[];const patches=[],snapshots=[];
  const ok=(route,body,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(body)});
  if(signedIn)await page.addInitScript(token=>localStorage.setItem('cl_token',token),'test.'+Buffer.from(JSON.stringify({sub:ME})).toString('base64url')+'.test');
  await page.route('https://images.example/**',route=>route.fulfill({contentType:'image/svg+xml',headers:{'access-control-allow-origin':'*'},body:'<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400"><rect width="400" height="400" fill="#a6c8dd"/><ellipse cx="200" cy="225" rx="130" ry="90" fill="#e9eef2"/><circle cx="165" cy="210" r="10"/><circle cx="235" cy="210" r="10"/><path d="M185 240 Q200 260 215 240" fill="none" stroke="#222" stroke-width="8"/></svg>'}));
  await page.route('https://media.giphy.com/**',route=>route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="200" height="180"><rect width="200" height="180" fill="#1e6077"/><text x="80" y="95" font-size="40" fill="white">★</text></svg>'}));
  await page.route('https://api.giphy.com/**',route=>ok(route,{data:Array.from({length:12},(_,i)=>({id:String(i),title:'Reaction '+i,images:{fixed_width:{url:`https://media.giphy.com/media/${i}/giphy.gif`,webp:`https://media.giphy.com/media/${i}/giphy.webp`}}}))}));
  await page.route('**/api/**',async route=>{
    const req=route.request(),url=new URL(req.url()),path=url.pathname;
    if(path==='/api/profile'){
      if(req.method()==='PATCH'){const patch=req.postDataJSON();Object.assign(me,patch);patches.push(patch);}return ok(route,me);
    }
    if(path==='/api/profile/themes')return ok(route,{eligible:true,entries:{}});
    if(path==='/api/profile/favorite-artwork'){snapshots.push(req.postDataJSON());return ok(route,{saved:req.postDataJSON().assets.length});}
    if(path==='/api/profile/filters')return ok(route,{entries:{['favorite:mainnet:'+KEY]:{s:starred?'f':'u',t:100}}});
    if(path==='/api/profiles/'+OTHER+'/favorites')return ok(route,{assets:starred?[NFT]:[],total:starred?1:0,hidden:false,nextOffset:null});
    if(path==='/api/profiles/'+OTHER+'/relationship')return ok(route,{blocked,interactionAllowed:!blocked,friendship:friend?{friendship_id:12,status:'accepted'}:pending?{friendship_id:12,status:'pending',incoming:false}:null});
    if(path==='/api/profiles/'+OTHER+'/block'){blocked=req.method()==='POST';return ok(route,{blocked});}
    if(path==='/api/profiles/'+OTHER+'/report'){reports.push(req.postDataJSON());return ok(route,{success:true},201);}
    if(path==='/api/profiles/'+OTHER)return ok(route,{id:OTHER,display_name:'Chain Friend',avatar_url:'https://images.example/avatar.svg',banner_url:null,public_wallets:true,public_favorites:true,wallets:[{chain:'evm',address:'0x1111111111111111111111111111111111111111',label:'Main Wallet'}]});
    if(path==='/api/profiles/'+ME)return ok(route,me);
    if(path==='/api/chat/status')return ok(route,{eligible:true,walletLinked:true,socialLinked:true,giphyApiKey:'test'});
    if(path==='/api/chat/presence')return ok(route,{success:true,people:[]});
    if(path==='/api/chat/unread')return ok(route,{conversations:[],pending_requests:0,unread_direct:0});
    if(path==='/api/chat/read')return ok(route,{success:true});
    if(path==='/api/chat/friends'){
      if(req.method()==='POST')pending=true;return ok(route,{friends:friend?[{id:OTHER,display_name:'Chain Friend',friendship_id:12}]:[],incoming:[],outgoing:[]});
    }
    if(path==='/api/chat/friends/12'){friend=false;pending=false;return ok(route,{success:true});}
    if(path==='/api/chat/world'){
      if(req.method()==='POST')return ok(route,{message:{id:2,message_type:'gif',content:req.postDataJSON().content,created_at:new Date().toISOString(),author:me}},201);
      return ok(route,{messages:[{id:1,message_type:'text',content:'Welcome to World Chat',created_at:new Date().toISOString(),author:{id:OTHER,display_name:'Chain Friend'}}]});
    }
    if(path.includes('/messages'))return ok(route,{messages:[{id:1,message_type:'text',content:'Private hello',created_at:new Date().toISOString(),author:{id:OTHER,display_name:'Chain Friend'}}]});
    if(path.startsWith('/api/nfts/'))return ok(route,{nfts:[]});return ok(route,{});
  });
  return{me,patches,reports,snapshots,unfavorite:()=>starred=false,accept:()=>{friend=true;pending=false;}};
}
test('own UUID uses the existing Profile page and owner can hide public wallets and favorites',async({page})=>{
  const f=await fixture(page);await page.goto('/'+ME);await expect(page.getByText("'s gallery",{exact:true})).toBeVisible();await expect(page.getByRole('region',{name:'Public profile',exact:true})).toHaveCount(0);
  await expect(page.getByRole('navigation',{name:'Main navigation'}).getByRole('button',{name:'Profile',exact:true})).toHaveAttribute('aria-current','page');
  const settings=page.getByRole('region',{name:'Public profile visibility'});await settings.getByLabel('Display linked wallets').uncheck();await expect(settings.getByLabel('Display linked wallets')).not.toBeChecked();
  await settings.getByLabel(/Display favorited NFTs/).uncheck();await expect(settings.getByLabel(/Display favorited NFTs/)).not.toBeChecked();expect(f.patches).toEqual([{public_wallets:false},{public_favorites:false}]);
  await page.screenshot({path:'test-results/profile-v2-owner.png',fullPage:true});
});
test('public profile has separate friend/message/more controls, copyable ID, wallets and synced favorites',async({page,context})=>{
  const f=await fixture(page);await context.grantPermissions(['clipboard-read','clipboard-write']);await page.setViewportSize({width:1440,height:1000});await page.goto('/'+OTHER);
  await expect(page.getByRole('button',{name:'Add Friend',exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'Message Chain Friend',exact:true})).toBeDisabled();
  await expect(page.getByRole('button',{name:'View Profile',exact:true})).toHaveCount(0);await page.getByRole('button',{name:'Copy ChainLens ID',exact:true}).click();await expect.poll(()=>page.evaluate(()=>navigator.clipboard.readText())).toBe(OTHER);
  await page.getByText('Linked wallets · 1',{exact:true}).click();await expect(page.getByText('0x1111111111111111111111111111111111111111',{exact:true})).toBeVisible();
  const gallery=page.getByRole('region',{name:'Favorited NFTs'});await expect(gallery.getByRole('button',{name:'View Favorite Seal'})).toBeVisible();await expect.poll(()=>gallery.locator('img').evaluate(img=>img.complete&&img.naturalWidth>0)).toBe(true);
  await page.screenshot({path:'test-results/profile-v2-public-desktop.png',fullPage:true});await gallery.getByRole('button',{name:'View Favorite Seal'}).click();await expect(page.getByRole('dialog',{name:'Favorite Seal'})).toBeVisible();await page.keyboard.press('Escape');
  f.unfavorite();await gallery.getByRole('button',{name:'Refresh'}).click();await expect(gallery.getByText('No favorited NFTs yet.')).toBeVisible();
  await page.getByRole('button',{name:'Add Friend',exact:true}).click();await expect(page.getByRole('button',{name:'Cancel Request',exact:true})).toHaveText('Request Sent');
});
test('more menu shares, blocks/unblocks and submits a reasoned report',async({page,context})=>{
  const f=await fixture(page);f.accept();await context.grantPermissions(['clipboard-read','clipboard-write']);await page.goto('/'+OTHER);
  await page.getByRole('button',{name:'More profile options'}).click();const menu=page.getByRole('menu',{name:'More profile options'});await expect(menu.getByRole('menuitem',{name:'Share Profile'})).toBeVisible();
  await menu.getByRole('menuitem',{name:'Copy Profile Link'}).click();await expect.poll(()=>page.evaluate(()=>navigator.clipboard.readText())).toBe('https://www.chainlensnft.info/'+OTHER);
  await page.getByRole('button',{name:'More profile options'}).click();await menu.getByRole('menuitem',{name:'Block',exact:true}).click();await expect(page.getByRole('button',{name:'Message Chain Friend',exact:true})).toBeDisabled();
  await page.getByRole('button',{name:'More profile options'}).click();await menu.getByRole('menuitem',{name:'Unblock',exact:true}).click();await expect(page.getByRole('button',{name:'Message Chain Friend',exact:true})).toBeEnabled();
  await page.getByRole('button',{name:'More profile options'}).click();await menu.getByRole('menuitem',{name:'Report',exact:true}).click();const dialog=page.getByRole('dialog',{name:'Report Chain Friend'});await dialog.getByLabel('Reason').selectOption('harassment');await dialog.getByLabel('Details (optional)').fill('Repeated unwanted messages');await dialog.getByRole('button',{name:'Submit report'}).click();await expect(dialog).toBeHidden();expect(f.reports).toEqual([{reason:'harassment',details:'Repeated unwanted messages'}]);
});
test('GIF picker is a focused modal with reactions, sends selection and restores chat draft',async({page})=>{
  const errors=[];page.on('pageerror',error=>errors.push(error.message));await fixture(page);await page.goto('/chat');await page.getByPlaceholder('Message World Chat · no links').fill('Keep this draft');await page.getByLabel('Open GIPHY picker').click();
  const dialog=page.getByRole('dialog',{name:'Choose a GIF'});await expect(dialog).toBeVisible();await expect(dialog.getByLabel('Search GIPHY')).toBeFocused();await expect(dialog.getByRole('button',{name:'Send Reaction 0',exact:true})).toBeVisible();
  await dialog.getByRole('button',{name:'Cheers',exact:true}).click();await expect(dialog.getByRole('button',{name:'Send Reaction 0',exact:true})).toBeVisible();await page.screenshot({path:'test-results/profile-v2-gif-desktop.png',fullPage:true});
  await page.keyboard.press('Escape');await expect(dialog).toBeHidden();await expect(page.getByPlaceholder('Message World Chat · no links')).toHaveValue('Keep this draft');await expect(page.getByLabel('Open GIPHY picker')).toBeFocused();
  await page.getByLabel('Open GIPHY picker').click();await dialog.getByRole('button',{name:'Send Reaction 0',exact:true}).click();await expect(dialog).toBeHidden();await expect(page.getByTestId('world-chat-feed').locator('img[alt^="GIF from"]')).toBeVisible();await expect(page.getByPlaceholder('Message World Chat · no links')).toHaveValue('Keep this draft');expect(errors).toEqual([]);
});
test('public profile and GIF modal fit mobile viewport',async({page})=>{
  await fixture(page);await page.setViewportSize({width:390,height:844});await page.goto('/'+OTHER);await expect(page.getByRole('button',{name:'View Favorite Seal'})).toBeVisible();await page.screenshot({path:'test-results/profile-v2-public-mobile.png',fullPage:true});
  await page.getByRole('button',{name:'More profile options'}).click();const menu=page.getByRole('menu',{name:'More profile options'});await expect(menu).toBeVisible();const menuBox=await menu.boundingBox();expect(menuBox.x).toBeGreaterThanOrEqual(0);expect(menuBox.x+menuBox.width).toBeLessThanOrEqual(390);await page.keyboard.press('Escape');
  await page.goto('/chat');await page.getByLabel('Open GIPHY picker').click();const dialog=page.getByRole('dialog',{name:'Choose a GIF'});await expect(dialog).toBeVisible();const box=await dialog.boundingBox();expect(box.x+box.width).toBeLessThanOrEqual(390);expect(box.y+box.height).toBeLessThanOrEqual(844);await page.screenshot({path:'test-results/profile-v2-gif-mobile.png',fullPage:true});
});
