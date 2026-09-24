const test = require('node:test');
const assert = require('node:assert/strict');
const {
  SwapWalletError, planSwap, createEvmSigner, createSolanaSigner, executePlan, base58Encode,
} = require('../public/swap-wallet-adapter');

const EVM_A = '0x01faF6DFc230d755141D84d7cB980dd68f5Efe13';
const EVM_B = '0x2222222222222222222222222222222222222222';
const SOL_A = '3noTuHnQdHkat2w5rBx18vAACMzFUvB5LodEe5vMN98d';
const SOL_B = '8oW1Poc2q14NgEbtCQAU8tBF6rXMMjf2FGWU9Tfda9rS';
const TOKEN = '0x4ed4E862860beD51a9570b96d89aF5E1B0Efefed';
const ROUTER = '0x0000000000001fF3684f28c67538d4D072C22734';
const NOW = 1_800_000_000_000;
const now = () => NOW;
const accept = () => {};

const evmQuote = (over = {}) => ({
  provider: '0x', fromChain: 'base', toChain: 'base',
  fromTokenAddress: TOKEN, toTokenAddress: '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
  sellAmountRaw: '1000', buyAmountRaw: '5', expiresAt: NOW + 30_000,
  txData: { to: ROUTER, data: '0xabcdef', value: '0' },
  approvalTx: { to: TOKEN, data: '0x095ea7b3' + '00'.repeat(64), value: '0' },
  ...over,
});
const solQuote = (over = {}) => ({
  provider: 'jupiter', fromChain: 'solana', toChain: 'solana',
  fromTokenAddress: 'So11111111111111111111111111111111111111112', toTokenAddress: 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263',
  sellAmountRaw: '10', buyAmountRaw: '10', expiresAt: NOW + 30_000,
  txData: { swapTransaction: Buffer.from([1, 2, 3, 250]).toString('base64') },
  ...over,
});

/** Minimal EIP-1193 wallet: records calls, emits events, mines on demand. */
class FakeEvmWallet {
  constructor({ account = EVM_A, chainId = 8453 } = {}) {
    this.account = account;
    this.chainId = chainId;
    this.calls = [];
    this.listeners = new Map();
    this.receipts = new Map();
    this.sendBehaviour = [];   // per call: 'ok' | { code, message }
    this.knownChains = new Set([1, 8453, 42161]);
    this.lateEcho = false;
    this.onSend = null;
  }
  on(event, fn) { this.listeners.set(event, [...(this.listeners.get(event) || []), fn]); }
  removeListener(event, fn) { this.listeners.set(event, (this.listeners.get(event) || []).filter(f => f !== fn)); }
  emit(event, value) { for (const fn of this.listeners.get(event) || []) fn(value); }
  async request({ method, params }) {
    this.calls.push(method);
    switch (method) {
      case 'eth_accounts': case 'eth_requestAccounts': return [this.account];
      case 'eth_chainId': return '0x' + this.chainId.toString(16);
      case 'wallet_switchEthereumChain': {
        const id = Number.parseInt(params[0].chainId, 16);
        if (!this.knownChains.has(id)) throw Object.assign(new Error('Unrecognized chain'), { code: 4902 });
        this.chainId = id;
        const echo = () => this.emit('chainChanged', '0x' + id.toString(16));
        if (this.lateEcho) setTimeout(echo, 5); else echo();
        return null;
      }
      case 'eth_sendTransaction': {
        const behaviour = this.sendBehaviour.shift() || 'ok';
        if (behaviour !== 'ok') throw Object.assign(new Error(behaviour.message || 'fail'), behaviour);
        const hash = '0x' + String(this.calls.filter(c => c === 'eth_sendTransaction').length).padStart(64, '0');
        this.lastTx = params[0];
        this.sent = [...(this.sent || []), params[0]];
        this.onSend?.(hash, params[0]);
        return hash;
      }
      case 'eth_getTransactionReceipt': return this.receipts.get(params[0]) ?? null;
      default: throw new Error(`unexpected ${method}`);
    }
  }
}

const fastWait = { pollMs: 1, receiptTimeoutMs: 50, timeoutMs: 50, sleep: () => new Promise(r => setTimeout(r, 1)) };

test('no plan without the shared swap validation', () => {
  assert.throws(() => planSwap(evmQuote(), { sourceAccount: EVM_A, destinationAccount: EVM_A, evmChainId: 8453, now }),
    err => err instanceof SwapWalletError && err.code === 'validator-required');
});

