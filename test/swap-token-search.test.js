/**
 * Swap-ready identity for scanned wallet holdings, and the all-chain text
 * search (GET /api/dex/tokens?chain=all&q=...).
 *
 * The picker offers a holding for swapping only through its exact chain +
 * contract/mint and the token's own decimals. Text search across networks keeps
 * every result qualified by chain: EMO on Monad and a token called EMO on
 * Robinhood are two different results, never merged by symbol or name.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { createSwapService, swapIdentityFor, withSwapIdentity, SwapInputError } = require('../swap-service');

const EMO_MONAD = '0x81a224f8a62f52bde942dbf23a56df77a10b7777';
const EMO_ROBINHOOD = '0x3333333333333333333333333333333333333333';
const TOKEN_2022 = 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb';
const USDC_SOL = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

// ── Scanner holdings ─────────────────────────────────────────────────────────

test('Monad EMO gets an exact swap identity with its real decimals', () => {
  const { swap, swapIssue } = swapIdentityFor('monad', { address: EMO_MONAD, decimals: '18' });
  assert.equal(swapIssue, null);
  assert.deepEqual(swap, {
    chain: 'monad', address: EMO_MONAD, key: `monad:${EMO_MONAD}`, decimals: 18, isNative: false, tokenProgram: null,
  });
});

test('natives and Solana mints keep their exact identity', () => {
  assert.deepEqual(swapIdentityFor('base', { native: true, decimals: 18 }).swap,
    { chain: 'base', address: '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee', key: 'base:0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee', decimals: 18, isNative: true, tokenProgram: null });
  const sol = swapIdentityFor('solana', { native: true, decimals: 9 }).swap;
  assert.equal(sol.address, 'So11111111111111111111111111111111111111112');
  const spl = swapIdentityFor('solana', { address: USDC_SOL, decimals: 6, tokenProgram: TOKEN_2022 }).swap;
  assert.equal(spl.address, USDC_SOL, 'mints are case-sensitive and kept exactly');
  assert.equal(spl.tokenProgram, TOKEN_2022);
  // A zero-decimal token is 0, not "unknown" (the old `|| 18` bug).
  assert.equal(swapIdentityFor('base', { address: EMO_ROBINHOOD, decimals: 0 }).swap.decimals, 0);
});

test('invalid metadata is refused with a reason, never guessed', () => {
  const issue = (chain, id) => swapIdentityFor(chain, id).swapIssue;
  for (const decimals of [undefined, null, NaN, '', '18.5', 18.5, -1, 37, '0x12', 'eighteen']) {
    assert.match(issue('monad', { address: EMO_MONAD, decimals }), /decimals could not be confirmed/, String(decimals));
  }
  assert.match(issue('monad', { address: 'not-an-address', decimals: 18 }), /contract could not be identified/);
  assert.match(issue('monad', { address: '', decimals: 18 }), /contract could not be identified/);
  assert.match(issue('solana', { address: EMO_MONAD, decimals: 18 }), /contract could not be identified/);
  assert.match(issue('cardano', { address: 'asset1', decimals: 6 }), /not available/);
  assert.match(issue('abstract-agw', { address: EMO_MONAD, decimals: 18 }), /not available/);
  // A garbage token program is dropped, the identity kept.
  assert.equal(swapIdentityFor('solana', { address: USDC_SOL, decimals: 6, tokenProgram: '<script>' }).swap.tokenProgram, null);
});

test('withSwapIdentity attaches to the scanner record in place', () => {
  const rec = { id: EMO_MONAD, symbol: 'EMO', totalValue: '12.00', chain: 'monad' };
  assert.equal(withSwapIdentity(rec, 'monad', { address: EMO_MONAD, decimals: 18 }), rec);
  assert.equal(rec.swap.key, `monad:${EMO_MONAD}`);
  assert.equal(rec.swapIssue, null);
});

// ── All-chain search ─────────────────────────────────────────────────────────

/** A fake Worker /tokens: `byChain[chain]` is a token list, an HTTP status, or 'throw'. */
function fakeTokens(byChain, { delayMs = 0 } = {}) {
  const calls = [];
  let inFlight = 0;
  let maxInFlight = 0;
  const fetchImpl = async (url, init = {}) => {
    const u = new URL(url);
    const chain = u.searchParams.get('chain');
    calls.push({ chain, q: u.searchParams.get('q'), address: u.searchParams.get('address'), limit: Number(u.searchParams.get('limit')), headers: init.headers || {} });
    inFlight += 1;
    maxInFlight = Math.max(maxInFlight, inFlight);
    try {
      if (delayMs) await new Promise(r => setTimeout(r, delayMs));
      const entry = byChain[chain];
      if (entry === 'throw') throw new Error('network down');
      if (typeof entry === 'number') return new Response(JSON.stringify({ tokens: [], error: 'Too many token searches — slow down.' }), { status: entry });
      return new Response(JSON.stringify({ tokens: entry || [], chain, error: null }));
    } finally {
      inFlight -= 1;
    }
  };
  return { calls, fetchImpl, get maxInFlight() { return maxInFlight; } };
}

