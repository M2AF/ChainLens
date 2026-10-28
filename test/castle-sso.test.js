const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto'),express=require('express');
const {mountCastleSso,CLIENT,REDIRECT}=require('../castle-sso');
const verifier='a'.repeat(64),challenge=crypto.createHash('sha256').update(verifier).digest('base64url');
const input={client_id:CLIENT,redirect_uri:REDIRECT,response_type:'code',code_challenge:challenge,code_challenge_method:'S256',state:'b'.repeat(64)};
async function setup(t,{rows=new Map(),enabled=true}={}){
 let now=Date.now(),deleted=false;const app=express();app.use(express.json());
 mountCastleSso(app,{frontendUrl:'http://localhost:10000',now:()=>now,store:{ready:async()=>enabled,put:async(k,v)=>rows.set(k,v),get:async k=>rows.get(k),delete:async k=>rows.delete(k)},
  requireAuth:(req,res,next)=>{if(req.headers.authorization!=='Bearer web-account')return res.sendStatus(401);req.user={sub:'account-1'};next();},
  getUser:async id=>!deleted&&id==='account-1'?{id,display_name:'Alice',email:'private',wallets:['private'],holdings:['private']}:null});
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));t.after(()=>new Promise(r=>server.close(r)));
 const base='http://127.0.0.1:'+server.address().port;
 const request=(path,body,{bearer,form=false,origin='http://localhost:10000'}={})=>fetch(base+path,{redirect:'manual',headers:{Origin:origin,...(bearer?{Authorization:'Bearer '+bearer}:{}),...(body?{'Content-Type':form?'application/x-www-form-urlencoded':'application/json'}:{})},...(body?{method:'POST',body:form?new URLSearchParams(body):JSON.stringify(body)}:{})});
 const mint=async()=>{const r=await request('/api/castle-siege/authorize',input,{bearer:'web-account'});assert.equal(r.status,200);const url=new URL((await r.json()).redirect);assert.equal(url.searchParams.get('state'),input.state);return url.searchParams.get('code');};
 const exchange=code=>({grant_type:'authorization_code',client_id:CLIENT,redirect_uri:REDIRECT,code,code_verifier:verifier});
 return {request,mint,exchange,rows,advance:n=>now+=n,deleteAccount:()=>deleted=true};
}
test('Castle native client enforces registered callback, PKCE, origin and an existing authenticated account',async t=>{
 const {request}=await setup(t);
 assert.equal((await request('/api/castle-siege/config')).status,200);
 assert.equal((await request('/auth/castle-siege?'+new URLSearchParams(input))).status,302);
 for(const changed of [{redirect_uri:'https://attacker.invalid'},{client_id:'duo'},{code_challenge_method:'plain'}])assert.equal((await request('/auth/castle-siege?'+new URLSearchParams({...input,...changed}))).status,400);
 assert.equal((await request('/api/castle-siege/authorize',input)).status,401);
 assert.equal((await request('/api/castle-siege/authorize',input,{bearer:'web-account',origin:'https://attacker.invalid'})).status,403);
});
test('Castle issues only a hashed game session, persists across server restart and revokes on logout',async t=>{
 const a=await setup(t),code=await a.mint();
 const response=await a.request('/api/castle-siege/token',a.exchange(code),{form:true});assert.equal(response.status,200);
 const session=await response.json();assert.deepEqual(session.user,{id:'account-1',name:'Alice'});assert.match(session.access_token,/^csa_[0-9a-f]{64}$/);
 assert(!JSON.stringify([...a.rows]).includes(session.access_token));
 const b=await setup(t,{rows:a.rows});
 const me=await b.request('/api/castle-siege/me',null,{bearer:session.access_token});assert.equal(me.status,200);assert.equal((await me.json()).capabilities.multiplayer,false);
 assert.equal((await b.request('/api/castle-siege/logout',{}, {bearer:session.access_token})).status,200);
 assert.equal((await b.request('/api/castle-siege/me',null,{bearer:session.access_token})).status,401);
});
test('wrong verifier consumes the code; replay, expired codes and deleted accounts fail closed',async t=>{
 const a=await setup(t),code=await a.mint();
 assert.equal((await a.request('/api/castle-siege/token',{...a.exchange(code),code_verifier:'x'.repeat(64)},{form:true})).status,400);
 assert.equal((await a.request('/api/castle-siege/token',a.exchange(code),{form:true})).status,400);
 const expired=await a.mint();a.advance(61000);assert.equal((await a.request('/api/castle-siege/token',a.exchange(expired),{form:true})).status,400);
 const removed=await a.mint();a.deleteAccount();assert.equal((await a.request('/api/castle-siege/token',a.exchange(removed),{form:true})).status,401);
});
test('web credentials are not game credentials; session expiration is enforced',async t=>{
 const a=await setup(t);assert.equal((await a.request('/api/castle-siege/me',null,{bearer:'web-account'})).status,401);
 const response=await a.request('/api/castle-siege/token',a.exchange(await a.mint()),{form:true});const session=await response.json();
 a.advance(8*24*60*60*1000);assert.equal((await a.request('/api/castle-siege/me',null,{bearer:session.access_token})).status,401);
});
test('missing persistent store schema disables sign-in instead of issuing temporary production sessions',async t=>{
 const a=await setup(t,{enabled:false});assert.equal((await a.request('/api/castle-siege/config')).status,503);
 assert.equal((await a.request('/auth/castle-siege?'+new URLSearchParams(input))).status,503);
});