test('a validator refusal stops planning', () => {
  assert.throws(() => planSwap(evmQuote(), {
    sourceAccount: EVM_A, destinationAccount: EVM_A, evmChainId: 8453, now,
    validateQuote: () => { throw new Error('Approval spender is invalid.'); },
  }), /Approval spender is invalid/);
});

test('source and destination accounts are explicit and must match the quote', () => {
  const base = { sourceAccount: EVM_A, evmChainId: 8453, validateQuote: accept, now };
  // A quote with a recipient must pay the chosen destination.
  assert.throws(() => planSwap(evmQuote({ toAddress: EVM_B }), { ...base, destinationAccount: EVM_A }), /pays a different account/);
  assert.equal(planSwap(evmQuote({ toAddress: EVM_B }), { ...base, destinationAccount: EVM_B }).destinationAccount, EVM_B);
  // EVM -> Solana: the destination is a Solana account from another wallet.
  const cross = evmQuote({ toChain: 'solana', toAddress: SOL_A });
  assert.equal(planSwap(cross, { ...base, destinationAccount: SOL_A }).destinationAccount, SOL_A);
  assert.throws(() => planSwap(cross, { ...base, destinationAccount: EVM_A }), /Solana account to receive/);
  // A quote with no recipient pays the signer, so it cannot serve another account.
  assert.throws(() => planSwap(evmQuote(), { ...base, destinationAccount: EVM_B }), /pays the signing account/);
});

test('EVM plan: approval before swap, from the source account, values in hex', () => {
  const plan = planSwap(evmQuote({ txData: { to: ROUTER, data: '0xab', value: '1000' }, approvalTx: null, fromTokenAddress: '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee' }),
    { sourceAccount: EVM_A, destinationAccount: EVM_A, evmChainId: 8453, validateQuote: accept, now });
  assert.deepEqual(plan.steps.map(s => s.kind), ['swap']);
  assert.deepEqual(plan.steps[0].tx, { from: EVM_A, to: ROUTER, data: '0xab', value: '0x3e8' });
  const withApproval = planSwap(evmQuote(), { sourceAccount: EVM_A, destinationAccount: EVM_A, evmChainId: 8453, validateQuote: accept, now });
  assert.deepEqual(withApproval.steps.map(s => s.kind), ['approval', 'swap']);
  assert.ok(Object.isFrozen(withApproval.steps[0].tx));
});

test('plans refuse an expired quote, an unknown network and malformed transactions', () => {
  const o = { sourceAccount: EVM_A, destinationAccount: EVM_A, validateQuote: accept, now };
  assert.throws(() => planSwap(evmQuote({ expiresAt: NOW }), { ...o, evmChainId: 8453 }), e => e.code === 'expired');
  assert.throws(() => planSwap(evmQuote(), o), /source network could not be identified/);
  assert.throws(() => planSwap(evmQuote({ txData: { to: 'router', data: '0x' } }), { ...o, evmChainId: 8453 }), /signable EVM transaction/);
  assert.throws(() => planSwap(solQuote({ approvalTx: evmQuote().approvalTx }), { ...o, sourceAccount: SOL_A, destinationAccount: SOL_A }), /exactly one Solana transaction/);
});

test('EVM execution: approval confirmed on-chain before the swap is signed', async () => {
  const wallet = new FakeEvmWallet();
  wallet.onSend = (hash) => wallet.receipts.set(hash, { status: '0x1' });
  const signer = createEvmSigner({ kind: 'evm-eip6963', provider: wallet });
  const plan = planSwap(evmQuote(), { sourceAccount: EVM_A, destinationAccount: EVM_A, evmChainId: 8453, validateQuote: accept, now });
  const events = [];
  const result = await executePlan(plan, signer, { ...fastWait, now, onStep: e => events.push(`${e.kind}:${e.status}`) });
  assert.deepEqual(result.sent.map(s => s.kind), ['approval', 'swap']);
  assert.deepEqual(events, ['approval:signing', 'approval:sent', 'approval:confirmed', 'swap:signing', 'swap:sent']);
  const sends = wallet.calls.map((c, i) => [c, i]).filter(([c]) => c === 'eth_sendTransaction').map(([, i]) => i);
  const receiptCheck = wallet.calls.indexOf('eth_getTransactionReceipt');
  assert.ok(sends[0] < receiptCheck && receiptCheck < sends[1], 'receipt read between approval and swap');
  signer.dispose();
});

