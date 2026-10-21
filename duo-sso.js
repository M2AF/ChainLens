// A narrow OAuth authorization-code bridge. Existing ChainLens sessions remain private.
const crypto = require('node:crypto');
const express = require('express');

// Production DUO callbacks, used when DUO_REDIRECT_URIS is not set on the host.
const DEFAULT_REDIRECT_URIS = ['chainlens', 'google', 'discord'].map(p => `https://duo-u3mp.onrender.com/auth/${p}/callback`).join(',');

function mountDuoSso(app, { requireAuth, getUser, frontendUrl, redirectUris = process.env.DUO_REDIRECT_URIS || DEFAULT_REDIRECT_URIS, now = Date.now, issueGameChat = null }) {
  const allowed = new Set(redirectUris.split(',').map(v => v.trim()).filter(Boolean));
  const codes = new Map(), tokens = new Map(), limits = new Map();
  const hash = value => crypto.createHash('sha256').update(value).digest('hex');
  const random = () => crypto.randomBytes(32).toString('hex');
  const valid = input => input.client_id === 'duo' && allowed.has(input.redirect_uri) && /^[a-zA-Z0-9_-]{43}$/.test(input.code_challenge || '') && input.code_challenge_method === 'S256' && /^[a-f0-9]{64}$/.test(input.state || '');
  const guard = (req, res, next) => {
    res.set('Cache-Control', 'no-store'); res.set('Referrer-Policy', 'no-referrer');
    for (const map of [codes, tokens, limits]) for (const [key, v] of map) if (v.expires <= now()) map.delete(key);
    const key = req.ip || req.socket.remoteAddress;
    const limit = limits.get(key) || { count: 0, expires: now() + 60000 };
    limits.set(key, limit);
    if (++limit.count > 120 || codes.size > 2000 || tokens.size > 2000) return res.status(429).json({ error: 'Sign-in is busy. Try again shortly.' });
    next();
  };
  app.get('/auth/duo', guard, (req, res) => {
    if (!valid(req.query)) return res.status(400).send('DUO sign-in is not configured for this callback.');
    const target = new URL('/duo-connect.html', frontendUrl);
    for (const key of ['client_id', 'redirect_uri', 'state', 'code_challenge', 'code_challenge_method']) target.searchParams.set(key, req.query[key]);
    if (['google', 'discord'].includes(req.query.login_provider)) target.searchParams.set('login_provider', req.query.login_provider);
    res.redirect(target.toString());
  });
  app.post('/api/duo/authorize', guard, requireAuth, async (req, res) => {
    if (!valid(req.body)) return res.status(400).json({ error: 'Invalid DUO sign-in request.' });
    try {
      const profile = await getUser(req.user.sub);
      if (!profile || profile.id !== req.user.sub) return res.status(401).json({ error: 'Sign in to ChainLens again.' });
      const code = random();
      // Only the account ID and display name cross this boundary. No email/wallets/holdings.
      codes.set(hash(code), { expires: now() + 60000, challenge: req.body.code_challenge, redirect: req.body.redirect_uri, profile: { sub: profile.id, name: profile.display_name || profile.username || 'Player' } });
      const callback = new URL(req.body.redirect_uri);
      callback.searchParams.set('code', code); callback.searchParams.set('state', req.body.state);
      res.json({ redirect: callback.toString() });
    } catch { res.status(503).json({ error: 'ChainLens sign-in is unavailable. Please try again.' }); }
  });
  app.post('/api/duo/token', guard, express.urlencoded({ extended: false, limit: '4kb' }), (req, res) => {
    const input = req.body || {}, key = hash(String(input.code || ''));
    const saved = codes.get(key); codes.delete(key);
    const proof = /^[a-zA-Z0-9._~-]{43,128}$/.test(input.code_verifier || '') ? crypto.createHash('sha256').update(input.code_verifier).digest('base64url') : '';
    if (!saved || input.grant_type !== 'authorization_code' || input.client_id !== 'duo' || input.redirect_uri !== saved.redirect || proof !== saved.challenge) return res.status(400).json({ error: 'invalid_grant' });
    const token = random();
    tokens.set(hash(token), { expires: now() + 60000, profile: saved.profile });
    res.json({ access_token: token, token_type: 'Bearer', expires_in: 60 });
  });
  app.get('/api/duo/userinfo', guard, (req, res) => {
    const token = String(req.headers.authorization || '').match(/^Bearer ([a-f0-9]{64})$/)?.[1];
    const saved = token && tokens.get(hash(token));
    if (!saved) return res.status(401).json({ error: 'invalid_token' });
    tokens.delete(hash(token));
    res.json({ ...saved.profile, ...(issueGameChat ? { game_chat_token: issueGameChat(saved.profile.sub) } : {}) });
  });
}
module.exports = { mountDuoSso };
