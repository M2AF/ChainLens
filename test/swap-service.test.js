const test = require('node:test');
const assert = require('node:assert/strict');
const {
  createSwapService, isOnCurve, deriveJupiterFeeAccount, parseQuoteRequest, SwapInputError,
} = require('../swap-service');
const vectors = require('./fixtures-solana-pda.json');
const { core, EVM_A, SOL_A, USDC_ETH, NATIVE, SOL_MINT, ethToUsdc } = require('./dex-fixtures');

const TOKEN_PROGRAM = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';

function fakeWorker(handlers) {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    const u = new URL(url);
    calls.push({ path: u.pathname, params: Object.fromEntries(u.searchParams), headers: init.headers || {}, body: init.body ? JSON.parse(init.body) : null });
    const h = handlers[u.pathname];
    const out = h ? await h(u, init) : { status: 404, body: { error: 'Not found' } };
    return new Response(JSON.stringify(out.body), { status: out.status || 200 });
  };
  return { calls, fetchImpl };
}

const quoteQuery = (over = {}) => ({
  fromChain: 'ethereum', toChain: 'ethereum', sell: NATIVE, buy: USDC_ETH, sellSymbol: 'ETH', buySymbol: 'USDC',
  amount: '1000000000000000000', slippageBps: '100', taker: EVM_A, toAddress: EVM_A, fromDecimals: '18', toDecimals: '6', ...over,
});

test('Solana PDA derivation matches @solana/web3.js', () => {
  let mismatches = 0;
  for (const [hex, onCurve] of vectors.curve) if (isOnCurve(Buffer.from(hex, 'hex')) !== onCurve) mismatches += 1;
  assert.equal(mismatches, 0, `isOnCurve disagreed with web3.js on ${mismatches} of ${vectors.curve.length}`);
  for (const p of vectors.pdas) assert.equal(deriveJupiterFeeAccount(vectors.referralAccount, p.mint), p.pda, p.mint);
  // The shared policy's referral account is the one the vectors were made for.
  assert.equal(core.SWAP_FEE_BENEFICIARIES.solanaReferralAccount, vectors.referralAccount);
});

test('quote requests are validated before anything reaches the Worker', () => {
  assert.throws(() => parseQuoteRequest(quoteQuery({ fromChain: 'dogecoin' })), SwapInputError);
  assert.throws(() => parseQuoteRequest(quoteQuery({ amount: '0' })), /amount/);
  assert.throws(() => parseQuoteRequest(quoteQuery({ slippageBps: '9000' })), /Slippage/);
  assert.throws(() => parseQuoteRequest(quoteQuery({ taker: SOL_A })), /Connect the wallet/);
  // EVM -> Solana: the recipient must be a Solana account.
  assert.throws(() => parseQuoteRequest(quoteQuery({ toChain: 'solana', buy: SOL_MINT, toAddress: EVM_A })), /receive/);
  assert.equal(parseQuoteRequest(quoteQuery({ toChain: 'solana', buy: SOL_MINT, toAddress: SOL_A })).toAddress, SOL_A);
});

test('quotes: the client token is added server-side and the shared filter picks among safe candidates', async () => {
  const good = ethToUsdc({ buyAmountRaw: '1000000', minBuyAmountRaw: '990000' });
  const better = ethToUsdc({ buyAmountRaw: '1100000', minBuyAmountRaw: '1089000' });
  const outdated = { ...ethToUsdc({ buyAmountRaw: '1200000', minBuyAmountRaw: '1188000' }), appFee: undefined };
  const { calls, fetchImpl } = fakeWorker({
    '/quote': () => ({ body: { quote: good, candidates: [good, better, outdated] } }),
  });
  const svc = createSwapService({ fetchImpl, clientToken: 'server-only-token', workerUrl: 'https://worker.test' });
  const out = await svc.quote(quoteQuery());
  assert.equal(calls[0].headers['x-mm-client'], 'server-only-token');
  assert.ok(!JSON.stringify(out).includes('server-only-token'), 'the token never reaches the browser');
  assert.ok(out.quote, out.error);
  assert.ok(out.routing.excluded.some(r => /older version/.test(r)), 'the stale-Worker quote is excluded with its reason');
  // Both safe routes compared; the better net result wins.
  assert.equal(out.routing.safeCandidates, 2);
  assert.equal(out.quote.buyAmountRaw, '1100000');
});

