const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const express = require('express');
const { mountDuoSso } = require('../duo-sso');
const redirect = 'http://localhost:3000/auth/chainlens/callback';
const verifier = 'a'.repeat(64);
const input = { client_id: 'duo', redirect_uri: redirect, code_challenge: crypto.createHash('sha256').update(verifier).digest('base64url'), code_challenge_method: 'S256', state: 'b'.repeat(64) };
async function setup(t) {
  const app = express(); app.use(express.json());
  let now = Date.now();
  mountDuoSso(app, { frontendUrl: 'http://localhost:10000', redirectUris: redirect, now: () => now,
    requireAuth: (req, res, next) => { if (req.headers.authorization !== 'Bearer chainlens-session') return res.sendStatus(401); req.user = { sub: 'account-id' }; next(); },
    getUser: async () => ({ id: 'account-id', display_name: 'Alice', email: 'private@example.com', wallets: ['private-address'], holdings: ['private-token'] }),
  });
  const server = app.listen(0, '127.0.0.1'); await new Promise(r => server.once('listening', r));
  t.after(() => new Promise(r => server.close(r)));
  const base = `http://127.0.0.1:${server.address().port}`;
  const request = (path, data, authorized = true, form = false) => fetch(base + path, { redirect: 'manual', headers: { ...(authorized ? { Authorization: 'Bearer chainlens-session' } : {}), ...(data ? { 'Content-Type': form ? 'application/x-www-form-urlencoded' : 'application/json' } : {}) }, ...(data ? { method: 'POST', body: form ? new URLSearchParams(data) : JSON.stringify(data) } : {}) });
  return { request, advance: ms => { now += ms; } };
}
test('DUO SSO validates exact registered callback and requires an existing ChainLens session', async t => {
  const { request } = await setup(t);
  const start = await request('/auth/duo?' + new URLSearchParams(input));
  assert.equal(new URL(start.headers.get('location')).pathname, '/duo-connect.html');
  const shared = await request('/auth/duo?' + new URLSearchParams({ ...input, login_provider: 'google' }));
  assert.equal(new URL(shared.headers.get('location')).searchParams.get('login_provider'), 'google');
  const untrusted = await request('/auth/duo?' + new URLSearchParams({ ...input, login_provider: 'attacker' }));
  assert.equal(new URL(untrusted.headers.get('location')).searchParams.has('login_provider'), false);
  assert.equal((await request('/auth/duo?' + new URLSearchParams({ ...input, redirect_uri: 'https://attacker.example/callback' }))).status, 400);
  assert.equal((await request('/api/duo/authorize', input, false)).status, 401);
  assert.equal((await request('/api/duo/authorize', { ...input, code_challenge_method: 'plain' })).status, 400);
});
test('DUO SSO exchanges a PKCE code for an account ID and display name only', async t => {
  const { request } = await setup(t);
  const authorize = await (await request('/api/duo/authorize', input)).json();
  const callback = new URL(authorize.redirect);
  assert.equal(callback.searchParams.get('state'), input.state);
  const code = callback.searchParams.get('code');
  const exchange = { client_id: 'duo', grant_type: 'authorization_code', redirect_uri: redirect, code, code_verifier: verifier };
  const result = await (await request('/api/duo/token', exchange, false, true)).json();
  assert.equal(typeof result.access_token, 'string');
  // Direct fetch supplies the returned temporary access token, never the ChainLens session.
  const tokenRequest = async () => {
    const req = await request('/auth/duo?' + new URLSearchParams(input));
    const base = new URL(req.url).origin;
    return fetch(base + '/api/duo/userinfo', { headers: { Authorization: 'Bearer ' + result.access_token } });
  };
  assert.deepEqual(await (await tokenRequest()).json(), { sub: 'account-id', name: 'Alice' });
  assert.equal((await tokenRequest()).status, 401);
  assert.equal((await request('/api/duo/token', exchange, false, true)).status, 400);
});
test('DUO SSO consumes failed code attempts and expires unused codes', async t => {
  const { request, advance } = await setup(t);
  const mint = async () => new URL((await (await request('/api/duo/authorize', input)).json()).redirect).searchParams.get('code');
  const code = await mint();
  const exchange = { client_id: 'duo', grant_type: 'authorization_code', redirect_uri: redirect, code, code_verifier: 'x'.repeat(64) };
  assert.equal((await request('/api/duo/token', exchange, false, true)).status, 400);
  assert.equal((await request('/api/duo/token', { ...exchange, code_verifier: verifier }, false, true)).status, 400);
  const expired = await mint(); advance(61000);
  assert.equal((await request('/api/duo/token', { ...exchange, code: expired, code_verifier: verifier }, false, true)).status, 400);
});
