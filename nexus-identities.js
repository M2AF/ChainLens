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
// offline_access makes Microsoft issue a refresh token so Nexus can renew Xbox sessions.
const XBOX_SCOPE='XboxLive.signin offline_access',MS_TOKEN='https://login.microsoftonline.com/consumers/oauth2/v2.0/token',EPIC_TOKEN='https://api.epicgames.dev/epic/oauth/v2/token';
// Device proof: Xbox issues device tokens for a self-generated P-256 key, and every request that
// presents the key must carry a Signature header (policy 1, Windows-epoch timestamp, ES256 r||s).
const XBOX_DEVICE='https://device.auth.xboxlive.com/device/authenticate',XBOX_XSTS='https://xsts.auth.xboxlive.com/xsts/authorize';
function xboxSigner(now=Date.now){const {publicKey,privateKey}=crypto.generateKeyPairSync('ec',{namedCurve:'P-256'}),jwk={...publicKey.export({format:'jwk'}),alg:'ES256',use:'sig'};
 return {jwk,sign(url,body,authorization=''){const stamp=(BigInt(Math.floor(now()/1000))+11644473600n)*10000000n,head=Buffer.alloc(14);head.writeInt32BE(1,0);head.writeUInt8(0,4);head.writeBigUInt64BE(stamp,5);head.writeUInt8(0,13);
  const signed=Buffer.concat([head,Buffer.from('POST\0'+new URL(url).pathname+'\0'+authorization+'\0'+body+'\0','utf8')]),signature=crypto.sign('SHA256',signed,{key:privateKey,dsaEncoding:'ieee-p1363'}),header=Buffer.alloc(12);header.writeInt32BE(1,0);header.writeBigUInt64BE(stamp,4);return Buffer.concat([header,signature]).toString('base64');}};}