test('quotes: a quote paying a stranger never reaches the page', async () => {
  const stranger = ethToUsdc({ appFee: { ...ethToUsdc().appFee, recipient: '0x9999999999999999999999999999999999999999' } });
  const { fetchImpl } = fakeWorker({ '/quote': () => ({ body: { quote: stranger, candidates: [stranger] } }) });
  const out = await createSwapService({ fetchImpl }).quote(quoteQuery());
  assert.equal(out.quote, null);
  assert.match(out.error, /No route could be offered safely/);
});

test('Jupiter: the fee account is derived, checked on-chain, then passed to the Worker', async () => {
  const feeAccount = vectors.pdas.find(p => p.mint === SOL_MINT).pda;
  const accountInfo = (owner, mint) => ({ body: { jsonrpc: '2.0', id: 1, result: { value: { owner, data: { parsed: { type: 'account', info: { mint } } } } } } });
  const solQuery = quoteQuery({
    fromChain: 'solana', toChain: 'solana', sell: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', buy: SOL_MINT,
    taker: SOL_A, toAddress: SOL_A, fromDecimals: '6', toDecimals: '9', amount: '5000000',
  });
  for (const [label, info, expectFee] of [
    ['valid account', accountInfo(TOKEN_PROGRAM, SOL_MINT), true],
    ['wrong mint', accountInfo(TOKEN_PROGRAM, 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'), false],
    ['missing', { body: { jsonrpc: '2.0', id: 1, result: { value: null } } }, false],
  ]) {
    const { calls, fetchImpl } = fakeWorker({
      '/rpc/helius': () => info,
      '/quote': () => ({ body: { quote: null, candidates: [], error: 'no route' } }),
    });
    const out = await createSwapService({ fetchImpl }).quote(solQuery);
    const rpc = calls.find(c => c.path === '/rpc/helius');
    assert.equal(rpc.body.params[0], feeAccount, label);
    const q = calls.find(c => c.path === '/quote');
    assert.equal(q.params.solFeeAccount === feeAccount, expectFee, label);
    assert.ok(out.error);
  }
  // Disabled by configuration: no lookup, and the Worker quotes Jupiter fee-free.
  const { calls, fetchImpl } = fakeWorker({ '/quote': () => ({ body: { candidates: [] } }) });
  await createSwapService({ fetchImpl, jupiterFee: false }).quote(solQuery);
  assert.equal(calls.some(c => c.path === '/rpc/helius'), false);
  assert.equal(calls.find(c => c.path === '/quote').params.solFeeAccount, undefined);
});

test('token search is cached briefly and sanitized', async () => {
  let t = 1000;
  const { calls, fetchImpl } = fakeWorker({
    '/tokens': () => ({ body: { tokens: [
      { chain: 'base', symbol: 'DEGEN', name: 'Degen', address: '0x4ed4E862860beD51a9570b96d89aF5E1B0Efefed', decimals: 18 },
      { chain: 'base', symbol: 'BAD', name: 'no address', address: 'nope', decimals: 18 },
    ] } }),
  });
  const svc = createSwapService({ fetchImpl, now: () => t });
  const a = await svc.tokens({ chain: 'base', q: 'degen' });
  await svc.tokens({ chain: 'base', q: 'DEGEN' });
  assert.equal(calls.length, 1, 'second search served from cache');
  assert.deepEqual(a.tokens.map(x => x.symbol), ['DEGEN']);
  t += 61_000;
  await svc.tokens({ chain: 'base', q: 'degen' });
  assert.equal(calls.length, 2, 'cache expires after 60 s');
});

test('source-transaction status: Solana signature statuses and EVM receipts', async () => {
  const { fetchImpl } = fakeWorker({
    '/rpc/helius': () => ({ body: { result: { value: [{ confirmationStatus: 'confirmed', err: null }] } } }),
    '/rpc/alchemy/base-mainnet': () => ({ body: { result: { status: '0x0' } } }),
  });
  const svc = createSwapService({ fetchImpl });
  assert.deepEqual(await svc.txStatus({ chain: 'solana', hash: '5'.repeat(88) }), { state: 'confirmed' });
  assert.deepEqual(await svc.txStatus({ chain: 'base', hash: `0x${'a'.repeat(64)}` }), { state: 'failed' });
  await assert.rejects(svc.txStatus({ chain: 'base', hash: 'nope' }), SwapInputError);
});
