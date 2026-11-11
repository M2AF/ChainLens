'use strict';
const crypto=require('node:crypto');
const digest=value=>crypto.createHash('sha256').update(value).digest('hex');
const random=()=>crypto.randomBytes(32).toString('hex');
const NS='http://specs.openid.net/auth/2.0',STEAM='https://steamcommunity.com/openid/login';
function identity(provider,id){id=String(id||'');const patterns={steam:/^7656119\d{10}$/,discord:/^\d{16,22}$/,xbox:/^\d{12,20}$/,epic:/^[a-f0-9]{32}$/i};if(!patterns[provider]?.test(id))throw Error('Invalid platform identity.');return provider==='epic'?id.toLowerCase():id;}
function createIdentityStore(db){if(!db)return null;const checked=result=>{if(result.error)throw Error(result.error.code==='23505'?'identity_conflict':'identity_store_unavailable');return result.data||[];};return {
 async ready(){const result=await db.from('cl_nexus_identities').select('provider').limit(0);return !result.error;},
 async list(userId){return checked(await db.from('cl_nexus_identities').select('provider,provider_id,verified_at').eq('user_id',userId));},
 async link(userId,provider,id){checked(await db.rpc('link_nexus_identity',{owner_id:userId,platform:provider,external_id:identity(provider,id)}));},
 async unlink(userId,provider){checked(await db.from('cl_nexus_identities').delete().eq('user_id',userId).eq('provider',provider));},
 async friends(ids){if(!ids.length)return [];return checked(await db.from('cl_nexus_identities').select('user_id,provider,provider_id').in('user_id',ids.slice(0,1000)));}
};}
function mountIdentities(app,{guard,session,store,frontendUrl,getFriendIds,validateSession,fetchImpl=fetch,now=Date.now,discord={},xbox={},epic={}}){
 const origin=new URL(frontendUrl).origin,intents=new Map(),states=new Map();
 const callbacks={steam:origin+'/auth/nexus/link/steam/callback',discord:discord.redirect||origin+'/auth/discord/callback',xbox:origin+'/auth/nexus/link/xbox/callback',epic:origin+'/auth/nexus/link/epic/callback'};
 const configs=()=>({steam:{enabled:true},discord:{enabled:!!discord.clientId&&!!discord.clientSecret},xbox:{enabled:!!xbox.clientId&&!!xbox.clientSecret},epic:{enabled:!!epic.clientId&&!!epic.clientSecret}});
 const cleanup=()=>{for(const [id,job]of intents)if(job.expires<=now()){intents.delete(id);states.delete(digest(job.state));}};
 async function ready(){if(!store||!await store.ready())throw Error('identity_store_unavailable');}
 const error=(res,e)=>res.status(e.message==='identity_conflict'?409:503).json({error:e.message==='identity_conflict'?'This platform account is already linked to a ChainLens ID, or you already linked another account from this platform. Unlink it first.':'Account linking is not available yet. Try again after the service update.'});
 app.get('/api/nexus/identities',guard,session,async(req,res)=>{try{await ready();res.json({links:await store.list(req.user.sub),providers:configs()});}catch(e){error(res,e);}});
 app.get('/api/nexus/identities/friends',guard,session,async(req,res)=>{try{await ready();const ids=await getFriendIds(req.user.sub),rows=await store.friends(ids);res.json({links:rows.map(row=>({from:'chainlens:'+row.user_id,to:row.provider+':'+identity(row.provider,row.provider_id),verified:true}))});}catch(e){error(res,e);}});
 app.delete('/api/nexus/identities/:provider',guard,session,async(req,res)=>{if(!Object.hasOwn(configs(),req.params.provider))return res.status(400).json({error:'Unsupported platform.'});try{await ready();await store.unlink(req.user.sub,req.params.provider);res.json({unlinked:true});}catch(e){error(res,e);}});
 app.post('/api/nexus/identities/link/:provider',guard,session,async(req,res)=>{
  cleanup();const provider=req.params.provider;if(!configs()[provider]?.enabled)return res.status(503).json({error:'This platform connection is not configured yet.'});if(intents.size>=2000)return res.status(429).json({error:'Try again shortly.'});
  try{await ready();const expectedId=req.body?.expectedId?identity(provider,req.body.expectedId):null,id=random(),state='nxl_'+random(),verifier=crypto.randomBytes(48).toString('base64url'),job={id,state,verifier,provider,expectedId,owner:req.user.sub,sessionKey:req.nexusSocialSession.key,expires:now()+600000,status:'pending'};
   const urls={steam:STEAM,discord:'https://discord.com/oauth2/authorize',xbox:'https://login.microsoftonline.com/consumers/oauth2/v2.0/authorize',epic:'https://www.epicgames.com/id/authorize'},url=new URL(urls[provider]);
   if(provider==='steam'){const returnTo=new URL(callbacks.steam);returnTo.searchParams.set('state',state);job.returnTo=returnTo.href;url.search=new URLSearchParams({'openid.ns':NS,'openid.mode':'checkid_setup','openid.return_to':job.returnTo,'openid.realm':origin+'/','openid.identity':NS+'/identifier_select','openid.claimed_id':NS+'/identifier_select'}).toString();}
   else if(provider==='xbox')url.search=new URLSearchParams({client_id:xbox.clientId,redirect_uri:callbacks.xbox,response_type:'code',scope:'XboxLive.signin',state,code_challenge:crypto.createHash('sha256').update(verifier).digest('base64url'),code_challenge_method:'S256'}).toString();
   else if(provider==='epic')url.search=new URLSearchParams({client_id:epic.clientId,redirect_uri:callbacks.epic,response_type:'code',scope:'basic_profile friends_list',state}).toString();
   else url.search=new URLSearchParams({client_id:discord.clientId,redirect_uri:callbacks.discord,response_type:'code',scope:'identify',state,code_challenge:crypto.createHash('sha256').update(verifier).digest('base64url'),code_challenge_method:'S256',prompt:'consent'}).toString();
   intents.set(id,job);states.set(digest(state),id);res.json({intent_id:id,authorization_url:url.href,expires_at:job.expires});
  }catch(e){error(res,e);}
 });
 app.get('/api/nexus/identities/link/:id',guard,session,(req,res)=>{cleanup();const job=intents.get(req.params.id);if(!job||job.owner!==req.user.sub||job.sessionKey!==req.nexusSocialSession.key)return res.status(404).json({error:'Link request expired. Start again.'});res.json({status:job.status,provider:job.provider,...(job.result?{provider_id:job.result}:{}),...(job.error?{error:job.error}:{})});});
 async function json(url,options={}){const response=await fetchImpl(url,{...options,signal:AbortSignal.timeout(12000),redirect:'error'});if(!response.ok)throw Error('invalid_proof');return response.json();}
 async function xboxIdentity(query,job){
  const tokens=await json('https://login.microsoftonline.com/consumers/oauth2/v2.0/token',{method:'POST',body:new URLSearchParams({client_id:xbox.clientId,client_secret:xbox.clientSecret,code:String(query.code||''),grant_type:'authorization_code',redirect_uri:callbacks.xbox,code_verifier:job.verifier,scope:'XboxLive.signin'})});
  if(typeof tokens.access_token!=='string')throw Error('invalid_proof');
  const headers={'Content-Type':'application/json','x-xbl-contract-version':'1'},user=await json('https://user.auth.xboxlive.com/user/authenticate',{method:'POST',headers,body:JSON.stringify({RelyingParty:'http://auth.xboxlive.com',TokenType:'JWT',Properties:{AuthMethod:'RPS',SiteName:'user.auth.xboxlive.com',RpsTicket:'d='+tokens.access_token}})});
  if(typeof user.Token!=='string')throw Error('invalid_proof');
  const xsts=await json('https://xsts.auth.xboxlive.com/xsts/authorize',{method:'POST',headers,body:JSON.stringify({Properties:{SandboxId:'RETAIL',UserTokens:[user.Token]},RelyingParty:'http://xboxlive.com',TokenType:'JWT'})});
  const claims=xsts.DisplayClaims?.xui?.[0],id=identity('xbox',claims?.xid),expiresAt=Date.parse(xsts.NotAfter);if(typeof xsts.Token!=='string'||!/^\d{1,32}$/.test(claims?.uhs||'')||!Number.isFinite(expiresAt)||expiresAt<=now())throw Error('invalid_proof');
  return {id,session:{provider:'xbox',accountId:id,token:xsts.Token,userHash:claims.uhs,expiresAt}};
 }
 async function epicIdentity(query){
  const tokens=await json('https://api.epicgames.dev/epic/oauth/v2/token',{method:'POST',headers:{Authorization:'Basic '+Buffer.from(epic.clientId+':'+epic.clientSecret).toString('base64')},body:new URLSearchParams({grant_type:'authorization_code',code:String(query.code||''),redirect_uri:callbacks.epic,scope:'basic_profile friends_list'})});
  const id=identity('epic',tokens.account_id),expiresAt=Date.parse(tokens.expires_at);if(tokens.client_id!==epic.clientId||typeof tokens.access_token!=='string'||!Number.isFinite(expiresAt)||expiresAt<=now())throw Error('invalid_proof');
  return {id,session:{provider:'epic',accountId:id,token:tokens.access_token,expiresAt}};
 }
 async function providerIdentity(provider,query,job){
  if(provider!=='steam'&&(typeof query.code!=='string'||!query.code.length||query.code.length>4096))throw Error('invalid_proof');
  if(provider==='xbox')return xboxIdentity(query,job);if(provider==='epic')return epicIdentity(query);
  if(provider==='steam'){
   const signed=String(query['openid.signed']||'').split(','),required=['op_endpoint','claimed_id','identity','return_to','response_nonce','assoc_handle'];
   if(query['openid.ns']!==NS||query['openid.mode']!=='id_res'||query['openid.op_endpoint']!==STEAM||query['openid.return_to']!==job.returnTo||query['openid.identity']!==query['openid.claimed_id']||!required.every(field=>signed.includes(field)))throw Error('invalid_proof');
   const id=String(query['openid.claimed_id']||'').match(/^https:\/\/steamcommunity\.com\/openid\/id\/(7656119\d{10})$/)?.[1],nonce=Date.parse(String(query['openid.response_nonce']).slice(0,20));identity('steam',id);if(!Number.isFinite(nonce)||Math.abs(now()-nonce)>300000)throw Error('invalid_proof');
   const body=new URLSearchParams();for(const [key,value]of Object.entries(query))if(key.startsWith('openid.')&&typeof value==='string'&&value.length<5000)body.set(key,value);body.set('openid.mode','check_authentication');const response=await fetchImpl(STEAM,{method:'POST',body,signal:AbortSignal.timeout(12000),redirect:'error'});if(!response.ok||!/^is_valid:true\r?$/m.test((await response.text()).slice(0,10000)))throw Error('invalid_proof');return id;
  }
  if(typeof query.code!=='string'||query.code.length>4096)throw Error('invalid_proof');
  const response=await fetchImpl('https://discord.com/api/oauth2/token',{method:'POST',body:new URLSearchParams({client_id:discord.clientId,client_secret:discord.clientSecret,code:query.code,grant_type:'authorization_code',redirect_uri:callbacks.discord,code_verifier:job.verifier}),signal:AbortSignal.timeout(12000),redirect:'error'});if(!response.ok)throw Error('invalid_proof');const tokens=await response.json();if(typeof tokens.access_token!=='string')throw Error('invalid_proof');
  const user=await fetchImpl('https://discord.com/api/v10/users/@me',{headers:{Authorization:'Bearer '+tokens.access_token},signal:AbortSignal.timeout(12000),redirect:'error'});if(!user.ok)throw Error('invalid_proof');return identity('discord',(await user.json()).id);
 }
 async function callback(provider,req,res){cleanup();res.set({'Cache-Control':'no-store','Referrer-Policy':'no-referrer','Content-Security-Policy':"default-src 'none'; base-uri 'none'; frame-ancestors 'none'"});const state=typeof req.query.state==='string'?req.query.state:'',id=states.get(digest(state)),job=intents.get(id);states.delete(digest(state));if(!job||job.status!=='pending'||job.provider!==provider)return res.status(400).send('This account link request is invalid or expired. Return to Nexus and start again.');job.status='verifying';try{if(req.query.error||!await validateSession(job.sessionKey,job.owner))throw Error('invalid_proof');const proof=await providerIdentity(provider,req.query,job),providerId=typeof proof==='string'?proof:proof.id;if(job.expectedId&&providerId!==job.expectedId)throw Error('account_mismatch');await store.link(job.owner,provider,providerId);job.result=providerId;if(proof.session)job.desktopSession=proof.session;job.status='linked';res.send('Account linked to your ChainLens ID. Return to The Nexus. You can close this tab.');}catch(e){job.status='error';job.error=e.message==='identity_conflict'?'This account is already linked. Unlink it from the other ChainLens ID first.':e.message==='account_mismatch'?'Sign in with the same platform account connected in Nexus.':'Account verification failed or was canceled. Start again from Nexus.';res.status(400).send(job.error);}}
 app.get('/api/nexus/identities/link/:id/session',guard,session,(req,res)=>{cleanup();const job=intents.get(req.params.id);if(!job||job.owner!==req.user.sub||job.sessionKey!==req.nexusSocialSession.key||job.status!=='linked'||!job.desktopSession)return res.status(404).json({error:'Platform session unavailable. Reconnect this account.'});const session=job.desktopSession;delete job.desktopSession;res.set({'Cache-Control':'no-store','Pragma':'no-cache'}).json(session);});
 app.get('/auth/nexus/link/xbox/callback',(req,res)=>callback('xbox',req,res));
 app.get('/auth/nexus/link/epic/callback',(req,res)=>callback('epic',req,res));
 app.get('/auth/nexus/link/steam/callback',(req,res)=>callback('steam',req,res));
 return {callback};
}
module.exports={createIdentityStore,mountIdentities,identity};
