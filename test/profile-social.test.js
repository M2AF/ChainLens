const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { mountProfileSocial, publicProfile, PRESENCE_TTL } = require('../profile-social-service');
const { parseId, pathId } = require('../public/profile-id');
const ID = 'ec18dcf5-3271-46fd-8029-41e5b2f39eed';
const FRIEND = '3f2c6cb8-2a43-4b69-bf5e-099ef63be79f';
test('profile identity accepts exact IDs and ChainLens links, rejecting lookalike hosts and routes', () => {
  assert.equal(parseId(ID.toUpperCase()), ID);
  assert.equal(parseId(`https://www.chainlensnft.info/${ID}`), ID);
  assert.equal(pathId(`/${ID}/`), ID);
  for (const value of [`https://evil.example/${ID}`, `https://www.chainlensnft.info.evil.example/${ID}`, `http://www.chainlensnft.info/${ID}`, '/chat', ID + '/extra']) assert.equal(parseId(value), null);
});
test('public profile projection excludes private account fields even if supplied', () => {
  assert.deepEqual(publicProfile({ id: ID, display_name: 'Me', email: 'private', provider_id: 'secret', cl_wallets: ['hidden'] }), { id: ID, username:null, display_name: 'Me', avatar_url: null, avatar_nft_key: null, banner_url: null });
});
async function fixture(t, results = []) {
  const calls = [];
  const db = { from(table) {
    const call = { table, methods: [] }; calls.push(call);
    const result = results.shift() || { data: null, error: null };
    const chain = { then: (resolve, reject) => Promise.resolve(result).then(resolve, reject) };
    for (const name of ['select','eq','gt','or','in','upsert','delete','maybeSingle']) chain[name] = (...args) => { call.methods.push([name, ...args]); return chain; };
    return chain;
  } };
  const app = express(); app.use(express.json());
  const requireAuth = (req, res, next) => { if (req.headers.authorization !== 'Bearer test') return res.sendStatus(401); req.user = { sub: ID }; next(); };
  const requireChatAccess = (req, res, next) => req.headers['x-deny-chat'] ? res.sendStatus(403) : next();
  mountProfileSocial(app, { db, rateLimit: (req,res,next) => next(), requireAuth, requireChatAccess });
  const server = app.listen(0); await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  return { calls, url: `http://127.0.0.1:${server.address().port}` };
}
test('public endpoint reads only allowlisted columns; invalid IDs never reach database', async t => {
  const f = await fixture(t, [{ data: { id: ID, display_name: 'Me', email: 'secret' } }]);
  assert.equal((await fetch(f.url + '/api/profiles/invalid')).status, 400); assert.equal(f.calls.length, 0);
  const res = await fetch(f.url + '/api/profiles/' + ID); assert.equal(res.status, 200);
  assert.equal((await res.json()).email, undefined);
  assert.deepEqual(f.calls[0].methods[0], ['select', 'id, username, display_name, avatar_url, avatar_nft_key, banner_url, public_wallets, public_favorites']);
});
test('profile endpoint distinguishes missing profile from unavailable database', async t => {
  const f = await fixture(t, [{ data: null }, { error: new Error('private db failure') }]);
  assert.equal((await fetch(f.url + '/api/profiles/' + ID)).status, 404);
  const res = await fetch(f.url + '/api/profiles/' + ID); assert.equal(res.status, 503); assert.doesNotMatch(await res.text(), /private db failure/);
});
test('presence requires authenticated eligible account and validated session; ignores forged identity', async t => {
  const f = await fixture(t);
  const options = { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ session_id: FRIEND, active: true, in_world: true, user_id: FRIEND }) };
  assert.equal((await fetch(f.url + '/api/chat/presence', options)).status, 401);
  options.headers.Authorization = 'Bearer test'; options.headers['x-deny-chat'] = 'yes';
  assert.equal((await fetch(f.url + '/api/chat/presence', options)).status, 403); delete options.headers['x-deny-chat'];
  const before = Date.now(); assert.equal((await fetch(f.url + '/api/chat/presence', options)).status, 200);
  const row = f.calls[0].methods.find(m => m[0] === 'upsert')[1]; assert.equal(row.user_id, ID);
  assert.ok(Date.parse(row.expires_at) >= before + PRESENCE_TTL);
  options.body = JSON.stringify({ session_id: 'invalid', active: true, in_world: true });
  assert.equal((await fetch(f.url + '/api/chat/presence', options)).status, 400);
});
test('leaving presence deletes only the authenticated browser session', async t => {
  const f = await fixture(t);
  const res = await fetch(f.url + '/api/chat/presence', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer test' }, body: JSON.stringify({ session_id: FRIEND, active: false, in_world: true }) });
  assert.equal(res.status, 200);
  assert.deepEqual(f.calls[0].methods, [['delete'], ['eq', 'user_id', ID], ['eq', 'session_id', FRIEND]]);
});
test('presence filters expired sessions, scopes online users to friends/world, merges multiple tabs', async t => {
  const f = await fixture(t, [{ data: [{ user_low: ID, user_high: FRIEND }] }, { data: [{ user_id: FRIEND, in_world: true }, { user_id: FRIEND, in_world: false }] }, { data: [{ id: FRIEND, display_name: 'Friend', email: 'hidden' }] }]);
  const res = await fetch(f.url + '/api/chat/presence', { headers: { Authorization: 'Bearer test' } });
  assert.deepEqual(await res.json(), { people: [{ id: FRIEND, display_name: 'Friend', avatar_nft_key: null, online: true, in_world: true }] });
  assert.ok(f.calls[1].methods.some(m => m[0] === 'gt' && m[1] === 'expires_at'));
  assert.ok(f.calls[1].methods.find(m => m[0] === 'or')[1].includes(FRIEND));
});
