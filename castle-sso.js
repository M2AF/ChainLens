// Separate public native client. No ChainLens web JWT or provider token leaves its origin.
'use strict';
const crypto=require('node:crypto');
const express=require('express');
const CLIENT='castle-siege-android';
const REDIRECT='com.chainlens.ageofempirescastlesiege://auth/callback';
const hash=value=>crypto.createHash('sha256').update(value).digest('hex');
const random=()=>crypto.randomBytes(32).toString('hex');
const SESSION_MS=7*24*60*60*1000;
const publicProfile=p=>({id:p.id,name:String(p.display_name||p.username||'Player').replace(/[\u0000-\u001f\u007f]/g,'').slice(0,64)});

function createCastleSessionStore(db){
 if(!db)return null;
 return {
  async ready(){const {error}=await db.from('cl_castle_sessions').select('token_hash').limit(0);return !error;},
  async put(key,row){const {error}=await db.from('cl_castle_sessions').insert({token_hash:key,user_id:row.userId,client_id:CLIENT,expires_at:new Date(row.expires).toISOString()});if(error)throw Error('session_store_unavailable');},
  async get(key){const {data,error}=await db.from('cl_castle_sessions').select('user_id,client_id,expires_at').eq('token_hash',key).maybeSingle();if(error)throw Error('session_store_unavailable');return data&&data.client_id===CLIENT?{userId:data.user_id,expires:Date.parse(data.expires_at)}:null;},
  async delete(key){const {error}=await db.from('cl_castle_sessions').delete().eq('token_hash',key);if(error)throw Error('session_store_unavailable');},
  async prune(cutoff){const {error}=await db.from('cl_castle_sessions').delete().lt('expires_at',new Date(cutoff).toISOString());if(error)throw Error('session_store_unavailable');}
 };
}
function mountCastleSso(app,{requireAuth,getUser,store,frontendUrl,now=Date.now}){
 const frontend=new URL(frontendUrl),codes=new Map(),limits=new Map();
 if(frontend.protocol!=='https:'&&!['localhost','127.0.0.1'].includes(frontend.hostname))throw Error('Castle login requires HTTPS');
 const valid=input=>input&&input.client_id===CLIENT&&input.redirect_uri===REDIRECT&&input.response_type==='code'&&
  input.code_challenge_method==='S256'&&/^[A-Za-z0-9_-]{43}$/.test(input.code_challenge||'')&&/^[a-f0-9]{64}$/.test(input.state||'');
 const guard=(req,res,next)=>{
  res.set({'Cache-Control':'no-store','Referrer-Policy':'no-referrer'});
  for(const map of [codes,limits])for(const [key,value]of map)if(value.expires<=now())map.delete(key);
  const key=req.ip||req.socket.remoteAddress,limit=limits.get(key)||{count:0,expires:now()+60000};limits.set(key,limit);
  if(++limit.count>120||codes.size>=2000)return res.status(429).json({error:'rate_limited'});
  next();
 };
 let lastPruned=0;
 const available=async()=>{
  const ready=!!store&&await store.ready();
  if(ready&&store.prune&&now()-lastPruned>3600000){lastPruned=now();Promise.resolve(store.prune(now())).catch(()=>{});}
  return ready;
 };
 app.get('/api/castle-siege/config',guard,async(req,res)=>{
  try{const enabled=await available();res.status(enabled?200:503).json({enabled,client_id:CLIENT,redirect_uri:REDIRECT,
   authorization_endpoint:new URL('/auth/castle-siege',frontend).toString(),token_endpoint:'/api/castle-siege/token',
   capabilities:{profile:true,cloud_saves:false,friends:false,multiplayer:false}});}catch{res.status(503).json({enabled:false,error:'service_unavailable'});}
 });
 app.get('/auth/castle-siege',guard,async(req,res)=>{
  if(!valid(req.query))return res.status(400).send('Invalid Castle Siege sign-in request.');
  try{if(!await available())return res.status(503).send('Castle Siege sign-in is not available yet. You can keep playing offline.');
   const target=new URL('/castle-connect.html',frontend);
   for(const key of ['client_id','redirect_uri','response_type','state','code_challenge','code_challenge_method'])target.searchParams.set(key,req.query[key]);
   res.redirect(target.toString());
  }catch{res.status(503).send('Castle Siege sign-in is temporarily unavailable.');}
 });
 app.post('/api/castle-siege/authorize',guard,requireAuth,async(req,res)=>{
  if(req.get('origin')!==frontend.origin)return res.status(403).json({error:'invalid_origin'});
  if(!valid(req.body))return res.status(400).json({error:'invalid_request'});
  try{
   if(!await available())return res.status(503).json({error:'service_unavailable'});
   const profile=await getUser(req.user.sub);
   if(!profile||profile.id!==req.user.sub)return res.status(401).json({error:'account_unavailable'});
   const code=random();codes.set(hash(code),{userId:profile.id,challenge:req.body.code_challenge,expires:now()+60000});
   const target=new URL(REDIRECT);target.searchParams.set('code',code);target.searchParams.set('state',req.body.state);
   res.json({redirect:target.toString()});
  }catch{res.status(503).json({error:'service_unavailable'});}
 });
 app.post('/api/castle-siege/token',guard,express.urlencoded({extended:false,limit:'4kb'}),async(req,res)=>{
  const input=req.body||{},key=hash(String(input.code||'')),grant=codes.get(key);codes.delete(key);
  const proof=/^[A-Za-z0-9._~-]{43,128}$/.test(input.code_verifier||'')?crypto.createHash('sha256').update(input.code_verifier).digest('base64url'):'';
  if(!grant||grant.expires<=now()||input.grant_type!=='authorization_code'||input.client_id!==CLIENT||input.redirect_uri!==REDIRECT||proof!==grant.challenge)return res.status(400).json({error:'invalid_grant'});
  try{
   const profile=await getUser(grant.userId);if(!profile||profile.id!==grant.userId)return res.status(401).json({error:'account_unavailable'});
   const token='csa_'+random(),expires=now()+SESSION_MS;
   await store.put(hash(token),{userId:profile.id,expires});
   res.json({access_token:token,token_type:'Bearer',expires_in:SESSION_MS/1000,user:publicProfile(profile)});
  }catch{res.status(503).json({error:'service_unavailable'});}
 });
 const gameSession=async(req,res,next)=>{
  const token=String(req.headers.authorization||'').match(/^Bearer (csa_[a-f0-9]{64})$/)?.[1];
  if(!token||!store)return res.status(401).json({error:'invalid_session'});
  try{const key=hash(token),session=await store.get(key);
   if(!session||!Number.isFinite(session.expires)||session.expires<=now())return res.status(401).json({error:'invalid_session'});
   const profile=await getUser(session.userId);if(!profile||profile.id!==session.userId)return res.status(401).json({error:'invalid_session'});
   req.castleSession={key,expires:session.expires,user:publicProfile(profile)};next();
  }catch{res.status(503).json({error:'service_unavailable'});}
 };
 app.get('/api/castle-siege/me',guard,gameSession,(req,res)=>res.json({user:req.castleSession.user,expires_at:req.castleSession.expires,
  capabilities:{profile:true,cloud_saves:false,friends:false,multiplayer:false}}));
 app.post('/api/castle-siege/logout',guard,gameSession,async(req,res)=>{
  try{await store.delete(req.castleSession.key);res.json({signed_out:true});}catch{res.status(503).json({error:'service_unavailable'});}
 });
}
module.exports={mountCastleSso,createCastleSessionStore,CLIENT,REDIRECT};