const tok = (chain, address, symbol, over = {}) => ({ chain, address, symbol, name: symbol, decimals: 18, verified: null, ...over });

test('same-named tokens on Monad and Robinhood stay two chain-qualified results', async () => {
  const w = fakeTokens({
    monad: [tok('monad', EMO_MONAD, 'EMO', { name: 'emonad' })],
    robinhood: [tok('robinhood', EMO_ROBINHOOD, 'EMO', { name: 'emonad' })],
  });
  const out = await createSwapService({ fetchImpl: w.fetchImpl, clientToken: 'server-only' }).tokens({ chain: 'all', q: 'emonad' });
  const emo = out.tokens.filter(t => t.symbol === 'EMO');
  assert.equal(emo.length, 2, 'not merged by symbol or name');
  assert.deepEqual(emo.map(t => t.key).sort(), [`monad:${EMO_MONAD}`, `robinhood:${EMO_ROBINHOOD}`]);
  assert.deepEqual(emo.find(t => t.chain === 'monad').address, EMO_MONAD);
  assert.equal(out.partial, false);
  assert.equal(out.error, null);
  // Every call carried the server's token; none of it reached the response.
  assert.ok(w.calls.every(c => c.headers['x-mm-client'] === 'server-only'));
  assert.ok(!JSON.stringify(out).includes('server-only'));
});

test('each chain is sanitized separately: invalid or cross-chain records are dropped', async () => {
  const w = fakeTokens({
    monad: [
      tok('monad', EMO_MONAD, 'EMO'),
      tok('monad', 'not-an-address', 'BAD'),
      tok('monad', '0x4444444444444444444444444444444444444444', 'NODEC', { decimals: 'x' }),
      // A record claiming another chain inside Monad's answer is not re-labelled as Monad.
      tok('robinhood', EMO_ROBINHOOD, 'EMO'),
    ],
    solana: [tok('solana', USDC_SOL, 'USDC', { decimals: 6 }), tok('solana', EMO_MONAD, 'EVMONSOL')],
  });
  const out = await createSwapService({ fetchImpl: w.fetchImpl }).tokens({ chain: 'all', q: 'emo' });
  const keys = out.tokens.map(t => t.key);
  assert.ok(keys.includes(`monad:${EMO_MONAD}`));
  assert.ok(keys.includes(`solana:${USDC_SOL}`));
  // The shared sanitizer would relabel it as Monad; it must be dropped instead.
  assert.ok(!keys.includes(`monad:${EMO_ROBINHOOD}`), 'a Robinhood record is never relabelled as Monad');
  assert.ok(!keys.some(k => k.startsWith('robinhood:')), 'the cross-chain record was dropped, not moved');
  assert.ok(!out.tokens.some(t => ['BAD', 'NODEC', 'EVMONSOL'].includes(t.symbol)));
  assert.ok(out.tokens.every(t => t.key === `${t.chain}:${t.chain === 'solana' ? t.address : t.address.toLowerCase()}`));
});

