const { isUuid, orderedFriendPair } = require('./chat-service');
const { favoriteKeys, artworkSnapshot } = require('./public-favorites');
async function blockedIds(db, id) {
  const { data, error } = await db.from('cl_user_blocks').select('blocker_id,blocked_id').or(`blocker_id.eq.${id},blocked_id.eq.${id}`);
  if (error) throw error;
  return new Set((data || []).map(row => row.blocker_id === id ? row.blocked_id : row.blocker_id));
}
const areBlocked = async (db,a,b) => (await blockedIds(db,a)).has(b);
function mountProfileCommunity(app, { db, rateLimit, requireAuth, resolveFavorite }) {
  const failed = res => res.status(503).json({ error:'Profile features are temporarily unavailable' });
  app.get('/api/profiles/:id/favorites', rateLimit, async (req,res) => {
    const id = req.params.id.toLowerCase(), offset = Number(req.query.offset || 0);
    if (!isUuid(id) || !Number.isInteger(offset) || offset < 0 || offset > 2000) return res.status(400).json({error:'Invalid gallery request'});
    if (!db) return failed(res);
    try {
      const {data:profile,error:profileError} = await db.from('cl_users').select('public_favorites').eq('id',id).maybeSingle();
      if (profileError) throw profileError;
      if (!profile) return res.status(404).json({error:'Profile not found'});
      res.set('Cache-Control','no-store');
      if (profile.public_favorites === false) return res.json({assets:[],hidden:true,total:0,nextOffset:null});
      const {data:filters,error} = await db.from('cl_asset_filters').select('entries').eq('user_id',id).maybeSingle();
      if (error) throw error;
      const keys = favoriteKeys(filters?.entries), page = keys.slice(offset,offset+24);
      let snapshots = [], wallets = [];
      if (page.length) {
        const result = await db.from('cl_favorite_artwork').select('key,asset').eq('user_id',id).in('key',page);
        if (result.error) throw result.error; snapshots = result.data || [];
        if (page.some(key => key.startsWith('solana:'))) {
          const links = await db.from('cl_wallets').select('chain,address').eq('user_id',id).eq('chain','solana');
          if (links.error) throw links.error; wallets = links.data || [];
        }
      }
      const queue = page.map((key,index) => ({key,index})), assets = new Array(page.length);
      await Promise.all(Array.from({length:Math.min(4,page.length)},async () => {
        while(queue.length) {
          const {key,index} = queue.shift();
          assets[index] = await resolveFavorite(key,wallets,snapshots.find(row => row.key === key)?.asset);
        }
      }));
      res.json({assets:assets.filter(Boolean),total:keys.length,nextOffset:offset+page.length < keys.length ? offset+page.length : null,hidden:false});
    } catch { failed(res); }
  });
  app.put('/api/profile/favorite-artwork', requireAuth, async (req,res) => {
    const incoming = req.body?.assets;
    if (!Array.isArray(incoming) || incoming.length > 100) return res.status(400).json({error:'Invalid artwork batch'});
    if (!db) return failed(res);
    try {
      const {data,error} = await db.from('cl_asset_filters').select('entries').eq('user_id',req.user.sub).maybeSingle();
      if (error) throw error;
      const favorites = new Set(favoriteKeys(data?.entries));
      const unique=[...new Map(incoming.filter(asset=>favorites.has(asset?.key)).map(asset=>[asset.key,asset])).values()];
      const rows = unique.map(asset => ({user_id:req.user.sub,key:asset.key,asset:artworkSnapshot(asset.key,asset),updated_at:new Date().toISOString()})).filter(row => row.asset);
      if (rows.length) { const result = await db.from('cl_favorite_artwork').upsert(rows,{onConflict:'user_id,key'}); if(result.error) throw result.error; }
      res.json({saved:rows.length});
    } catch { failed(res); }
  });
  app.get('/api/profiles/:id/relationship', requireAuth, async (req,res) => {
    const id = req.params.id.toLowerCase(); if(!isUuid(id)) return res.status(400).json({error:'Invalid profile ID'});
    if (!db) return failed(res);
    if(id === req.user.sub) return res.json({own:true,blocked:false,interactionAllowed:false});
    try {
      const [low,high] = orderedFriendPair(req.user.sub,id);
      const blocks = await db.from('cl_user_blocks').select('blocker_id,blocked_id').or(`and(blocker_id.eq.${req.user.sub},blocked_id.eq.${id}),and(blocker_id.eq.${id},blocked_id.eq.${req.user.sub})`);
      if(blocks.error) throw blocks.error;
      const friendship = await db.from('cl_friendships').select('id,status,requested_by').eq('user_low',low).eq('user_high',high).maybeSingle();
      if(friendship.error) throw friendship.error;
      const row = friendship.data;
      res.json({blocked:(blocks.data || []).some(b => b.blocker_id === req.user.sub),interactionAllowed:!blocks.data?.length,
        friendship:row ? {friendship_id:row.id,status:row.status, incoming:row.requested_by !== req.user.sub} : null});
    } catch { failed(res); }
  });
  const target = (req,res) => { const id=req.params.id.toLowerCase(); if(!isUuid(id) || id===req.user.sub) {res.status(400).json({error:'Choose another ChainLens profile'}); return null;} return id; };
  app.post('/api/profiles/:id/block', requireAuth, rateLimit, async (req,res) => {
    const id=target(req,res); if(!id)return; if(!db)return failed(res);
    try { const {error}=await db.from('cl_user_blocks').upsert({blocker_id:req.user.sub,blocked_id:id},{onConflict:'blocker_id,blocked_id'}); if(error)throw error; res.json({blocked:true}); } catch {failed(res);}
  });
  app.delete('/api/profiles/:id/block', requireAuth, async (req,res) => {
    const id=target(req,res); if(!id)return; if(!db)return failed(res);
    try { const {error}=await db.from('cl_user_blocks').delete().eq('blocker_id',req.user.sub).eq('blocked_id',id); if(error)throw error; res.json({blocked:false}); } catch {failed(res);}
  });
  app.post('/api/profiles/:id/report', requireAuth, rateLimit, async (req,res) => {
    const id=target(req,res); if(!id)return; if(!db)return failed(res);
    const {reason,details=''}=req.body || {};
    if(!['spam','harassment','impersonation','other'].includes(reason) || typeof details!=='string' || details.length>1000) return res.status(400).json({error:'Choose a reason and keep details under 1,000 characters'});
    try {
      const recent=await db.from('cl_profile_reports').select('id',{count:'exact',head:true}).eq('reporter_id',req.user.sub).gte('created_at',new Date(Date.now()-86400000).toISOString());
      if(recent.error)throw recent.error; if(recent.count>=20)return res.status(429).json({error:'Daily report limit reached'});
      const {error}=await db.from('cl_profile_reports').insert({reporter_id:req.user.sub,target_id:id,reason,details:details.trim()}); if(error)throw error;
      res.status(201).json({success:true});
    } catch {failed(res);}
  });
}
module.exports={mountProfileCommunity,blockedIds,areBlocked};