test('switches to the quote network first; the wallet echoing that switch late does not cancel', async () => {
  const wallet = new FakeEvmWallet({ chainId: 1 });
  wallet.lateEcho = true;   // chainChanged arrives ~5 ms after the switch resolves
  let echoed = false;
  wallet.on('chainChanged', () => { echoed = true; });
  // The approval confirms only after 20 ms, so the echo lands mid-plan.
  wallet.onSend = (hash) => setTimeout(() => wallet.receipts.set(hash, { status: '0x1' }), 20);
  const signer = createEvmSigner({ kind: 'evm-legacy', provider: wallet });
  const plan = planSwap(evmQuote(), { sourceAccount: EVM_A, destinationAccount: EVM_A, evmChainId: 8453, validateQuote: accept, now });
  const result = await executePlan(plan, signer, { ...fastWait, now });
  assert.equal(echoed, true, 'the echo arrived before the swap step');
  assert.equal(wallet.chainId, 8453);
  assert.deepEqual(result.sent.map(s => s.kind), ['approval', 'swap']);
});

test('an account change during the approval wait stops the swap and reports the approval', async () => {
  const wallet = new FakeEvmWallet();
  wallet.onSend = (hash) => {
    wallet.receipts.set(hash, { status: '0x1' });
    wallet.account = EVM_B;
    wallet.emit('accountsChanged', [EVM_B]);
  };
  const signer = createEvmSigner({ kind: 'evm-eip6963', provider: wallet });
  const plan = planSwap(evmQuote(), { sourceAccount: EVM_A, destinationAccount: EVM_A, evmChainId: 8453, validateQuote: accept, now });
  await assert.rejects(executePlan(plan, signer, { ...fastWait, now }), err => {
    assert.equal(err.code, 'account-changed');
    assert.deepEqual(err.sent.map(s => s.kind), ['approval']);
    return true;
  });
  assert.equal(wallet.sent.length, 1, 'the swap was never sent');
});

test('a network change between steps also stops the swap', async () => {
  const wallet = new FakeEvmWallet();
  wallet.onSend = (hash) => { wallet.receipts.set(hash, { status: '0x1' }); wallet.chainId = 1; wallet.emit('chainChanged', '0x1'); };
  const signer = createEvmSigner({ kind: 'evm-eip6963', provider: wallet });
  const plan = planSwap(evmQuote(), { sourceAccount: EVM_A, destinationAccount: EVM_A, evmChainId: 8453, validateQuote: accept, now });
  await assert.rejects(executePlan(plan, signer, { ...fastWait, now }), err => err.code === 'account-changed' && err.sent.length === 1);
  assert.equal(wallet.sent.length, 1);
});

test('declining the swap after the approval is reported with the approval hash', async () => {
  const wallet = new FakeEvmWallet();
  wallet.onSend = (hash) => wallet.receipts.set(hash, { status: '0x1' });
  wallet.sendBehaviour = ['ok', { code: 4001, message: 'User rejected' }];
  const signer = createEvmSigner({ kind: 'evm-eip6963', provider: wallet });
  const plan = planSwap(evmQuote(), { sourceAccount: EVM_A, destinationAccount: EVM_A, evmChainId: 8453, validateQuote: accept, now });
  await assert.rejects(executePlan(plan, signer, { ...fastWait, now }), err => {
    assert.equal(err.code, 'rejected');
    assert.match(err.message, /swap was declined/);
    assert.equal(err.sent[0].kind, 'approval');
    return true;
  });
});

test('a failed or unconfirmed approval never leads to a swap', async () => {
  for (const [receipt, code] of [[{ status: '0x0' }, 'step-failed'], [null, 'not-confirmed']]) {
    const wallet = new FakeEvmWallet();
    wallet.onSend = (hash) => { if (receipt) wallet.receipts.set(hash, receipt); };
    const signer = createEvmSigner({ kind: 'evm-eip6963', provider: wallet });
    const plan = planSwap(evmQuote(), { sourceAccount: EVM_A, destinationAccount: EVM_A, evmChainId: 8453, validateQuote: accept, now });
    await assert.rejects(executePlan(plan, signer, { ...fastWait }), err => err.code === code && err.sent.length === 1);
    assert.equal(wallet.sent.length, 1, `${code}: only the approval went out`);
  }
});