test('limits: bounded concurrency, per-chain and total results, query length', async () => {
  const many = (chain) => Array.from({ length: 30 }, (_, i) => tok(chain, `0x${(i + 1).toString(16).padStart(40, 'a')}`, `T${i}`));
  const byChain = {};
  for (const c of ['ethereum', 'base', 'arbitrum', 'optimism', 'polygon', 'monad', 'robinhood', 'abstract']) byChain[c] = many(c);
  const w = fakeTokens(byChain, { delayMs: 5 });
  const svc = createSwapService({ fetchImpl: w.fetchImpl });
  const out = await svc.tokens({ chain: 'all', q: 'tt', limit: 999 });
  assert.ok(w.maxInFlight <= 6, `at most 6 chains in flight (saw ${w.maxInFlight})`);
  assert.ok(w.calls.every(c => c.limit <= 8), 'per-chain request limit');
  assert.equal(out.tokens.length, 50, 'total capped at 50');
  assert.ok(out.chains.searched.includes('solana') && out.chains.searched.includes('monad'));
  assert.ok(!out.chains.searched.includes('abstract-agw') && !out.chains.searched.includes('cardano'));
  assert.equal(w.calls.length, out.chains.searched.length, 'one request per searched chain');

  const small = await createSwapService({ fetchImpl: fakeTokens(byChain).fetchImpl }).tokens({ chain: 'all', q: 'tt', limit: 5 });
  assert.equal(small.tokens.length, 5);

  await assert.rejects(svc.tokens({ chain: 'all', q: 'e' }), /at least 2 characters/);
  await assert.rejects(svc.tokens({ chain: 'all', q: 'x'.repeat(65) }), /too long/);
});

test('exact-address searches stay chain-specific', async () => {
  const w = fakeTokens({ monad: [tok('monad', EMO_MONAD, 'EMO')] });
  const svc = createSwapService({ fetchImpl: w.fetchImpl });
  await assert.rejects(svc.tokens({ chain: 'all', q: EMO_MONAD }), SwapInputError);
  await assert.rejects(svc.tokens({ chain: 'all', address: EMO_MONAD }), /needs a network/);
  await assert.rejects(svc.tokens({ chain: 'all', q: USDC_SOL }), /needs a network/);
  assert.equal(w.calls.length, 0, 'no fan-out for an address');
  const one = await svc.tokens({ chain: 'monad', address: EMO_MONAD });
  assert.deepEqual(w.calls.map(c => [c.chain, c.address]), [['monad', EMO_MONAD]]);
  assert.equal(one.tokens[0].chain, 'monad');
});

test('partial provider failures: other chains still answer, and the failures are named', async () => {
  const w = fakeTokens({
    monad: [tok('monad', EMO_MONAD, 'EMO')],
    robinhood: 429,
    base: 'throw',
    solana: 502,
  });
  const svc = createSwapService({ fetchImpl: w.fetchImpl });
  const out = await svc.tokens({ chain: 'all', q: 'emo' });
  assert.equal(out.partial, true);
  assert.equal(out.error, null);
  assert.deepEqual(out.tokens.map(t => t.key), [`monad:${EMO_MONAD}`]);
  assert.deepEqual(out.chains.failed.map(f => f.chain).sort(), ['base', 'robinhood', 'solana']);
  assert.ok(out.chains.failed.every(f => typeof f.error === 'string' && !/server-only|api[_-]?key/i.test(f.error)));

  // Everything down is an error, and is not cached.
  const down = {};
  for (const c of ['ethereum', 'arbitrum', 'optimism', 'base', 'polygon', 'avalanche', 'monad', 'robinhood', 'arc', 'abstract', 'worldchain', 'soneium', 'blast', 'gnosis', 'apechain', 'ronin', 'zora', 'hyperevm', 'solana']) down[c] = 503;
  const dead = fakeTokens(down);
  const deadSvc = createSwapService({ fetchImpl: dead.fetchImpl });
  const none = await deadSvc.tokens({ chain: 'all', q: 'emo' });
  assert.equal(none.tokens.length, 0);
  assert.equal(none.error, 'Token search is unavailable right now.');
  const before = dead.calls.length;
  await deadSvc.tokens({ chain: 'all', q: 'emo' });
  assert.ok(dead.calls.length > before, 'a total failure is retried, not served from cache');
});

