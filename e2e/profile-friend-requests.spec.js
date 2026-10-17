const {test,expect:baseExpect}=require('@playwright/test');const expect=baseExpect.configure({timeout:15000});test.setTimeout(90000);
const ME='ec18dcf5-3271-46fd-8029-41e5b2f39eed',FIRST='3f2c6cb8-2a43-4b69-bf5e-099ef63be79f',SECOND='72d87fab-4283-4731-8c04-b31a792b84c2';
async function fixture(page,{many=false}={}){
  const errors=[],actions=[];let offline=false,reject=false;
  let incoming=[{id:FIRST,display_name:'Chain Friend',friendship_id:11,avatar_url:'https://images.example/avatar.svg',avatar_nft_key:'ethereum:n:0x1111111111111111111111111111111111111111:1'},{id:SECOND,display_name:'Another Friend',friendship_id:12}];
  if(many)incoming=Array.from({length:10},(_,i)=>({...incoming[i%2],friendship_id:11+i,display_name:'Friend with a long display name '+i}));
  let friends=[];
  page.on('pageerror',e=>errors.push(e.message));await page.addInitScript(t=>localStorage.setItem('cl_token',t),'test.'+Buffer.from(JSON.stringify({sub:ME})).toString('base64url')+'.test');
  await page.route('https://images.example/**',r=>r.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="100" height="100" fill="#a6c8dd"/></svg>'}));
  await page.route('**/api/**',r=>{
    const req=r.request(),u=new URL(req.url()),p=u.pathname;
    if(p==='/api/profile')return r.fulfill({json:{id:ME,username:'owner',display_name:'Owner',cl_wallets:[],cl_linked_accounts:[],public_wallets:false,public_favorites:false}});
    if(p==='/api/chat/friends')return offline?r.fulfill({status:503,json:{error:'Friend service unavailable'}}):r.fulfill({json:{friends,incoming,outgoing:[]}});
    const match=p.match(/^\/api\/chat\/friends\/(\d+)(\/accept)?$/);
    if(match){actions.push({path:p,method:req.method(),auth:req.headers().authorization});if(reject)return r.fulfill({status:409,json:{error:'Could not accept this request'}});const person=incoming.find(x=>x.friendship_id===Number(match[1]));if(match[2]&&person)friends.push(person);incoming=incoming.filter(x=>x.friendship_id!==Number(match[1]));return r.fulfill({json:{success:true}});}
    if(p==='/api/profiles/'+FIRST)return r.fulfill({json:{id:FIRST,display_name:'Chain Friend',public_wallets:false,public_favorites:false}});
    if(p.endsWith('/favorites'))return r.fulfill({json:{assets:[],hidden:true,total:0}});
    if(p==='/api/chat/status')return r.fulfill({json:{eligible:true,walletLinked:true,socialLinked:true}});
    if(p==='/api/chat/world')return r.fulfill({json:{messages:[]}});
    if(p==='/api/chat/presence')return r.fulfill({json:{success:true,people:[]}});
    if(p==='/api/chat/unread')return r.fulfill({json:{conversations:[],pending_requests:incoming.length,unread_direct:0}});
    return r.fulfill({json:{}});
  });return{errors,actions,setOffline:v=>offline=v,setReject:v=>reject=v};
}
test('profile requests sit under Sign out; accept and decline update the shared friends list',async({page})=>{
  const f=await fixture(page);await page.setViewportSize({width:1440,height:1000});await page.goto('/'+ME);
  const panel=page.getByRole('region',{name:'Friend requests'});await expect(panel.getByText('Chain Friend',{exact:true})).toBeVisible();await expect(panel.locator('[data-avatar-kind=nft]')).toBeVisible();
  const signout=await page.getByRole('button',{name:'Sign out',exact:true}).boundingBox(),box=await panel.boundingBox(),visibility=await page.getByRole('region',{name:'Public profile visibility'}).boundingBox();expect(box.y).toBeGreaterThan(signout.y+signout.height);expect(box.y+box.height).toBeLessThan(visibility.y);
  await panel.screenshot({path:'test-results/profile-requests-desktop.png'});
  await panel.getByRole('button',{name:'Accept friend request from Chain Friend',exact:true}).click();await expect(panel.getByText('Chain Friend',{exact:true})).toHaveCount(0);await expect(panel.getByText('Friend request accepted',{exact:true})).toBeVisible();
  await panel.getByRole('button',{name:'Decline friend request from Another Friend',exact:true}).click();await expect(panel.getByText('No pending friend requests.',{exact:true})).toBeVisible();
  expect(f.actions.map(x=>[x.method,x.path])).toEqual([['POST','/api/chat/friends/11/accept'],['DELETE','/api/chat/friends/12']]);expect(f.actions.every(x=>x.auth.startsWith('Bearer test.'))).toBe(true);
  await page.getByRole('navigation',{name:'Main navigation'}).getByRole('button',{name:'Chat',exact:true}).click();await expect(page.getByRole('complementary',{name:'People'}).getByRole('button',{name:'Chain Friend',exact:true})).toBeVisible();expect(f.errors).toEqual([]);
});
test('request outages and failed acceptance keep requests visible and support retry',async({page})=>{
  const f=await fixture(page);f.setOffline(true);await page.goto('/'+ME);const panel=page.getByRole('region',{name:'Friend requests'});
  await expect(panel.getByRole('alert')).toContainText('Friend service unavailable');await expect(panel.getByText('No pending friend requests.',{exact:true})).toHaveCount(0);
  f.setOffline(false);await panel.getByRole('button',{name:'Retry',exact:true}).click();await expect(panel.getByText('Chain Friend',{exact:true})).toBeVisible();
  f.setReject(true);await panel.getByRole('button',{name:'Accept friend request from Chain Friend',exact:true}).click();await expect(panel.getByRole('alert')).toContainText('Could not accept');await expect(panel.getByText('Chain Friend',{exact:true})).toBeVisible();
  f.setReject(false);await panel.getByRole('button',{name:'Accept friend request from Chain Friend',exact:true}).click();await expect(panel.getByText('Chain Friend',{exact:true})).toHaveCount(0);expect(f.errors).toEqual([]);
});
test('mobile profile requests scroll, fit the sidebar, and open sender profiles',async({page})=>{
  const f=await fixture(page,{many:true});await page.setViewportSize({width:390,height:844});await page.goto('/'+ME);const panel=page.getByRole('region',{name:'Friend requests'});await expect(panel.locator('article')).toHaveCount(10);
  expect(await panel.locator('.cl-profile-request-list').evaluate(el=>el.scrollHeight>el.clientHeight)).toBe(true);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await panel.screenshot({path:'test-results/profile-requests-mobile.png'});
  await panel.getByRole('button',{name:'View profile of Friend with a long display name 0',exact:true}).click();await expect(page).toHaveURL(new RegExp(FIRST+'$'));await expect(page.getByRole('heading',{name:'Chain Friend',exact:true})).toBeVisible();expect(f.actions).toHaveLength(0);expect(f.errors).toEqual([]);
});
