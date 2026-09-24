/**
 * The page's persisted swap record: the same shared settlement logic as the
 * wallet, kept in localStorage so a reload or browser restart resumes it.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { createStore, STORAGE_KEY, UNSENT_FINAL_AFTER_MS } = require('../public/dex-swap-store');
const { core, EVM_A, SOL_A, NATIVE, SOL_MINT, ethToUsdc } = require('./dex-fixtures');

class MemoryStorage {
  constructor() { this.data = new Map(); }
  getItem(k) { return this.data.has(k) ? this.data.get(k) : null; }
  setItem(k, v) { this.data.set(k, String(v)); }
}

const USDC_SOL = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const tokens = { from: { symbol: 'MON', decimals: 18 }, to: { symbol: 'SOL', decimals: 9 } };

/** A cross-chain MON -> SOL quote paid to a SEPARATE Solana account. */
function monToSol() {
  return {
    ...ethToUsdc(), provider: 'lifi', fromChain: 'monad', toChain: 'solana', fromTokenAddress: NATIVE, toTokenAddress: SOL_MINT,
    fromTokenSymbol: 'MON', toTokenSymbol: 'SOL', sellAmountRaw: '55000000000000000000',
    buyAmountRaw: '12017756', minBuyAmountRaw: '11424383', bridgeTool: 'relaydepository', toAddress: SOL_A, isCrossChain: true,
    appFee: null,
  };
}

function started(storage, t) {
  const store = createStore(core, storage, () => t.now);
  const q = monToSol();
  const approved = core.approveSwap(q, { sourceAccount: EVM_A, destinationAccount: SOL_A }, 143);
  const id = store.open(q, approved, tokens);
  store.noteBroadcast(id, `0x${'4'.repeat(64)}`, null);
  return { store, id };
}

test('restart: a new page instance resumes the same session from storage', () => {
  const storage = new MemoryStorage();
  const t = { now: Date.now() };
  const { id } = started(storage, t);
  // "Restart": nothing survives but storage.
  const after = createStore(core, storage, () => t.now);
  const s = after.get(id);
  assert.equal(s.recipient, SOL_A, 'the separate Solana destination account is kept');
  assert.equal(s.walletId, `${EVM_A}|${SOL_A}`);
  assert.equal(s.state, 'source-submitted');
  assert.deepEqual(after.pending().map(x => x.id), [id]);
  after.noteReceipt(id, s.sourceTxHash, true);
  assert.equal(after.get(id).state, 'bridging');
  after.applyWorkerStatus(id, { providerStatus: 'DONE', providerSubstatus: 'COMPLETED', receivedTokenAddress: '11111111111111111111111111111111', receivedTokenChain: '1151111081099710', receivedTokenSymbol: 'SOL', receivedTokenDecimals: 9, receivedAmountRaw: '12026493', destTxHash: '2uise' });
  assert.equal(after.get(id).state, 'completed', 'native SOL spelled as the system program is the asked-for asset');
  assert.deepEqual(after.pending(), []);
});

test('partial delivery: a bridged asset instead of the requested token', () => {
  const storage = new MemoryStorage();
  const t = { now: Date.now() };
  const { store, id } = started(storage, t);
  store.noteReceipt(id, `0x${'4'.repeat(64)}`, true);
  const s = store.applyWorkerStatus(id, {
    providerStatus: 'DONE', providerSubstatus: 'PARTIAL', receivedTokenAddress: USDC_SOL, receivedTokenSymbol: 'USDC',
    receivedTokenDecimals: 6, receivedTokenChain: '1151111081099710', receivedAmountRaw: '4900000',
  });
  assert.equal(s.state, 'partial');
  assert.match(s.message, /received USDC instead/);
  assert.equal(core.isSwapSuccess(s.state), false);
});

test('refunds: in progress, then refunded on the source chain — never success', () => {
  const storage = new MemoryStorage();
  const t = { now: Date.now() };
  const { store, id } = started(storage, t);
  store.noteReceipt(id, `0x${'4'.repeat(64)}`, true);
  assert.equal(store.applyWorkerStatus(id, { providerStatus: 'FAILED', providerSubstatus: 'REFUND_IN_PROGRESS' }).state, 'refund-pending');
  assert.equal(store.pending().length, 1, 'a pending refund keeps being tracked');
  const s = store.applyWorkerStatus(id, { providerStatus: 'DONE', providerSubstatus: 'REFUNDED', receivedTokenAddress: NATIVE, receivedTokenChain: '143' });
  assert.equal(s.state, 'refunded');
  assert.match(s.message, /returned on the source chain/);
  assert.deepEqual(store.pending(), []);
});

