const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto'),express=require('express');
const {mountNexusSso,CLIENT,validRedirect}=require('../nexus-sso');
const userId='11111111-1111-4111-8111-111111111111',friendId='22222222-2222-4222-8222-222222222222';
const verifier='a'.repeat(64),challenge=crypto.createHash('sha256').update(verifier).digest('base64url');
const input={client_id:CLIENT,redirect_uri:'http://127.0.0.1:45678/chainlens/callback',response_type:'code',code_challenge:challenge,code_challenge_method:'S256',state:'b'.repeat(64)};
async function setup(t,{rows=new Map(),enabled=true,eligible=true}={}){
 let clock=Date.now(),deleted=false;const app=express();app.use(express.json());
 const requireAuth=(req,res,next)=>{if(req.headers.authorization!=='Bearer web-account')return res.sendStatus(401);req.user={sub:userId};next();};
 mountNexusSso(app,{frontendUrl:'http://localhost:10000',now:()=>clock,store:{ready:async()=>enabled,put:async(k,v)=>rows.set(k,v),get:async k=>rows.get(k),delete:async k=>rows.delete(k)},requireAuth,getUser:async id=>!deleted&&id===userId?{id,display_name:'Alice',email:'private',wallets:['private']}:null,getAccess:async()=>({eligible,walletLinked:eligible,socialLinked:eligible}),giphyKey:'fixture-not-a-real-key',fetchImpl:async()=>({ok:true,json:async()=>({data:[{id:'fixture',title:'Hello',images:{original:{url:'https://media.giphy.com/media/fixture/giphy.gif'},fixed_width:{url:'https://media.giphy.com/media/fixture/200.gif'}}}]})})});
 const requireChatAuth=(req,res,next)=>req.nexusSocialSession?next():requireAuth(req,res,next);
 app.get('/api/chat/friends',requireChatAuth,(req,res)=>res.json({user:req.user.sub,friends:[{id:friendId}]}));
 app.post('/api/chat/friends/:id/messages',requireChatAuth,(req,res)=>req.params.id!==friendId?res.status(403).json({error:'Not friends'}):res.json({message:{content:req.body.content}}));
 app.get('/api/profile',requireAuth,(req,res)=>res.json({private:true}));
 const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));t.after(()=>new Promise(resolve=>server.close(resolve)));
 const base='http://127.0.0.1:'+server.address().port;
 const request=(route,body,{bearer,origin='http://localhost:10000',method=body?'POST':'GET'}={})=>fetch(base+route,{method,redirect:'manual',headers:{Origin:origin,...(bearer?{Authorization:'Bearer '+bearer}:{}),...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
 const mint=async(overrides={})=>{const response=await request('/api/nexus/authorize',{...input,...overrides},{bearer:'web-account'});assert.equal(response.status,200);return new URL((await response.json()).redirect).searchParams.get('code');};
 const exchange=code=>({grant_type:'authorization_code',client_id:CLIENT,redirect_uri:input.redirect_uri,code,code_verifier:verifier});
 const session=async()=>{const response=await request('/api/nexus/token',exchange(await mint()));assert.equal(response.status,200);return response.json();};
 return {request,mint,exchange,session,rows,advance:delta=>clock+=delta,deleteAccount:()=>deleted=true};
}
test('Nexus native client restricts loopback callbacks, state, S256, origin and existing web authentication',async t=>{
 for(const bad of ['https://evil.example/chainlens/callback','http://localhost:45678/chainlens/callback','http://127.0.0.1:45678/other','http://127.0.0.1:45678/chainlens/callback?x=1','http://user:pass@127.0.0.1:45678/chainlens/callback'])assert.equal(validRedirect(bad),false);
 const a=await setup(t);assert.equal((await a.request('/api/nexus/config')).status,200);assert.equal((await a.request('/auth/nexus?'+new URLSearchParams(input))).status,302);
 for(const changed of [{client_id:'castle-siege-android'},{code_challenge_method:'plain'},{state:'bad'}])assert.equal((await a.request('/auth/nexus?'+new URLSearchParams({...input,...changed}))).status,400);
 assert.equal((await a.request('/api/nexus/authorize',input)).status,401);assert.equal((await a.request('/api/nexus/authorize',input,{bearer:'web-account',origin:'https://evil.example'})).status,403);
});
test('Nexus opaque credentials are hashed, restart-safe, revocable and refused by general account APIs',async t=>{
 const a=await setup(t),session=await a.session();assert.match(session.access_token,/^nxs_[a-f0-9]{64}$/);assert(!JSON.stringify([...a.rows]).includes(session.access_token));assert.equal(session.user.email,undefined);assert.equal(session.user.wallets,undefined);
 const b=await setup(t,{rows:a.rows});assert.equal((await b.request('/api/nexus/me',null,{bearer:session.access_token})).status,200);assert.equal((await b.request('/api/profile',null,{bearer:session.access_token})).status,401);
 assert.equal((await b.request('/api/nexus/logout',{}, {bearer:session.access_token})).status,200);assert.equal((await a.request('/api/nexus/me',null,{bearer:session.access_token})).status,401);
});
test('PKCE, redirect binding, code replay, expiry and account deletion fail closed',async t=>{
 const a=await setup(t),code=await a.mint();assert.equal((await a.request('/api/nexus/token',{...a.exchange(code),redirect_uri:'http://127.0.0.1:45679/chainlens/callback'})).status,400);assert.equal((await a.request('/api/nexus/token',a.exchange(code))).status,400);
 const bad=await a.mint();assert.equal((await a.request('/api/nexus/token',{...a.exchange(bad),code_verifier:'x'.repeat(64)})).status,400);assert.equal((await a.request('/api/nexus/token',a.exchange(bad))).status,400);
 const expired=await a.mint();a.advance(61000);assert.equal((await a.request('/api/nexus/token',a.exchange(expired))).status,400);const removed=await a.mint();a.deleteAccount();assert.equal((await a.request('/api/nexus/token',a.exchange(removed))).status,401);
});
test('Social routing is narrowly scoped and retains friendship checks; GIPHY key is not exposed',async t=>{
 const a=await setup(t),session=await a.session(),auth={bearer:session.access_token};const friends=await a.request('/api/nexus/social/friends',null,auth);assert.equal(friends.status,200);assert.equal((await friends.json()).user,userId);
 assert.equal((await a.request('/api/nexus/social/profile',null,auth)).status,404);assert.equal((await a.request('/api/nexus/social/world',{content:'not allowed'},auth)).status,404);
 assert.equal((await a.request('/api/nexus/social/friends/33333333-3333-4333-8333-333333333333/messages',{content:'blocked'},auth)).status,403);
 const response=await a.request('/api/nexus/gifs?q=hello',null,auth),body=await response.json();assert.equal(response.status,200);assert.equal(body.gifs.length,1);assert(!JSON.stringify(body).includes('fixture-not-a-real-key'));
 const denied=await setup(t,{eligible:false}),deniedSession=await denied.session();assert.equal((await denied.request('/api/nexus/gifs',null,{bearer:deniedSession.access_token})).status,403);
});
test('Missing persistent schema disables native login; expired sessions cannot authenticate',async t=>{
 const disabled=await setup(t,{enabled:false});assert.equal((await disabled.request('/api/nexus/config')).status,503);assert.equal((await disabled.request('/auth/nexus?'+new URLSearchParams(input))).status,503);
 const a=await setup(t),session=await a.session();a.advance(8*24*60*60*1000);assert.equal((await a.request('/api/nexus/me',null,{bearer:session.access_token})).status,401);
});

test('The lightweight browser account endpoint returns saved public identity only',async t=>{
 const a=await setup(t);assert.equal((await a.request('/api/nexus/account')).status,401);
 const response=await a.request('/api/nexus/account',null,{bearer:'web-account'});assert.equal(response.status,200);const result=await response.json();assert.deepEqual(Object.keys(result.user).sort(),['avatar_nft_key','avatar_url','id','name','username']);assert(!JSON.stringify(result).includes('private'));
 const session=await a.session();assert.equal((await a.request('/api/nexus/account',null,{bearer:session.access_token})).status,401);
});