test('results are cached: 60 s when complete, 15 s when partial', async () => {
  let t = 1_000_000;
  const w = fakeTokens({ monad: [tok('monad', EMO_MONAD, 'EMO')] });
  const svc = createSwapService({ fetchImpl: w.fetchImpl, now: () => t });
  await svc.tokens({ chain: 'all', q: 'emo' });
  const first = w.calls.length;
  await svc.tokens({ chain: 'all', q: 'EMO' });
  assert.equal(w.calls.length, first, 'served from cache (case-insensitive query)');
  t += 61_000;
  await svc.tokens({ chain: 'all', q: 'emo' });
  assert.equal(w.calls.length, first * 2, 'refetched after 60 s');

  let u = 2_000_000;
  const p = fakeTokens({ monad: [tok('monad', EMO_MONAD, 'EMO')], base: 500 });
  const psvc = createSwapService({ fetchImpl: p.fetchImpl, now: () => u });
  await psvc.tokens({ chain: 'all', q: 'emo' });
  const n = p.calls.length;
  u += 16_000;
  await psvc.tokens({ chain: 'all', q: 'emo' });
  // The partial answer expired; only the chain that failed is asked again
  // (the others are still inside their own 60 s per-chain cache).
  assert.deepEqual(p.calls.slice(n).map(c => c.chain), ['base'], 'a partial answer expires after 15 s');
});

test('exact symbol matches rank first, then verified tokens', async () => {
  const w = fakeTokens({
    ethereum: [tok('ethereum', '0x5555555555555555555555555555555555555555', 'EMOJI'), tok('ethereum', '0x6666666666666666666666666666666666666666', 'EMO', { verified: true })],
    monad: [tok('monad', EMO_MONAD, 'EMO')],
  });
  const out = await createSwapService({ fetchImpl: w.fetchImpl }).tokens({ chain: 'all', q: 'emo' });
  assert.deepEqual(out.tokens.map(t => `${t.chain}:${t.symbol}`), ['ethereum:EMO', 'monad:EMO', 'ethereum:EMOJI']);
});

test('an exact NAME match ranks with exact symbols (EMO is named "emonad")', async () => {
  const noise = Array.from({ length: 8 }, (_, i) => tok('solana', `${'R3qMyyDQSy2UqyxjYG8ZJyvYN4KTsGfLuiPJKSga5q'}${'ABCDEFGH'[i]}`, 'emonad', { decimals: 6, name: `x${i}` }));
  const w = fakeTokens({
    solana: noise,
    base: [tok('base', '0x333fae03f8f67895845b437eecdd6f889ff97ba3', 'EMONADX', { name: 'Eagle Monad' })],
    monad: [tok('monad', EMO_MONAD, 'emo', { name: 'emonad' })],
  });
  const out = await createSwapService({ fetchImpl: w.fetchImpl }).tokens({ chain: 'all', q: 'emonad', limit: 5 });
  assert.equal(out.tokens[0].key, `monad:${EMO_MONAD}`, 'Monad EMO survives the limit and ranks first by network order among exact matches');
  assert.ok(!out.tokens.some(t => t.chain === 'base'), 'a prefix match ranks below the exact ones');
});
