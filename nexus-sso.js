'use strict';
const crypto=require('node:crypto'),express=require('express');
const CLIENT='nexus-desktop',SESSION_MS=7*24*60*60*1000;
const hash=value=>crypto.createHash('sha256').update(value).digest('hex');
const random=()=>crypto.randomBytes(32).toString('hex');
function validRedirect(value){try{const u=new URL(value);return u.protocol==='http:'&&u.hostname==='127.0.0.1'&&Number(u.port)>=1024&&Number(u.port)<=65535&&u.pathname==='/chainlens/callback'&&!u.search&&!u.hash&&!u.username&&!u.password&&u.href===value;}catch{return false;}}
const profile=user=>({id:user.id,name:String(user.display_name||user.username||'ChainLens player').replace(/[\u0000-\u001f\u007f]/g,'').slice(0,64),avatar_url:typeof user.avatar_url==='string'?user.avatar_url:null,avatar_nft_key:user.avatar_nft_key||null});
function createNexusSessionStore(db){if(!db)return null;return {
 async ready(){const {error}=await db.from('cl_nexus_sessions').select('token_hash').limit(0);return !error;},
 async put(key,row){const {error}=await db.from('cl_nexus_sessions').insert({token_hash:key,user_id:row.userId,client_id:CLIENT,expires_at:new Date(row.expires).toISOString()});if(error)throw Error('session_store_unavailable');},
 async get(key){const {data,error}=await db.from('cl_nexus_sessions').select('user_id,client_id,expires_at').eq('token_hash',key).maybeSingle();if(error)throw Error('session_store_unavailable');return data&&data.client_id===CLIENT?{userId:data.user_id,expires:Date.parse(data.expires_at)}:null;},
 async delete(key){const {error}=await db.from('cl_nexus_sessions').delete().eq('token_hash',key);if(error)throw Error('session_store_unavailable');}
};}
const SOCIAL_ROUTES=[
 ['GET',/^\/(?:status|friends|presence|unread)$/],['POST',/^\/(?:friends|presence|read)$/],
 ['POST',/^\/friends\/[1-9]\d*\/accept$/],['DELETE',/^\/friends\/[1-9]\d*$/],
 ['GET',/^\/friends\/[0-9a-f-]{36}\/messages$/i],['POST',/^\/friends\/[0-9a-f-]{36}\/messages$/i],
 ['DELETE',/^\/friends\/[0-9a-f-]{36}\/messages\/[1-9]\d*$/i]
];
function mountNexusSso(app,{requireAuth,getUser,getAccess,store,frontendUrl,fetchImpl=globalThis.fetch,giphyKey=process.env.GIPHY_API_KEY,now=Date.now}){
 const frontend=new URL(frontendUrl),codes=new Map(),limits=new Map();
 if(frontend.protocol!=='https:'&&!(frontend.protocol==='http:'&&['localhost','127.0.0.1'].includes(frontend.hostname)))throw Error('Nexus consent requires HTTPS.');
 const valid=input=>input&&input.client_id===CLIENT&&input.response_type==='code'&&validRedirect(input.redirect_uri)&&input.code_challenge_method==='S256'&&/^[A-Za-z0-9_-]{43}$/.test(input.code_challenge||'')&&/^[a-f0-9]{64}$/.test(input.state||'');
 const guard=(req,res,next)=>{res.set({'Cache-Control':'no-store','Referrer-Policy':'no-referrer'});for(const map of [codes,limits])for(const [key,row]of map)if(row.expires<=now())map.delete(key);const key=req.ip||req.socket.remoteAddress,limit=limits.get(key)||{count:0,expires:now()+60000};if(limits.size>10000||codes.size>=2000||++limit.count>120)return res.status(429).json({error:'Too many requests. Try again shortly.'});limits.set(key,limit);next();};
 const session=async(req,res,next)=>{
  const token=String(req.headers.authorization||'').match(/^Bearer (nxs_[a-f0-9]{64})$/)?.[1];if(!token||!store)return res.status(401).json({error:'Sign in to ChainLens again.'});
  try{const key=hash(token),row=await store.get(key);if(!row||!Number.isFinite(row.expires)||row.expires<=now())return res.status(401).json({error:'Your ChainLens session has expired. Sign in again.'});const user=await getUser(row.userId);if(!user||user.id!==row.userId)return res.status(401).json({error:'Account is no longer available.'});req.nexusSocialSession={key,expires:row.expires,user:profile(user)};req.user={sub:user.id};next();}catch{res.status(503).json({error:'ChainLens is temporarily unavailable.'});}
 };
 app.get('/api/nexus/config',guard,async(req,res)=>{try{const enabled=!!store&&await store.ready();res.status(enabled?200:503).json({enabled,client_id:CLIENT,scope:'social',authorization_endpoint:new URL('/auth/nexus',frontend).href,token_endpoint:new URL('/api/nexus/token',frontend).href,redirect_type:'loopback'});}catch{res.status(503).json({enabled:false});}});
 app.get('/auth/nexus',guard,async(req,res)=>{if(!valid(req.query))return res.status(400).send('Invalid Nexus sign-in request. Start again from The Nexus.');try{if(!store||!await store.ready())return res.status(503).send('Nexus sign-in is temporarily unavailable.');const target=new URL('/nexus-connect.html',frontend);for(const key of ['client_id','redirect_uri','response_type','state','code_challenge','code_challenge_method'])target.searchParams.set(key,req.query[key]);res.redirect(target.href);}catch{res.status(503).send('Sign-in is temporarily unavailable.');}});
 app.post('/api/nexus/authorize',guard,requireAuth,async(req,res)=>{
  if(req.headers.origin!==frontend.origin)return res.status(403).json({error:'Invalid origin.'});if(!valid(req.body))return res.status(400).json({error:'Invalid sign-in request.'});
  try{if(!store||!await store.ready())return res.status(503).json({error:'Sign-in is temporarily unavailable.'});const user=await getUser(req.user.sub);if(!user||user.id!==req.user.sub)return res.status(401).json({error:'Account is unavailable.'});const code=random();codes.set(hash(code),{userId:user.id,redirect:req.body.redirect_uri,challenge:req.body.code_challenge,expires:now()+60000});const target=new URL(req.body.redirect_uri);target.searchParams.set('code',code);target.searchParams.set('state',req.body.state);res.json({redirect:target.href});}catch{res.status(503).json({error:'Sign-in is temporarily unavailable.'});}
 });
 app.post('/api/nexus/token',guard,express.urlencoded({extended:false,limit:'4kb'}),async(req,res)=>{
  const input=req.body||{},key=hash(String(input.code||'')),grant=codes.get(key);codes.delete(key);
  const proof=/^[A-Za-z0-9._~-]{43,128}$/.test(input.code_verifier||'')?crypto.createHash('sha256').update(input.code_verifier).digest('base64url'):'';
  if(!grant||grant.expires<=now()||input.grant_type!=='authorization_code'||input.client_id!==CLIENT||input.redirect_uri!==grant.redirect||proof!==grant.challenge)return res.status(400).json({error:'invalid_grant'});
  try{const user=await getUser(grant.userId);if(!user||user.id!==grant.userId)return res.status(401).json({error:'Account is unavailable.'});const token='nxs_'+random(),expires=now()+SESSION_MS;await store.put(hash(token),{userId:user.id,expires});res.json({access_token:token,token_type:'Bearer',expires_in:SESSION_MS/1000,user:profile(user),scope:'social'});}catch{res.status(503).json({error:'Sign-in is temporarily unavailable.'});}
 });
 app.get('/api/nexus/me',guard,session,async(req,res)=>{try{res.json({user:req.nexusSocialSession.user,expires_at:req.nexusSocialSession.expires,access:await getAccess(req.user.sub),gif_search:!!giphyKey});}catch{res.status(503).json({error:'Could not load chat access.'});}});
 app.post('/api/nexus/logout',guard,session,async(req,res)=>{try{await store.delete(req.nexusSocialSession.key);res.json({signed_out:true});}catch{res.status(503).json({error:'Could not revoke this session. Try again.'});}});
 app.get('/api/nexus/gifs',guard,session,async(req,res)=>{
  try{if(!(await getAccess(req.user.sub)).eligible)return res.status(403).json({error:'Unlock ChainLens chat from your profile first.'});if(!giphyKey)return res.status(503).json({error:'GIF search is unavailable. You can attach a GIPHY media link instead.'});const q=String(req.query.q||'').trim().slice(0,120),url=new URL(`https://api.giphy.com/v1/gifs/${q?'search':'trending'}`);url.search=new URLSearchParams({api_key:giphyKey,limit:'24',rating:'pg',...(q?{q}:{})}).toString();const response=await fetchImpl(url,{signal:AbortSignal.timeout(10000)});if(!response.ok)return res.status(503).json({error:'GIF search is temporarily unavailable.'});const data=await response.json();const media=value=>{try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password&&(u.hostname==='giphy.com'||u.hostname.endsWith('.giphy.com'))?u.href:null;}catch{return null;}};res.json({gifs:(data.data||[]).slice(0,24).map(gif=>({id:String(gif.id).slice(0,100),title:String(gif.title||'GIF').slice(0,150),url:media(gif.images?.original?.url),preview:media(gif.images?.fixed_width?.url||gif.images?.original?.url)})).filter(gif=>gif.url&&gif.preview)});}catch{res.status(503).json({error:'GIF search is temporarily unavailable.'});}
 });
 // Rewrite only these narrowly allowlisted methods/paths, then reuse the existing
 // friendship, eligibility, block, presence, DM and read-cursor controllers.
 app.use((req,res,next)=>{
  const prefix='/api/nexus/social';if(!req.path.startsWith(prefix+'/'))return next();const suffix=req.path.slice(prefix.length);
  if(!SOCIAL_ROUTES.some(([method,pattern])=>method===req.method&&pattern.test(suffix)))return res.status(404).json({error:'Unsupported social operation.'});
  guard(req,res,()=>session(req,res,()=>{const query=req.url.includes('?')?req.url.slice(req.url.indexOf('?')):'';req.url='/api/chat'+suffix+query;next();}));
 });
}
module.exports={mountNexusSso,createNexusSessionStore,validRedirect,CLIENT};
