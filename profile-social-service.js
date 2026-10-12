const { isUuid } = require('./chat-service');
const PUBLIC_PROFILE_COLUMNS = 'id, display_name, avatar_url, banner_url';
const PRESENCE_TTL = 75_000;
const publicProfile = row => ({ id: row.id, display_name: row.display_name || 'ChainLens user', avatar_url: row.avatar_url || null, banner_url: row.banner_url || null });

function mountProfileSocial(app, { db, rateLimit, requireAuth, requireChatAccess }) {
  app.get('/api/profiles/:id', rateLimit, async (req, res) => {
    const id = req.params.id.toLowerCase();
    if (!isUuid(id)) return res.status(400).json({ error: 'Enter a valid ChainLens ID' });
    if (!db) return res.status(503).json({ error: 'Profiles are temporarily unavailable' });
    try {
      const { data, error } = await db.from('cl_users').select(PUBLIC_PROFILE_COLUMNS).eq('id', id).maybeSingle();
      if (error) throw error;
      res.set('Cache-Control', 'no-store');
      return data ? res.json(publicProfile(data)) : res.status(404).json({ error: 'No ChainLens profile has that ID' });
    } catch { res.status(503).json({ error: 'Profiles are temporarily unavailable' }); }
  });

  // Per-browser sessions prevent a closing tab from marking another tab offline.
  app.post('/api/chat/presence', requireAuth, requireChatAccess, async (req, res) => {
    const { session_id, in_world, active } = req.body || {};
    if (!isUuid(session_id) || typeof in_world !== 'boolean' || typeof active !== 'boolean') {
      return res.status(400).json({ error: 'Invalid presence update' });
    }
    try {
      const result = active ? await db.from('cl_chat_presence').upsert({
        user_id: req.user.sub, session_id, in_world: active && in_world,
        expires_at: new Date(active ? Date.now() + PRESENCE_TTL : Date.now()).toISOString(),
      }, { onConflict: 'user_id,session_id' }) : await db.from('cl_chat_presence').delete().eq('user_id', req.user.sub).eq('session_id', session_id);
      if (result.error) throw result.error;
      res.json({ success: true });
    } catch { res.status(503).json({ error: 'Presence is temporarily unavailable' }); }
  });

  app.get('/api/chat/presence', requireAuth, requireChatAccess, async (req, res) => {
    try {
      const { data: memberships, error: membershipError } = await db.from('cl_friendships')
        .select('user_low,user_high').eq('status', 'accepted')
        .or(`user_low.eq.${req.user.sub},user_high.eq.${req.user.sub}`);
      if (membershipError) throw membershipError;
      const friends = new Set((memberships || []).map(row => row.user_low === req.user.sub ? row.user_high : row.user_low));
      const { data, error } = await db.from('cl_chat_presence').select('user_id,in_world')
        .gt('expires_at', new Date().toISOString())
        .or(`in_world.eq.true,user_id.eq.${req.user.sub}${[...friends].map(id => `,user_id.eq.${id}`).join('')}`);
      if (error) throw error;
      const users = new Map();
      for (const row of data || []) users.set(row.user_id, Boolean(users.get(row.user_id) || row.in_world));
      const ids = [...users.keys()];
      let profiles = [];
      if (ids.length) {
        const result = await db.from('cl_users').select('id,display_name,avatar_url').in('id', ids);
        if (result.error) throw result.error;
        profiles = result.data || [];
      }
      res.set('Cache-Control', 'no-store');
      res.json({ people: profiles.map(profile => ({ id: profile.id, display_name: profile.display_name, avatar_url: profile.avatar_url, online: true, in_world: users.get(profile.id) })) });
    } catch { res.status(503).json({ error: 'Presence is temporarily unavailable' }); }
  });
}
module.exports = { mountProfileSocial, publicProfile, PUBLIC_PROFILE_COLUMNS, PRESENCE_TTL };