test('a delivery below the approved minimum is partial, whatever the provider says', () => {
  const storage = new MemoryStorage();
  const t = { now: Date.now() };
  const { store, id } = started(storage, t);
  store.noteReceipt(id, `0x${'4'.repeat(64)}`, true);
  const s = store.applyWorkerStatus(id, { providerStatus: 'DONE', providerSubstatus: 'COMPLETED', receivedTokenAddress: SOL_MINT, receivedTokenChain: 'solana', receivedAmountRaw: '11000000' });
  assert.equal(s.state, 'partial');
  assert.match(s.message, /less than the minimum you approved/);
});

test('a transient status failure changes nothing', () => {
  const storage = new MemoryStorage();
  const t = { now: Date.now() };
  const { store, id } = started(storage, t);
  const before = storage.getItem(STORAGE_KEY);
  store.applyWorkerStatus(id, { transient: true });
  assert.equal(storage.getItem(STORAGE_KEY), before);
});

test('rejected or refused before the swap: recorded as not sent, the approval kept', () => {
  const storage = new MemoryStorage();
  const t = { now: Date.now() };
  const store = createStore(core, storage, () => t.now);
  const q = ethToUsdc();
  const id = store.open(q, core.approveSwap(q, { sourceAccount: EVM_A, destinationAccount: EVM_A }, 1), { from: { symbol: 'ETH', decimals: 18 }, to: { symbol: 'USDC', decimals: 6 } });
  store.notePreSwapTx(id, `0x${'a'.repeat(64)}`);
  store.noteNotSent(id, 'The swap was declined in your wallet.');
  const s = store.get(id);
  assert.equal(s.sourceTxState, 'not-sent');
  assert.equal(s.state, 'failed');
  assert.match(s.message, /No swap was sent/);
  assert.match(s.message, /approval transaction/);
  assert.equal(s.approvalTxHash, `0x${'a'.repeat(64)}`);
});

test('a session that never got a swap is closed out once its quote is long gone', () => {
  const storage = new MemoryStorage();
  const t = { now: Date.now() };
  const store = createStore(core, storage, () => t.now);
  const q = ethToUsdc();
  const id = store.open(q, core.approveSwap(q, { sourceAccount: EVM_A, destinationAccount: EVM_A }, 1), { from: { symbol: 'ETH', decimals: 18 }, to: { symbol: 'USDC', decimals: 6 } });
  store.finaliseUnsent();
  assert.equal(store.get(id).state, 'source-submitted', 'not yet: the quote could still be in use');
  t.now += UNSENT_FINAL_AFTER_MS + 1;
  store.finaliseUnsent();
  assert.equal(store.get(id).sourceTxState, 'not-sent');
});

test('same-chain: the receipt completes the swap and marks the in-swap fee collected', () => {
  const storage = new MemoryStorage();
  const t = { now: Date.now() };
  const store = createStore(core, storage, () => t.now);
  const q = ethToUsdc();
  const id = store.open(q, core.approveSwap(q, { sourceAccount: EVM_A, destinationAccount: EVM_A }, 1), { from: { symbol: 'ETH', decimals: 18 }, to: { symbol: 'USDC', decimals: 6 } });
  store.noteBroadcast(id, `0x${'b'.repeat(64)}`, null);
  assert.equal(store.get(id).fee.state, 'submitted');
  store.noteReceipt(id, `0x${'b'.repeat(64)}`, true);
  assert.equal(store.get(id).state, 'completed');
  assert.equal(store.get(id).fee.state, 'collected-onchain');
});

test('Relay payout evidence is attached when the provider publishes it', () => {
  const storage = new MemoryStorage();
  const t = { now: Date.now() };
  const store = createStore(core, storage, () => t.now);
  const q = {
    ...ethToUsdc(), provider: 'relay', fromChain: 'monad', toChain: 'ethereum', isCrossChain: true, requestId: '0xreq',
    appFee: { ...ethToUsdc().appFee, provider: 'relay', chain: 'monad', recipientKind: 'provider-intent', tokenAddress: '0x754704bc059f8c67012fed69bc8a327a5aafb603', tokenSymbol: 'USDC', tokenDecimals: 6, amountRaw: '52904' },
  };
  const id = store.open(q, core.approveSwap(q, { sourceAccount: EVM_A, destinationAccount: EVM_A }, 143), tokens);
  store.noteBroadcast(id, `0x${'c'.repeat(64)}`, null);
  store.noteReceipt(id, `0x${'c'.repeat(64)}`, true);
  const s = store.applyWorkerStatus(id, {
    providerStatus: 'success', receivedTokenAddress: USDC_SOL, receivedTokenChain: '1',
    paidAppFees: [{ recipient: core.SWAP_FEE_BENEFICIARIES.evm, amount: '52861', currency: '0x754704bc059f8c67012fed69bc8a327a5aafb603' }],
  });
  assert.ok(s.fee.payout, 'payout evidence recorded');
});
