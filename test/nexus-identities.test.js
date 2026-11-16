'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),express=require('express');
const {mountIdentities,xboxSigner}=require('../nexus-identities'),crypto=require('node:crypto');
test('Epic errors distinguish invalid app credentials from an expired code without exposing upstream details',async t=>{
 for(const error of ['invalid_client','invalid_grant']){
  const app=express();app.use(express.json());let writes=0;
  mountIdentities(app,{frontendUrl:'https://www.chainlensnft.info',guard:(req,res,next)=>next(),session:(req,res,next)=>{req.user={sub:'fixture-owner'};req.nexusSocialSession={key:'fixture-session'};next();},store:{ready:async()=>true,link:async()=>writes++},getFriendIds:async()=>[],validateSession:async()=>true,epic:{clientId:'fixture-client',clientSecret:'fixture-secret'},fetchImpl:async()=>({ok:false,status:400,json:async()=>({error,errorMessage:'upstream-private-details'})})});
  const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));t.after(()=>new Promise(resolve=>server.close(resolve)));const base='http://127.0.0.1:'+server.address().port;
  const start=await fetch(base+'/api/nexus/identities/link/epic',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'}),job=await start.json(),state=new URL(job.authorization_url).searchParams.get('state');
  const response=await fetch(base+'/auth/nexus/link/epic/callback?'+new URLSearchParams({state,code:'fixture-code'})),message=await response.text();assert.equal(response.status,400);assert.match(message,error==='invalid_client'?/client configuration needs updating/:/expired or was already used/);assert(!message.includes('upstream-private-details'));assert.equal(writes,0);
 }
});
const owner='11111111-1111-4111-8111-111111111111',friend='22222222-2222-4222-8222-222222222222',steam='76561198000000001',discord='100000000000000001';
async function setup(t,{conflict=false,external=false,badEpicClient=false,xboxDevice=false}={}){
 const rows=[],calls=[];let active=true,clock=Date.now(),refreshFailure=null,renewedXuid='2533274800000001';const app=express();app.use(express.json());
 const session=(req,res,next)=>{if(req.headers.authorization!=='Bearer fixture-session')return res.sendStatus(401);req.user={sub:owner};req.nexusSocialSession={key:req.headers['x-fixture-session-key']||'fixture-hash'};next();};
 const controller=mountIdentities(app,{frontendUrl:'https://www.chainlensnft.info',guard:(req,res,next)=>next(),session,now:()=>clock,discord:{clientId:'fixture-client',clientSecret:'fixture-secret'},xbox:external?{clientId:'xbox-client',clientSecret:'xbox-secret'}:{},epic:external?{clientId:'epic-client',clientSecret:'epic-secret'}:{},store:{ready:async()=>true,list:async()=>rows,link:async(user,provider,id)=>{assert.equal(user,owner);if(conflict)throw Error('identity_conflict');rows.push({provider,provider_id:id});},unlink:async(user,provider)=>{assert.equal(user,owner);const index=rows.findIndex(row=>row.provider===provider);if(index>=0)rows.splice(index,1);},friends:async ids=>{assert.deepEqual(ids,[friend]);return [{user_id:friend,provider:'discord',provider_id:discord}];}},getFriendIds:async id=>{assert.equal(id,owner);return [friend];},validateSession:async(key,user)=>active&&key==='fixture-hash'&&user===owner,fetchImpl:async(url,options)=>{calls.push({url,options});if(options?.body?.get?.('grant_type')==='refresh_token'&&refreshFailure){if(refreshFailure==='network')throw Error('offline');return {ok:false,status:refreshFailure,json:async()=>({error:'invalid_grant'})};}if(url.includes('login.microsoftonline.com'))return {ok:true,json:async()=>({access_token:'ms-private',refresh_token:'ms-refresh-private'})};if(url.includes('device.auth.xboxlive.com')&&xboxDevice)return {ok:true,json:async()=>({Token:'device-private'})};if(url.includes('user.auth.xboxlive.com'))return {ok:true,json:async()=>({Token:'user-private'})};if(url.includes('xsts.auth.xboxlive.com'))return {ok:true,json:async()=>({Token:'xsts-private',NotAfter:new Date(clock+3600000).toISOString(),DisplayClaims:{xui:[{xid:renewedXuid,uhs:'12345'}]}})};if(url.includes('api.epicgames.dev'))return {ok:true,json:async()=>({access_token:'epic-private',client_id:badEpicClient?'other-client':'epic-client',account_id:'a'.repeat(32),expires_at:new Date(clock+3600000).toISOString(),refresh_token:'epic-refresh-private',refresh_expires_at:new Date(clock+28800000).toISOString()})};if(url.includes('steamcommunity'))return {ok:true,text:async()=> 'ns:http://specs.openid.net/auth/2.0\nis_valid:true\n'};if(url.endsWith('/token'))return {ok:true,json:async()=>({access_token:'private-provider-token'})};return {ok:true,json:async()=>({id:discord})};}});
 app.get('/auth/discord/callback',(req,res)=>controller.callback('discord',req,res));const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));t.after(()=>new Promise(resolve=>server.close(resolve)));const base='http://127.0.0.1:'+server.address().port;
 const request=(route,body,{auth=true,method=body?'POST':'GET',sessionKey=null}={})=>fetch(base+route,{method,redirect:'manual',headers:{...(auth?{Authorization:'Bearer fixture-session'}:{}),...(sessionKey?{'x-fixture-session-key':sessionKey}:{}),...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
 const start=async(provider,expectedId)=>{const response=await request('/api/nexus/identities/link/'+provider,{expectedId});assert.equal(response.status,200);return response.json();};
 const steamQuery=job=>{const returnTo=new URL(job.authorization_url).searchParams.get('openid.return_to'),state=new URL(returnTo).searchParams.get('state');return {'state':state,'openid.ns':'http://specs.openid.net/auth/2.0','openid.mode':'id_res','openid.op_endpoint':'https://steamcommunity.com/openid/login','openid.return_to':returnTo,'openid.identity':'https://steamcommunity.com/openid/id/'+steam,'openid.claimed_id':'https://steamcommunity.com/openid/id/'+steam,'openid.response_nonce':new Date(clock).toISOString().replace(/\.\d+Z$/,'Z')+'random','openid.assoc_handle':'fixture','openid.signed':'op_endpoint,claimed_id,identity,return_to,response_nonce,assoc_handle','openid.sig':'signature-verified-by-steam'};};
 return {request,start,steamQuery,rows,calls,revoke:()=>active=false,advance:ms=>clock+=ms,failRefresh:value=>refreshFailure=value,renewAs:xuid=>renewedXuid=xuid};
}
test('Gaming identity endpoints require Nexus authentication and only expose accepted-friend link edges',async t=>{const a=await setup(t);assert.equal((await a.request('/api/nexus/identities',null,{auth:false})).status,401);const response=await a.request('/api/nexus/identities/friends');assert.deepEqual((await response.json()).links,[{from:'chainlens:'+friend,to:'discord:'+discord,verified:true}]);assert.equal((await a.request('/api/nexus/identities/link/xbox',{})).status,503);assert.equal((await a.request('/api/nexus/identities/file',null,{method:'DELETE'})).status,400);});
test('Steam identities require signed return URL, Steam-side proof verification, matching native account, and a single-use live session',async t=>{const a=await setup(t),job=await a.start('steam',steam),query=a.steamQuery(job);const route='/auth/nexus/link/steam/callback?'+new URLSearchParams(query);assert.equal((await a.request(route,null,{auth:false})).status,200);assert.deepEqual(a.rows,[{provider:'steam',provider_id:steam}]);assert.equal(a.calls[0].url,'https://steamcommunity.com/openid/login');assert.equal(a.calls[0].options.body.get('openid.mode'),'check_authentication');assert.equal((await a.request(route,null,{auth:false})).status,400);const status=await(await a.request('/api/nexus/identities/link/'+job.intent_id)).json();assert.equal(status.status,'linked');assert(!JSON.stringify(status).includes('fixture-session'));const revoked=await a.start('steam',steam);a.revoke();assert.equal((await a.request('/auth/nexus/link/steam/callback?'+new URLSearchParams(a.steamQuery(revoked)),null,{auth:false})).status,400);assert.equal(a.rows.length,1);});
test('Tampered Steam assertions and different signed-in accounts cannot bind an identity',async t=>{const a=await setup(t),tampered=await a.start('steam',steam),query=a.steamQuery(tampered);query['openid.return_to']='https://evil.example/';assert.equal((await a.request('/auth/nexus/link/steam/callback?'+new URLSearchParams(query),null,{auth:false})).status,400);assert.equal(a.calls.length,0);const mismatch=await a.start('steam','76561198000000009');assert.equal((await a.request('/auth/nexus/link/steam/callback?'+new URLSearchParams(a.steamQuery(mismatch)),null,{auth:false})).status,400);assert.equal(a.rows.length,0);});
test('Discord linking uses PKCE and identify only, stores no provider credential, and does not transfer conflicts',async t=>{const a=await setup(t),job=await a.start('discord',discord),url=new URL(job.authorization_url);assert.equal(url.searchParams.get('scope'),'identify');assert.equal(url.searchParams.get('code_challenge_method'),'S256');const response=await a.request('/auth/discord/callback?'+new URLSearchParams({state:url.searchParams.get('state'),code:'fixture-code'}),null,{auth:false});assert.equal(response.status,200);assert.equal(a.rows[0].provider_id,discord);assert(!JSON.stringify(a.rows).includes('private-provider-token'));assert(a.calls[0].options.body.get('code_verifier'));const conflict=await setup(t,{conflict:true}),other=await conflict.start('discord',discord);assert.equal((await conflict.request('/auth/discord/callback?'+new URLSearchParams({state:new URL(other.authorization_url).searchParams.get('state'),code:'code'}),null,{auth:false})).status,400);assert.equal(conflict.rows.length,0);});
test('Expired jobs and unlink requests cannot write arbitrary account identities',async t=>{const a=await setup(t),job=await a.start('steam',steam);a.advance(600001);assert.equal((await a.request('/api/nexus/identities/link/'+job.intent_id)).status,404);assert.equal((await a.request('/api/nexus/identities/steam',null,{auth:false,method:'DELETE'})).status,401);assert.equal((await a.request('/api/nexus/identities/steam',null,{method:'DELETE'})).status,200);});

test('Xbox and Epic proofs issue one-time session-bound desktop credentials without leaking them in status or identities',async t=>{
 const a=await setup(t,{external:true});
 for(const provider of ['xbox','epic']){
  const job=await a.start(provider),url=new URL(job.authorization_url);
  assert.equal(url.searchParams.get('scope'),provider==='xbox'?'XboxLive.signin offline_access':'basic_profile friends_list presence');
  if(provider==='epic')assert.equal(url.searchParams.get('prompt'),'consent');
  const route='/auth/nexus/link/'+provider+'/callback?'+new URLSearchParams({state:url.searchParams.get('state'),code:'fixture-code'});
  assert.equal((await a.request(route,null,{auth:false})).status,200);
  const status=await(await a.request('/api/nexus/identities/link/'+job.intent_id)).json();assert.equal(status.status,'linked');assert(!JSON.stringify(status).includes('private'));
  const claim='/api/nexus/identities/link/'+job.intent_id+'/session';
  assert.equal((await a.request(claim,null,{auth:false})).status,401);assert.equal((await a.request(claim,null,{sessionKey:'different-session'})).status,404);
  const response=await a.request(claim);assert.equal(response.headers.get('cache-control'),'no-store');
  const credential=await response.json();assert.equal(credential.provider,provider);assert(credential.token.endsWith('-private'));assert.equal(credential.refreshToken,provider==='xbox'?'ms-refresh-private':'epic-refresh-private');
  assert.equal((await a.request(claim)).status,404);assert.equal((await a.request(route,null,{auth:false})).status,400);
 }
 assert(!JSON.stringify(a.rows).includes('private'));
});
test('Epic proof rejects tokens issued to another client and OAuth rejects empty authorization codes before exchanging',async t=>{
 const a=await setup(t,{external:true,badEpicClient:true}),job=await a.start('epic');
 assert.equal((await a.request('/auth/nexus/link/epic/callback?'+new URLSearchParams({state:new URL(job.authorization_url).searchParams.get('state'),code:'fixture-code'}),null,{auth:false})).status,400);
 assert.equal(a.rows.length,0);
 const empty=await a.start('xbox'),before=a.calls.length;
 assert.equal((await a.request('/auth/nexus/link/xbox/callback?'+new URLSearchParams({state:new URL(empty.authorization_url).searchParams.get('state'),code:''}),null,{auth:false})).status,400);
 assert.equal(a.calls.length,before);
});
async function linked(t,provider,options={}){const a=await setup(t,{external:true,...options}),job=await a.start(provider),url=new URL(job.authorization_url);assert.equal((await a.request('/auth/nexus/link/'+provider+'/callback?'+new URLSearchParams({state:url.searchParams.get('state'),code:'fixture-code'}),null,{auth:false})).status,200);const session=await(await a.request('/api/nexus/identities/link/'+job.intent_id+'/session')).json();return {a,session,renew:(body,options)=>a.request('/api/nexus/identities/'+provider+'/session',body,options)};}
test('Linked Xbox and Epic sessions renew with the desktop refresh token and never store it server-side',async t=>{
 for(const provider of ['xbox','epic']){
  const {a,session,renew}=await linked(t,provider);assert(session.refreshToken);
  if(provider==='epic')assert(Number.isFinite(session.refreshExpiresAt));
  a.advance(10001);const response=await renew({accountId:session.accountId,refreshToken:session.refreshToken});assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');
  const renewed=await response.json();assert.equal(renewed.provider,provider);assert.equal(renewed.accountId,session.accountId);assert(renewed.token.endsWith('-private'));assert(renewed.refreshToken);
  const exchange=a.calls.findLast(call=>call.options?.body?.get?.('grant_type')==='refresh_token');assert.equal(exchange.options.body.get('grant_type'),'refresh_token');assert.equal(exchange.options.body.get('refresh_token'),session.refreshToken);
  if(provider==='xbox')assert.equal(exchange.options.body.get('scope'),'XboxLive.signin offline_access');
  assert(!JSON.stringify(a.rows).includes('refresh'));
 }
});
test('Renewal requires the signed-in owner of the linked account, valid input, and throttles repeats',async t=>{
 const {a,session,renew}=await linked(t,'xbox'),body={accountId:session.accountId,refreshToken:session.refreshToken};
 assert.equal((await renew(body,{auth:false})).status,401);
 assert.equal((await renew({...body,refreshToken:'bad\ntoken'})).status,400);assert.equal((await renew({...body,accountId:'not-an-id'})).status,400);
 assert.equal((await a.request('/api/nexus/identities/steam/session',body)).status,400);
 const before=a.calls.length;assert.equal((await renew({...body,accountId:'2533274800000009'})).status,403);assert.equal(a.calls.length,before);
 a.advance(10001);assert.equal((await renew(body)).status,200);assert.equal((await renew(body)).status,429);
 a.advance(10001);a.renewAs('2533274800000009');const other=await renew(body);assert.equal(other.status,403);assert.equal((await other.json()).reconnect,true);
});
test('Revoked grants ask Nexus to reconnect while provider outages stay retryable',async t=>{
 const {a,session,renew}=await linked(t,'epic'),body={accountId:session.accountId,refreshToken:session.refreshToken};
 for(const [failure,status,reconnect] of [[400,403,true],[401,403,true],[503,503,undefined],['network',503,undefined]]){
  a.advance(10001);a.failRefresh(failure);const response=await renew(body),json=await response.json();assert.equal(response.status,status);assert.equal(json.reconnect,reconnect);assert(!JSON.stringify(json).includes('private'));
 }
});

test('Xbox device proof signs requests in the policy-1 layout and verifies with the published key',()=>{
 const at=Date.UTC(2026,10,16,12,0,0),signer=xboxSigner(()=>at),url='https://xsts.auth.xboxlive.com/xsts/authorize?ignored=1',body='{"a":1}',header=Buffer.from(signer.sign(url,body),'base64');
 assert.equal(signer.jwk.kty,'EC');assert.equal(signer.jwk.crv,'P-256');assert.equal(signer.jwk.alg,'ES256');assert.equal(signer.jwk.use,'sig');assert.equal(signer.jwk.d,undefined);
 assert.equal(header.length,76);assert.equal(header.readInt32BE(0),1);const stamp=header.readBigUInt64BE(4);assert.equal(stamp,(BigInt(at/1000)+11644473600n)*10000000n);
 const signed=Buffer.alloc(14);signed.writeInt32BE(1,0);signed.writeBigUInt64BE(stamp,5);const message=Buffer.concat([signed,Buffer.from('POST\0/xsts/authorize\0\0'+body+'\0')]);
 assert(crypto.verify('SHA256',message,{key:crypto.createPublicKey({key:signer.jwk,format:'jwk'}),dsaEncoding:'ieee-p1363'},header.subarray(12)));
});
test('Xbox linking adds signed device proof to XSTS and falls back to a user-only token when device auth fails',async t=>{
 const proven=await linked(t,'xbox',{xboxDevice:true}),device=proven.a.calls.find(call=>call.url.includes('device.auth.xboxlive.com')),xsts=proven.a.calls.find(call=>call.url.includes('xsts.auth.xboxlive.com'));
 assert(device.options.headers.Signature);assert.equal(JSON.parse(device.options.body).Properties.AuthMethod,'ProofOfPossession');
 const body=JSON.parse(xsts.options.body);assert.equal(body.Properties.DeviceToken,'device-private');assert.deepEqual(body.Properties.UserTokens,['user-private']);assert.equal(body.Properties.ProofKey.crv,'P-256');assert(xsts.options.headers.Signature);
 assert.equal(proven.session.deviceProof,true);assert(!JSON.stringify(proven.session).includes('device-private'));
 const plain=await linked(t,'xbox'),fallback=plain.a.calls.filter(call=>call.url.includes('xsts.auth.xboxlive.com')).at(-1);
 assert.equal(JSON.parse(fallback.options.body).Properties.DeviceToken,undefined);assert.equal(fallback.options.headers.Signature,undefined);assert.equal(plain.session.deviceProof,false);
});