const validRefreshToken=value=>typeof value==='string'&&value.length>0&&value.length<=16384&&!/[\r\n]/.test(value);
// Refresh tokens are handed to the desktop (encrypted there) and never stored by ChainLens.
const refreshFields=(token,expiresAt=null)=>validRefreshToken(token)?{refreshToken:token,...(expiresAt?{refreshExpiresAt:expiresAt}:{})}:{};
function mountIdentities(app,{guard,session,store,frontendUrl,getFriendIds,validateSession,fetchImpl=fetch,now=Date.now,discord={},xbox={},epic={}}){
 const origin=new URL(frontendUrl).origin,intents=new Map(),states=new Map(),renewals=new Map();
 const epicAuth=()=>'Basic '+Buffer.from(epic.clientId+':'+epic.clientSecret).toString('base64');
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
   else if(provider==='xbox')url.search=new URLSearchParams({client_id:xbox.clientId,redirect_uri:callbacks.xbox,response_type:'code',scope:XBOX_SCOPE,state,code_challenge:crypto.createHash('sha256').update(verifier).digest('base64url'),code_challenge_method:'S256'}).toString();
   else if(provider==='epic')url.search=new URLSearchParams({client_id:epic.clientId,redirect_uri:callbacks.epic,response_type:'code',scope:'basic_profile friends_list presence',prompt:'consent',state}).toString();
   else url.search=new URLSearchParams({client_id:discord.clientId,redirect_uri:callbacks.discord,response_type:'code',scope:'identify',state,code_challenge:crypto.createHash('sha256').update(verifier).digest('base64url'),code_challenge_method:'S256',prompt:'consent'}).toString();
   intents.set(id,job);states.set(digest(state),id);res.json({intent_id:id,authorization_url:url.href,expires_at:job.expires});
  }catch(e){error(res,e);}
 });
 app.get('/api/nexus/identities/link/:id',guard,session,(req,res)=>{cleanup();const job=intents.get(req.params.id);if(!job||job.owner!==req.user.sub||job.sessionKey!==req.nexusSocialSession.key)return res.status(404).json({error:'Link request expired. Start again.'});res.json({status:job.status,provider:job.provider,...(job.result?{provider_id:job.result}:{}),...(job.error?{error:job.error}:{})});});
 async function json(url,options={}){const response=await fetchImpl(url,{...options,signal:AbortSignal.timeout(12000),redirect:'error'});if(!response.ok){if(url==='https://api.epicgames.dev/epic/oauth/v2/token'){let detail;try{detail=await response.json();}catch{}if(detail?.errorCode==='errors.com.epicgames.oauth.corrective_action_required')throw Error('epic_consent_required');if(detail?.error==='invalid_client'||detail?.errorCode==='errors.com.epicgames.account.invalid_client_credentials')throw Error('epic_client_configuration');if(detail?.error==='invalid_grant')throw Object.assign(Error('epic_code_expired'),{status:response.status});}throw Object.assign(Error('invalid_proof'),{status:response.status});}return response.json();}
 async function xboxIdentity(query,job){
  return xboxSession(await json(MS_TOKEN,{method:'POST',body:new URLSearchParams({client_id:xbox.clientId,client_secret:xbox.clientSecret,code:String(query.code||''),grant_type:'authorization_code',redirect_uri:callbacks.xbox,code_verifier:job.verifier,scope:XBOX_SCOPE})}));
 }
 async function xboxSession(tokens){
  if(typeof tokens.access_token!=='string')throw Error('invalid_proof');
  const headers={'Content-Type':'application/json','x-xbl-contract-version':'1'},user=await json('https://user.auth.xboxlive.com/user/authenticate',{method:'POST',headers,body:JSON.stringify({RelyingParty:'http://auth.xboxlive.com',TokenType:'JWT',Properties:{AuthMethod:'RPS',SiteName:'user.auth.xboxlive.com',RpsTicket:'d='+tokens.access_token}})});
  if(typeof user.Token!=='string')throw Error('invalid_proof');
  // Try to add device proof (Xbox stores direct messages only from proven devices); fall back to a user-only token.
  let xsts=null,deviceProof=false;
  try{const signer=xboxSigner(now),deviceBody=JSON.stringify({Properties:{AuthMethod:'ProofOfPossession',Id:'{'+crypto.randomUUID()+'}',DeviceType:'Win32',SerialNumber:'{'+crypto.randomUUID()+'}',Version:'10.0.0',ProofKey:signer.jwk},RelyingParty:'http://auth.xboxlive.com',TokenType:'JWT'});
   const device=await json(XBOX_DEVICE,{method:'POST',headers:{...headers,'Cache-Control':'no-store, must-revalidate, no-cache',Signature:signer.sign(XBOX_DEVICE,deviceBody)},body:deviceBody});
   if(typeof device.Token!=='string')throw Error('invalid_proof');
   const body=JSON.stringify({RelyingParty:'http://xboxlive.com',TokenType:'JWT',Properties:{UserTokens:[user.Token],DeviceToken:device.Token,ProofKey:signer.jwk,SandboxId:'RETAIL'}});
   const proven=await json(XBOX_XSTS,{method:'POST',headers:{...headers,'Cache-Control':'no-store, must-revalidate, no-cache',Signature:signer.sign(XBOX_XSTS,body)},body});
   if(typeof proven.Token==='string'){xsts=proven;deviceProof=true;}
  }catch{/* Device proof is best effort. */}
  if(!xsts)xsts=await json(XBOX_XSTS,{method:'POST',headers,body:JSON.stringify({Properties:{SandboxId:'RETAIL',UserTokens:[user.Token]},RelyingParty:'http://xboxlive.com',TokenType:'JWT'})});
  const claims=xsts.DisplayClaims?.xui?.[0],id=identity('xbox',claims?.xid),expiresAt=Date.parse(xsts.NotAfter);if(typeof xsts.Token!=='string'||!/^\d{1,32}$/.test(claims?.uhs||'')||!Number.isFinite(expiresAt)||expiresAt<=now())throw Error('invalid_proof');
  return {id,session:{provider:'xbox',accountId:id,token:xsts.Token,userHash:claims.uhs,expiresAt,deviceProof,...refreshFields(tokens.refresh_token)}};
 }
 async function epicIdentity(query){
  return epicSession(await json(EPIC_TOKEN,{method:'POST',headers:{Authorization:epicAuth()},body:new URLSearchParams({grant_type:'authorization_code',code:String(query.code||''),redirect_uri:callbacks.epic,scope:'basic_profile friends_list presence'})}));
 }
 function epicSession(tokens){
  let id;try{id=identity('epic',tokens.account_id);}catch{throw Error('epic_identity_missing');}const expiresAt=Date.parse(tokens.expires_at);if(tokens.client_id!==epic.clientId)throw Error('epic_client_mismatch');if(typeof tokens.access_token!=='string'||!tokens.access_token)throw Error('epic_token_missing');if(!Number.isFinite(expiresAt)||expiresAt<=now())throw Error('epic_expiry_invalid');
  const refreshExpiresAt=Date.parse(tokens.refresh_expires_at);
  return {id,session:{provider:'epic',accountId:id,token:tokens.access_token,expiresAt,...refreshFields(tokens.refresh_token,Number.isFinite(refreshExpiresAt)&&refreshExpiresAt>now()?refreshExpiresAt:null)}};
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
 async function callback(provider,req,res){cleanup();res.set({'Cache-Control':'no-store','Referrer-Policy':'no-referrer','Content-Security-Policy':"default-src 'none'; base-uri 'none'; frame-ancestors 'none'"});const state=typeof req.query.state==='string'?req.query.state:'',id=states.get(digest(state)),job=intents.get(id);states.delete(digest(state));if(!job||job.status!=='pending'||job.provider!==provider)return res.status(400).send('This account link request is invalid or expired. Return to Nexus and start again.');job.status='verifying';try{if(req.query.error||!await validateSession(job.sessionKey,job.owner))throw Error('invalid_proof');const proof=await providerIdentity(provider,req.query,job),providerId=typeof proof==='string'?proof:proof.id;if(job.expectedId&&providerId!==job.expectedId)throw Error('account_mismatch');await store.link(job.owner,provider,providerId);job.result=providerId;if(proof.session)job.desktopSession=proof.session;job.status='linked';res.send('Account linked to your ChainLens ID. Return to The Nexus. You can close this tab.');}catch(e){job.status='error';const reasons={epic_consent_required:'Epic needs additional permission approval. Start a new sign-in and complete the Epic consent screen.',epic_identity_missing:'Epic did not return a valid account identity.',epic_client_mismatch:'Epic returned a token for a different application client.',epic_token_missing:'Epic did not return an account access token.',epic_expiry_invalid:'Epic returned an invalid token expiration.',identity_store_unavailable:'Your platform account was verified, but ChainLens could not save the link. Please retry.'};job.error=reasons[e.message]||(e.message==='epic_client_configuration'?'Epic could not authenticate The Nexus. Its Epic client configuration needs updating.':e.message==='epic_code_expired'?'Epic sign-in expired or was already used. Start a new sign-in from Nexus.':e.message==='identity_conflict'?'This account is already linked. Unlink it from the other ChainLens ID first.':e.message==='account_mismatch'?'Sign in with the same platform account connected in Nexus.':'Account verification failed or was canceled. Start again from Nexus.');console.warn('Nexus account verification failed',{provider,reason:Object.hasOwn(reasons,e.message)||['epic_client_configuration','epic_code_expired','identity_conflict','account_mismatch'].includes(e.message)?e.message:'invalid_proof'});res.status(400).send(job.error);}}
 app.get('/api/nexus/identities/link/:id/session',guard,session,(req,res)=>{cleanup();const job=intents.get(req.params.id);if(!job||job.owner!==req.user.sub||job.sessionKey!==req.nexusSocialSession.key||job.status!=='linked'||!job.desktopSession)return res.status(404).json({error:'Platform session unavailable. Reconnect this account.'});const session=job.desktopSession;delete job.desktopSession;res.set({'Cache-Control':'no-store','Pragma':'no-cache'}).json(session);});
 // Exchanges a desktop-held refresh token for a new session. The caller must be signed in
 // to the ChainLens ID the platform account is linked to, and the renewed identity must be
 // that same linked account.
 app.post('/api/nexus/identities/:provider/session',guard,session,async(req,res)=>{
  res.set({'Cache-Control':'no-store','Pragma':'no-cache'});
  const provider=req.params.provider;if(!['xbox','epic'].includes(provider)||!configs()[provider].enabled)return res.status(400).json({error:'Unsupported platform.'});
  const refreshToken=req.body?.refreshToken;let accountId;try{accountId=identity(provider,req.body?.accountId);}catch{return res.status(400).json({error:'Invalid platform session.'});}
  if(!validRefreshToken(refreshToken))return res.status(400).json({error:'Invalid platform session.'});
  const key=req.user.sub+':'+provider;if(now()-(renewals.get(key)||0)<10000)return res.status(429).json({error:'Try again shortly.'});renewals.set(key,now());if(renewals.size>5000)for(const [k,at]of renewals)if(now()-at>=10000)renewals.delete(k);
  try{await ready();const linked=(await store.list(req.user.sub)).some(row=>row.provider===provider&&String(row.provider_id).toLowerCase()===accountId);if(!linked)return res.status(403).json({error:'This account is no longer linked to your ChainLens ID. Reconnect it.',reconnect:true});}catch(e){return error(res,e);}
  try{
   const proof=provider==='xbox'
    ?await xboxSession(await json(MS_TOKEN,{method:'POST',body:new URLSearchParams({client_id:xbox.clientId,client_secret:xbox.clientSecret,grant_type:'refresh_token',refresh_token:refreshToken,scope:XBOX_SCOPE})}))
    :epicSession(await json(EPIC_TOKEN,{method:'POST',headers:{Authorization:epicAuth()},body:new URLSearchParams({grant_type:'refresh_token',refresh_token:refreshToken})}));
   if(proof.id!==accountId)return res.status(403).json({error:'This sign-in belongs to a different account. Reconnect it.',reconnect:true});
   res.json(proof.session);
  }catch(e){
   // A 400/401 from the provider means the grant was revoked or expired; anything else may be transient.
   // Never answer 401 here: Nexus treats a 401 as its own ChainLens sign-in expiring.
   if([400,401].includes(e.status))return res.status(403).json({error:'Your platform sign-in expired. Reconnect this account.',reconnect:true});
   console.warn('Nexus platform session renewal failed',{provider,status:e.status||null});res.status(503).json({error:'Platform sign-in is temporarily unavailable. Try again later.'});
  }
 });
 app.get('/auth/nexus/link/xbox/callback',(req,res)=>callback('xbox',req,res));
 app.get('/auth/nexus/link/epic/callback',(req,res)=>callback('epic',req,res));
 app.get('/auth/nexus/link/steam/callback',(req,res)=>callback('steam',req,res));
 return {callback};
}
module.exports={xboxSigner,createIdentityStore,mountIdentities,identity};
