const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readNewListings } = require('../new-listings-proxy');

test('Render reads persistent Worker listings without using a provider key', async () => {
  const feed = { state: 'reconnecting', storage: 'cloudflare-sqlite', events: [{ id: 'persisted' }] };
  const result = await readNewListings(async (url, options) => {
    assert.equal(url, 'https://worker.example/api/market/new-listings');
    assert.equal(options.headers.Authorization, undefined);
    assert(options.signal instanceof AbortSignal);
    return { ok: true, json: async () => feed };
  }, 'https://worker.example');
  assert.deepEqual(result, feed);
});

test('Worker outages and invalid responses fail rather than opening another upstream', async () => {
  await assert.rejects(readNewListings(async () => ({ ok: false }), 'https://worker.example'));
  await assert.rejects(readNewListings(async () => ({ ok: true, json: async () => ({ events: [] }) }), 'https://worker.example'));
  await assert.rejects(readNewListings(async () => { throw new Error('must not fetch'); }, 'http://worker.example'), /Invalid listings Worker URL/);
});
