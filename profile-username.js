const { isUuid } = require('./chat-service');
function normalizeUsername(value) {
  if(typeof value !== 'string') throw Object.assign(new Error('Username must be text'),{status:400});
  const username=value.trim().replace(/^@/,'').toLowerCase();
  if(!/^[a-z0-9_]{3,24}$/.test(username)) throw Object.assign(new Error('Use 3–24 characters: a–z, 0–9 or underscores.'),{status:400});
  return username;
}
function mountUsernameRoutes(app,{db,requireAuth,rateLimit}) {
  app.put('/api/profile/username',rateLimit,requireAuth,async(req,res)=>{
    if(!isUuid(req.user?.sub))return res.status(401).json({error:'Sign in to claim a username.'});
    let username;try{username=normalizeUsername(req.body?.username);}catch(error){return res.status(error.status).json({error:error.message});}
    if(!db)return res.status(503).json({error:'Username claims are temporarily unavailable.'});
    try {
      // One atomic update; the unique index arbitrates simultaneous claims.
      const query=db.from('cl_users').update({username}).eq('id',req.user.sub).select('id,username').maybeSingle();
      const {data,error}=await (typeof query.abortSignal==='function'?query.abortSignal(AbortSignal.timeout(8000)):query);
      if(error){if(error.code==='23505')return res.status(409).json({error:'That username is already claimed. Try another.'});throw error;}
      if(!data)return res.status(404).json({error:'Your ChainLens account could not be found.'});
      res.set('Cache-Control','no-store').json({id:data.id,username:data.username});
    }catch{res.status(503).json({error:'Username claims are temporarily unavailable. Your username was not confirmed.'});}
  });
}
module.exports={normalizeUsername,mountUsernameRoutes};
