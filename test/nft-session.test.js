const { test } = require('node:test');
const assert = require('node:assert/strict');
const { create, request } = require('../public/nft-session');
const key = nft => `${nft.chain}:${nft.tokenId}`;

test('coalesces galleries, preserves all pages and empty targets, separates wallets/chains', async () => {
  const calls = [], pages = [];
  const cache = create({ key, fetchPage: async url => {
    calls.push(url);
    await new Promise(resolve => setImmediate(resolve));
    return url.includes('/base/0xAbC') ? { nfts: [{ tokenId: url.includes('pageKey') ? '2' : '1' }], nextPageKey: url.includes('pageKey') ? null : 'next' } : { nfts: [] };
  } });
  const a = cache.load('base', '0xAbC', values => pages.push(values.length));
  assert.strictEqual(cache.load('base', '0xabc'), a);
  assert.equal((await a).length, 2);
  assert.deepEqual(pages, [1,2]);
  await cache.load('base', '0xabc');
  assert.equal(calls.length, 2);
  assert.equal(cache.peek('ethereum','0xabc').length, 0);
  assert.equal(cache.peek('base','0xdef').length, 0);
  await cache.load('base','0xdef'); await cache.load('base','0xdef');
  assert.equal(calls.length, 3);
  cache.clear();
  assert.equal(cache.peek('base','0xabc').length, 0);
  await cache.load('base','0xAbC');
  assert.equal(calls.length, 5);
});

test('retains partial data on repeated pagination and retries failed targets', async () => {
  let fail = true;
  const cache = create({ key, fetchPage: async () => ({ nfts: [{ tokenId:'1' }], nextPageKey: fail ? 'repeated' : null }) });
  await assert.rejects(cache.load('base','wallet'), /pagination/);
  assert.equal(cache.peek('base','wallet').length,1);
  fail = false;
  assert.equal((await cache.load('base','wallet')).length,1);
});

test('a stalled response body times out and caller cancellation stays distinguishable', async t => {
  const original = global.fetch;
  t.after(() => { global.fetch = original; });
  global.fetch = async (url, { signal }) => ({ ok: true, json: () => new Promise((resolve, reject) => {
    const abort = () => reject(new DOMException('Aborted', 'AbortError'));
    if (signal.aborted) abort(); else signal.addEventListener('abort', abort, { once:true });
  }) });
  await assert.rejects(request('/stalled', undefined, 10), /timed out/);
  const controller = new AbortController();
  const pending = request('/cancelled', controller.signal);
  controller.abort();
  await assert.rejects(pending, error => error.name === 'AbortError');
});

test('NFT requests are bounded to six concurrent targets', async () => {
  let active = 0, maximum = 0;
  const cache = create({ key, fetchPage: async () => {
    active++; maximum = Math.max(maximum,active);
    await new Promise(resolve => setImmediate(resolve));
    active--; return { nfts:[] };
  } });
  await Promise.all(Array.from({length:20},(_,i) => cache.load('base',`wallet${i}`)));
  assert.equal(maximum,6);
});
