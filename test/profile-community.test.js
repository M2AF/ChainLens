const test=require('node:test'),assert=require('node:assert/strict'),express=require('express');
const {mountProfileCommunity,blockedIds,areBlocked}=require('../profile-community-service');
const {mountProfileSocial}=require('../profile-social-service');
const ID='ec18dcf5-3271-46fd-8029-41e5b2f39eed',OTHER='3f2c6cb8-2a43-4b69-bf5e-099ef63be79f';
const KEY='ethereum:n:0x1111111111111111111111111111111111111111:7';
async function fixture(t,results=[]){
  const calls=[];const db={from(table){const call={table,methods:[]};calls.push(call);const result=results.shift() || {data:null};const chain={then:(resolve,reject)=>Promise.resolve(result).then(resolve,reject)};for(const name of ['select','eq','gte','or','in','upsert','delete','insert','maybeSingle'])chain[name]=(...args)=>{call.methods.push([name,...args]);return chain;};return chain;}};
  const app=express();app.use(express.json());const requireAuth=(req,res,next)=>{if(req.headers.authorization!=='Bearer test')return res.sendStatus(401);req.user={sub:ID};next();};const rateLimit=(req,res,next)=>next();
  const resolved=[];mountProfileCommunity(app,{db,requireAuth,rateLimit,resolveFavorite:async(key,wallets,snapshot)=>{resolved.push({key,wallets,snapshot});return{key,name:'Favorite'};}});mountProfileSocial(app,{db,requireAuth,rateLimit,requireChatAccess:(req,res,next)=>next()});
  const server=app.listen(0);await new Promise(resolve=>server.once('listening',resolve));t.after(()=>new Promise(resolve=>{server.close(resolve);server.closeAllConnections();}));return{db,calls,resolved,url:`http://127.0.0.1:${server.address().port}`};
}
test('hidden wallets are omitted entirely and never queried by public profile endpoint',async t=>{
  const f=await fixture(t,[{data:{id:OTHER,display_name:'Other',public_wallets:false,public_favorites:true,email:'private'}}]);const res=await fetch(f.url+'/api/profiles/'+OTHER);const body=await res.json();assert.equal(body.wallets,undefined);assert.equal(body.email,undefined);assert.equal(f.calls.length,1);
});
test('visible wallets expose addresses and labels but never owner IDs or verification records',async t=>{
  const f=await fixture(t,[{data:{id:OTHER,public_wallets:true}}, {data:[{chain:'evm',address:'0x123',label:'Main',watch_only:false,user_id:OTHER,verified_at:'private'}]}]);const body=await(await fetch(f.url+'/api/profiles/'+OTHER)).json();assert.deepEqual(body.wallets,[{chain:'evm',address:'0x123',label:'Main',watch_only:false}]);
});
test('hidden favorite gallery never reads synced preferences or artwork',async t=>{
  const f=await fixture(t,[{data:{public_favorites:false}}]);const body=await(await fetch(f.url+'/api/profiles/'+OTHER+'/favorites')).json();assert.equal(body.hidden,true);assert.equal(body.assets.length,0);assert.equal(f.calls.length,1);assert.equal(f.resolved.length,0);
});
test('gallery is derived from synced current stars and hides unfavorited snapshots',async t=>{
  const f=await fixture(t,[{data:{public_favorites:true}},{data:{entries:{['favorite:mainnet:'+KEY]:{s:'f',t:10},['favorite:mainnet:'+KEY.replace(':7',':8')]:{s:'u',t:11},secret:{s:'s',t:12}}}},{data:[{key:KEY,asset:{name:'Star'}}]}]);const body=await(await fetch(f.url+'/api/profiles/'+OTHER+'/favorites')).json();assert.equal(body.total,1);assert.equal(f.resolved[0].key,KEY);assert.deepEqual(f.resolved[0].wallets,[]);assert.doesNotMatch(JSON.stringify(body),/secret/);
});
test('artwork publication requires auth and ignores unstarred assets and forged owner IDs',async t=>{
  const f=await fixture(t,[{data:{entries:{['favorite:mainnet:'+KEY]:{s:'f',t:10}}}},{data:null}]);const opts={method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({user_id:OTHER,assets:[{key:KEY,name:'Star',image:'https://images.example/a.png'},{key:KEY.replace(':7',':8'),name:'Unstarred'}]})};assert.equal((await fetch(f.url+'/api/profile/favorite-artwork',opts)).status,401);opts.headers.Authorization='Bearer test';const body=await(await fetch(f.url+'/api/profile/favorite-artwork',opts)).json();assert.equal(body.saved,1);const rows=f.calls[1].methods.find(m=>m[0]==='upsert')[1];assert.equal(rows[0].user_id,ID);assert.equal(rows.length,1);
});
test('blocking is checked in either direction and own block is distinguished for Unblock control',async t=>{
  const f=await fixture(t,[{data:[{blocker_id:OTHER,blocked_id:ID}]},{data:[{blocker_id:ID,blocked_id:OTHER}]}]);assert.equal(await areBlocked(f.db,ID,OTHER),true);assert.deepEqual([...await blockedIds(f.db,ID)],[OTHER]);
});
test('block/unblock endpoints bind rows to authenticated caller and reject self',async t=>{
  const f=await fixture(t);assert.equal((await fetch(f.url+'/api/profiles/'+OTHER+'/block',{method:'POST'})).status,401);
  const options={method:'POST',headers:{Authorization:'Bearer test'}};assert.equal((await fetch(f.url+'/api/profiles/'+ID+'/block',options)).status,400);assert.equal((await fetch(f.url+'/api/profiles/'+OTHER+'/block',options)).status,200);options.method='DELETE';assert.equal((await fetch(f.url+'/api/profiles/'+OTHER+'/block',options)).status,200);assert.equal(f.calls[0].methods[0][1].blocker_id,ID);assert.ok(f.calls[1].methods.some(m=>m[0]==='eq' && m[1]==='blocker_id' && m[2]===ID));
});
test('reports validate reason, bind reporter, and enforce a daily limit',async t=>{
  const f=await fixture(t,[{count:20}]);const options={method:'POST',headers:{Authorization:'Bearer test','Content-Type':'application/json'},body:'{"reason":"bad"}'};assert.equal((await fetch(f.url+'/api/profiles/'+OTHER+'/report',options)).status,400);options.body='{"reason":"spam"}';assert.equal((await fetch(f.url+'/api/profiles/'+OTHER+'/report',options)).status,429);
});
