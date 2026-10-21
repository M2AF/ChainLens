'use strict';
const crypto = require('node:crypto');
const jwt = require('jsonwebtoken');
const { isUuid, normalizeChatContent } = require('./chat-service');
const GAME_ROOMS = Object.freeze([
  { id: 'duo', name: 'DUO' }, { id: 'poker', name: 'Poker' },
  { id: 'pool', name: 'Pool' }, { id: 'swarm', name: 'SWARM' },
  { id: 'clash', name: 'CLASH' }, { id: 'world', name: 'DUO World' },
]);

// A separate signing key and audience keep game credentials out of profile,
// wallet and account-management APIs. Only the explicit game-social aliases
// below may also use it for player-requested friendship actions.
function gameChatCredentials(secret) {
  const key = crypto.createHmac('sha256', secret).update('chainlens-game-chat-v1').digest();
  return {
    issue: sub => jwt.sign({ sub, scope: 'game-chat' }, key, { audience: 'duo-game-chat', expiresIn: '7d', algorithm: 'HS256' }),
    verify(token) {
      const claims = jwt.verify(token, key, { audience: 'duo-game-chat', algorithms: ['HS256'] });
      if (claims.scope !== 'game-chat' || !isUuid(claims.sub)) throw new Error('Invalid game identity');
      return claims;
    },
  };
}

function gameChatAuthenticate(requireAuth, credentials) {
  return (req, res, next) => {
    const token = String(req.headers.authorization || '').replace(/^Bearer /, '');
    try { req.user = credentials.verify(token); next(); }
    catch { requireAuth(req, res, next); }
  };
}

function mountGameChat(app, { db, requireAuth, credentials, hydrate, blockedIds, allowed }) {
  const authenticate = gameChatAuthenticate(requireAuth, credentials);
  app.get('/api/chat/game-rooms', requireAuth, (req, res) => res.json({ rooms: GAME_ROOMS }));
  app.use('/api/chat/games/:game', authenticate, async (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    if (!GAME_ROOMS.some(game => game.id === req.params.game)) return res.status(404).json({ error: 'Game room not found' });
    if (!db) return res.status(503).json({ error: 'Game chat is unavailable' });
    try {
      const profile = await db.from('cl_users').select('id').eq('id', req.user.sub).maybeSingle();
      if (profile.error) throw profile.error;
      if (!profile.data) return res.status(401).json({ error: 'Sign in to ChainLens again' });
      next();
    } catch { res.status(503).json({ error: 'Game chat is unavailable' }); }
  });
  app.get('/api/chat/games/:game', async (req, res) => {
    const after = req.query.after === undefined ? null : Number(req.query.after);
    if (after !== null && (!Number.isSafeInteger(after) || after < 0)) return res.status(400).json({ error: 'Invalid message cursor' });
    try {
      let query = db.from('cl_game_messages').select('id,user_id,message_type,content,created_at').eq('game', req.params.game);
      query = after === null ? query.order('id', { ascending: false }).limit(60) : query.gt('id', after).order('id', { ascending: true }).limit(100);
      const { data, error } = await query;
      if (error) throw error;
      const blocked = await blockedIds(db, req.user.sub);
      const rows = (after === null ? [...data].reverse() : data).filter(row => !blocked.has(row.user_id));
      res.json({ messages: await hydrate(rows) });
    } catch { res.status(503).json({ error: 'Game chat is unavailable. Try again shortly.' }); }
  });
  app.get('/api/chat/games/:game/profiles', async (req, res) => {
    const ids = [...new Set(String(req.query.ids || '').split(',').filter(Boolean))];
    if (!ids.length || ids.length > 100 || ids.some(id => !isUuid(id))) return res.status(400).json({ error: 'Invalid player IDs' });
    try {
      const blocked = await blockedIds(db, req.user.sub);
      const rows = await hydrate(ids.filter(id => !blocked.has(id)).map(user_id => ({ user_id })));
      // Explicit projection: game clients never receive private profile fields.
      res.json({ profiles: rows.map(({ author }) => ({ id: author.id, display_name: author.display_name, avatar_url: author.avatar_url || null, avatar_nft_key: author.avatar_nft_key || null })) });
    } catch { res.status(503).json({ error: 'Player pictures are unavailable' }); }
  });
  app.post('/api/chat/games/:game', async (req, res) => {
    if (!allowed(req.user.sub)) return res.status(429).json({ error: 'Please wait before sending another message' });
    let message;
    try { message = normalizeChatContent(req.body?.type, req.body?.content, { allowLinks: false }); }
    catch (error) { return res.status(400).json({ error: error.message }); }
    try {
      const { data, error } = await db.from('cl_game_messages').insert({ game: req.params.game, user_id: req.user.sub, ...message }).select('id,user_id,message_type,content,created_at').single();
      if (error) throw error;
      res.status(201).json({ message: (await hydrate([data]))[0] });
    } catch { res.status(503).json({ error: 'Could not send that message' }); }
  });
  app.delete('/api/chat/games/:game/:messageId', async (req, res) => {
    if (!/^[1-9][0-9]*$/.test(req.params.messageId)) return res.status(400).json({ error: 'Invalid message' });
    try {
      const { data, error } = await db.from('cl_game_messages').delete().eq('game', req.params.game).eq('id', req.params.messageId).eq('user_id', req.user.sub).select('id').maybeSingle();
      if (error) throw error;
      if (!data) return res.status(404).json({ error: 'Message not found' });
      res.json({ success: true, message_id: data.id });
    } catch { res.status(503).json({ error: 'Could not delete that message' }); }
  });
}
module.exports = { GAME_ROOMS, gameChatCredentials, gameChatAuthenticate, mountGameChat };