test('the wrong account or a missing network sends nothing', async () => {
  const other = new FakeEvmWallet({ account: EVM_B });
  const plan = planSwap(evmQuote(), { sourceAccount: EVM_A, destinationAccount: EVM_A, evmChainId: 8453, validateQuote: accept, now });
  await assert.rejects(executePlan(plan, createEvmSigner({ provider: other }), { ...fastWait, now }), err => err.code === 'wrong-account' && err.sent.length === 0);

  const missing = new FakeEvmWallet({ chainId: 1 });
  const onUnknown = planSwap(evmQuote(), { sourceAccount: EVM_A, destinationAccount: EVM_A, evmChainId: 2741, validateQuote: accept, now });
  await assert.rejects(executePlan(onUnknown, createEvmSigner({ provider: missing }), { ...fastWait, now }), err => err.code === 'network-missing');
  assert.equal(other.sent, undefined);
  assert.equal(missing.sent, undefined);
});

test('a quote that expires mid-plan stops before the next signature', async () => {
  let t = NOW;
  const wallet = new FakeEvmWallet();
  wallet.onSend = (hash) => { wallet.receipts.set(hash, { status: '0x1' }); t = NOW + 60_000; };
  const plan = planSwap(evmQuote(), { sourceAccount: EVM_A, destinationAccount: EVM_A, evmChainId: 8453, validateQuote: accept, now });
  await assert.rejects(executePlan(plan, createEvmSigner({ provider: wallet }), { ...fastWait, now: () => t }), err => err.code === 'expired' && err.sent.length === 1);
});

test('Solana (Wallet Standard): signs the serialized bytes on mainnet and returns a base58 signature', async () => {
  let received = null;
  const wallet = {
    accounts: [{ address: SOL_A }],
    features: {
      'standard:connect': { connect: async () => ({ accounts: [{ address: SOL_A }] }) },
      'standard:events': { on: () => () => {} },
      'solana:signAndSendTransaction': {
        signAndSendTransaction: async (input) => { received = input; return [{ signature: new Uint8Array([0, 0, 1]) }]; },
      },
    },
  };
  const signer = createSolanaSigner({ kind: 'solana-standard', provider: wallet });
  assert.equal(await signer.connect(), SOL_A);
  const plan = planSwap(solQuote(), { sourceAccount: SOL_A, destinationAccount: SOL_A, validateQuote: accept, now });
  const result = await executePlan(plan, signer, { now });
  assert.deepEqual([...received.transaction], [1, 2, 3, 250]);
  assert.equal(received.chain, 'solana:mainnet');
  assert.equal(received.account.address, SOL_A);
  assert.equal(result.sent[0].hash, '112');
});

test('Solana: the wrong account signs nothing; the legacy path sends base58 bytes', async () => {
  let called = false;
  const standard = {
    accounts: [{ address: SOL_B }],
    features: { 'solana:signAndSendTransaction': { signAndSendTransaction: async () => { called = true; return []; } } },
  };
  const plan = planSwap(solQuote(), { sourceAccount: SOL_A, destinationAccount: SOL_A, validateQuote: accept, now });
  await assert.rejects(executePlan(plan, createSolanaSigner({ kind: 'solana-standard', provider: standard }), { now }), err => err.code === 'wrong-account');
  assert.equal(called, false);

  let message = null;
  const legacy = { publicKey: { toString: () => SOL_A }, request: async ({ params }) => { message = params.message; return { signature: 'sig' }; } };
  const result = await executePlan(plan, createSolanaSigner({ kind: 'solana-legacy', provider: legacy }), { now });
  assert.equal(message, base58Encode(new Uint8Array([1, 2, 3, 250])));
  assert.equal(result.sent[0].hash, 'sig');
});

test('wallets that cannot sign, or the wrong ecosystem, are refused', async () => {
  assert.throws(() => createSolanaSigner({ kind: 'solana-standard', provider: { features: {} } }), e => e.code === 'unsupported-wallet');
  assert.throws(() => createEvmSigner({ provider: {} }), e => e.code === 'unsupported-wallet');
  const plan = planSwap(solQuote(), { sourceAccount: SOL_A, destinationAccount: SOL_A, validateQuote: accept, now });
  await assert.rejects(executePlan(plan, createEvmSigner({ provider: new FakeEvmWallet() })), e => e.code === 'invalid-plan');
});

test('base58 matches the standard alphabet', () => {
  assert.equal(base58Encode(Buffer.from('Hello World!')), '2NEpo7TZRRrLZSi2U');
  assert.equal(base58Encode(new Uint8Array([0, 0, 0])), '111');
});
