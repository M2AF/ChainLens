/**
 * swap-wallet-adapter.js — ChainLens's host signing adapter for DEX swaps.
 *
 * Stage 5 of MAGIC_MONEY_SWAP_CLAUDE_PLAN.md: the same swap logic runs in Magic
 * Money and ChainLens, and host-specific signing is the principal difference.
 * In Magic Money the privileged layer signs with the wallet's own keys; here the
 * user's CONNECTED wallet signs, and ChainLens never holds key material.
 *
 * What this module owns (host concerns only):
 *   - turning a normalized swap quote into an ordered plan for explicit source
 *     and destination accounts (they may be different wallets/ecosystems);
 *   - checking, before EVERY signature, that the wallet is still on the plan's
 *     account and network, and that neither changed since the plan started;
 *   - approval → confirmed receipt → swap sequencing, reporting what was sent
 *     if a later step is rejected or fails;
 *   - Solana signing through Wallet Standard serialized bytes (no web3.js).
 *
 * What it deliberately does NOT own: judging the quote itself (fee terms,
 * minimum received, spender/target rules, simulation). That is the shared swap
 * core's job, injected as `validateQuote`; without it no plan is produced.
 *
 * Input records are the ones public/wallet-providers.js discovers
 * ({ kind: 'evm-eip6963' | 'evm-legacy' | 'solana-standard' | 'solana-legacy', provider }).
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ChainLensSwapWallet = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const USER_REJECTED = 4001;
  const UNRECOGNIZED_CHAIN = 4902;
  const SOLANA_MAINNET = 'solana:mainnet';

  class SwapWalletError extends Error {
    /**
     * @param {'validator-required'|'invalid-plan'|'expired'|'wrong-account'|'wrong-network'|
     *   'network-missing'|'account-changed'|'rejected'|'step-failed'|'not-confirmed'|'unsupported-wallet'} code
     * @param {string} message
     * @param {{ sent?: Array<{ kind: string, hash: string }> }} [extra]
     */
    constructor(code, message, extra = {}) {
      super(message);
      this.name = 'SwapWalletError';
      this.code = code;
      // Transactions already broadcast when this error was raised. A host must
      // record these (an approval that went out without its swap, for example).
      this.sent = extra.sent || [];
    }
  }

  // ── Encoding helpers ─────────────────────────────────────────────────────────

  const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

  const base58Encode = (bytes) => {
    let n = 0n;
    for (const b of bytes) n = (n << 8n) + BigInt(b);
    let out = '';
    while (n > 0n) { out = B58[Number(n % 58n)] + out; n /= 58n; }
    for (const b of bytes) { if (b !== 0) break; out = '1' + out; }
    return out;
  };

  const base64ToBytes = (b64) => {
    if (typeof atob === 'function') return Uint8Array.from(atob(b64), c => c.charCodeAt(0));
    return new Uint8Array(Buffer.from(b64, 'base64'));
  };

  const EVM_ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;
  const SOLANA_ADDRESS_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
  const HEX_DATA_RE = /^0x(?:[0-9a-fA-F]{2})*$/;
  const UINT_RE = /^(?:0|[1-9]\d*)$/;

  const isEvmAddress = v => typeof v === 'string' && EVM_ADDRESS_RE.test(v);
  const isSolanaAddress = v => typeof v === 'string' && SOLANA_ADDRESS_RE.test(v);
  const sameEvm = (a, b) => isEvmAddress(a) && isEvmAddress(b) && a.toLowerCase() === b.toLowerCase();
  const ecosystemOf = chain => (chain === 'solana' ? 'solana' : 'evm');
  const sameAccount = (ecosystem, a, b) => (ecosystem === 'evm' ? sameEvm(a, b) : isSolanaAddress(a) && a === b);
  const validAccount = (ecosystem, v) => (ecosystem === 'evm' ? isEvmAddress(v) : isSolanaAddress(v));

  const toHexQuantity = (value) => {
    const s = String(value ?? '0');
    if (/^0x[0-9a-fA-F]+$/.test(s)) return '0x' + BigInt(s).toString(16);
    if (!UINT_RE.test(s)) throw new SwapWalletError('invalid-plan', 'Transaction value is not a whole number.');
    return '0x' + BigInt(s).toString(16);
  };

  // ── Plan ─────────────────────────────────────────────────────────────────────

  /**
   * Build the ordered signing plan for a quote.
   *
   * @param {object} quote NormalizedSwapQuote (Magic Money swap-proxy contract)
   * @param {object} opts
   * @param {string} opts.sourceAccount    connected account that signs and pays
   * @param {string} opts.destinationAccount account that must receive the output
   * @param {number} [opts.evmChainId]     numeric chain id for an EVM source
   * @param {(quote: object) => void} opts.validateQuote shared-core validation; throws on refusal
   * @param {() => number} [opts.now]
   */
  function planSwap(quote, opts = {}) {
    const { sourceAccount, destinationAccount, evmChainId, validateQuote, now = Date.now } = opts;
    if (typeof validateQuote !== 'function') {
      throw new SwapWalletError('validator-required', 'Swap quotes must pass the shared swap validation before a wallet is asked to sign.');
    }
    if (!quote || typeof quote !== 'object') throw new SwapWalletError('invalid-plan', 'Invalid swap quote.');
    validateQuote(quote);

    const source = ecosystemOf(quote.fromChain);
    const destination = ecosystemOf(quote.toChain);
    if (!validAccount(source, sourceAccount)) {
      throw new SwapWalletError('invalid-plan', `Connect a ${source === 'evm' ? 'EVM' : 'Solana'} wallet for the source account.`);
    }
    if (!validAccount(destination, destinationAccount)) {
      throw new SwapWalletError('invalid-plan', `Choose a ${destination === 'evm' ? 'EVM' : 'Solana'} account to receive this swap.`);
    }
    if (quote.toAddress) {
      if (!sameAccount(destination, quote.toAddress, destinationAccount)) {
        throw new SwapWalletError('invalid-plan', 'This quote pays a different account than the one you chose. Refresh the quote.');
      }
    } else if (source !== destination || !sameAccount(source, sourceAccount, destinationAccount)) {
      // A quote without a recipient pays the signer: it cannot serve another account.
      throw new SwapWalletError('invalid-plan', 'This quote pays the signing account; request a quote for the chosen recipient.');
    }
    if (!Number.isFinite(quote.expiresAt) || quote.expiresAt <= now()) {
      throw new SwapWalletError('expired', 'This quote has expired. Refresh it and try again.');
    }

    const txData = quote.txData || {};
    if (source === 'solana') {
      if (!txData.swapTransaction || txData.to || txData.data || quote.approvalTx || quote.permitTx) {
        throw new SwapWalletError('invalid-plan', 'This Solana quote does not contain exactly one Solana transaction.');
      }
      return Object.freeze({
        ecosystem: 'solana', sourceAccount, destinationAccount, chainId: null, expiresAt: quote.expiresAt,
        steps: Object.freeze([Object.freeze({ kind: 'swap', bytes: base64ToBytes(txData.swapTransaction) })]),
      });
    }

    if (!Number.isInteger(evmChainId) || evmChainId <= 0) {
      throw new SwapWalletError('invalid-plan', 'The source network could not be identified.');
    }
    if (txData.swapTransaction || !isEvmAddress(txData.to) || !HEX_DATA_RE.test(txData.data || '')) {
      throw new SwapWalletError('invalid-plan', 'This quote does not contain a signable EVM transaction.');
    }
    const step = (kind, tx) => {
      if (!isEvmAddress(tx.to) || !HEX_DATA_RE.test(tx.data || '')) {
        throw new SwapWalletError('invalid-plan', `The ${kind} transaction in this quote is malformed.`);
      }
      return Object.freeze({ kind, tx: Object.freeze({ from: sourceAccount, to: tx.to, data: tx.data, value: toHexQuantity(tx.value) }) });
    };
    const steps = [];
    if (quote.approvalTx) steps.push(step('approval', quote.approvalTx));
    if (quote.permitTx) steps.push(step('permit', quote.permitTx));
    steps.push(step('swap', txData));
    return Object.freeze({
      ecosystem: 'evm', sourceAccount, destinationAccount, chainId: evmChainId, expiresAt: quote.expiresAt,
      steps: Object.freeze(steps),
    });
  }

  // ── EVM signer (EIP-1193) ────────────────────────────────────────────────────

  function createEvmSigner(record) {
    const provider = record?.provider;
    if (typeof provider?.request !== 'function') {
      throw new SwapWalletError('unsupported-wallet', 'This wallet cannot sign EVM transactions.');
    }
    // Counts real changes of account or network. The wallet also announces the
    // switch this adapter asked for, possibly late; a change to the value already
    // known is not a change, so that echo does not cancel the plan.
    let generation = 0;
    let lastAccount = null;
    let lastChain = null;
    const noteAccount = (account) => {
      const next = account ? String(account).toLowerCase() : null;
      if (lastAccount !== null && next !== lastAccount) generation += 1;
      lastAccount = next;
    };
    const noteChain = (chainId) => {
      if (lastChain !== null && chainId !== lastChain) generation += 1;
      lastChain = chainId;
    };
    const onAccounts = accounts => noteAccount(Array.isArray(accounts) ? accounts[0] : null);
    const onChain = id => noteChain(Number.parseInt(String(id), 16));
    const onDisconnect = () => { generation += 1; };
    provider.on?.('accountsChanged', onAccounts);
    provider.on?.('chainChanged', onChain);
    provider.on?.('disconnect', onDisconnect);

    const request = (method, params) => provider.request(params === undefined ? { method } : { method, params });
    return {
      kind: 'evm',
      get generation() { return generation; },
      async connect() {
        const accounts = await request('eth_requestAccounts');
        return Array.isArray(accounts) ? accounts[0] || null : null;
      },
      async currentAccount() {
        const accounts = await request('eth_accounts');
        const account = Array.isArray(accounts) ? accounts[0] || null : null;
        noteAccount(account);
        return account;
      },
      async currentChainId() {
        const chainId = Number.parseInt(String(await request('eth_chainId')), 16);
        noteChain(chainId);
        return chainId;
      },
      async switchChain(chainId) {
        try {
          await request('wallet_switchEthereumChain', [{ chainId: '0x' + chainId.toString(16) }]);
        } catch (err) {
          if (err?.code === USER_REJECTED) throw new SwapWalletError('rejected', 'The network switch was declined.');
          if (err?.code === UNRECOGNIZED_CHAIN) {
            throw new SwapWalletError('network-missing', 'Your wallet does not have this network. Add it in the wallet, then try again.');
          }
          throw err;
        }
      },
      sendTransaction: tx => request('eth_sendTransaction', [tx]),
      getReceipt: hash => request('eth_getTransactionReceipt', [hash]),
      dispose() {
        provider.removeListener?.('accountsChanged', onAccounts);
        provider.removeListener?.('chainChanged', onChain);
        provider.removeListener?.('disconnect', onDisconnect);
      },
    };
  }

  async function waitForReceipt(signer, hash, { timeoutMs = 180_000, pollMs = 2_000, sleep, now = Date.now } = {}) {
    const pause = sleep || (ms => new Promise(resolve => setTimeout(resolve, ms)));
    const deadline = now() + timeoutMs;
    for (;;) {
      const receipt = await signer.getReceipt(hash).catch(() => null);
      if (receipt && receipt.status != null) return receipt;
      if (now() >= deadline) return null;
      await pause(pollMs);
    }
  }

  async function executeEvmPlan(plan, signer, opts = {}) {
    const { onStep, now = Date.now } = opts;
    const sent = [];
    const fail = (code, message) => new SwapWalletError(code, message, { sent: sent.slice() });

    const account = await signer.currentAccount();
    if (!sameEvm(account, plan.sourceAccount)) throw fail('wrong-account', 'Your wallet is on a different account than this quote. Switch back or refresh the quote.');
    if (await signer.currentChainId() !== plan.chainId) {
      await signer.switchChain(plan.chainId);
      if (await signer.currentChainId() !== plan.chainId) throw fail('wrong-network', 'Your wallet did not switch to the network this quote needs.');
    }
    // Everything after this point must happen on one unchanged account/network.
    const started = signer.generation;

    for (const step of plan.steps) {
      if (signer.generation !== started) throw fail('account-changed', 'Your wallet account or network changed during the swap. Nothing further was sent.');
      if (now() >= plan.expiresAt) throw fail('expired', 'The quote expired before this step. Refresh it and try again.');
      if (!sameEvm(await signer.currentAccount(), plan.sourceAccount)) throw fail('wrong-account', 'Your wallet switched accounts. Nothing further was sent.');
      if (await signer.currentChainId() !== plan.chainId) throw fail('wrong-network', 'Your wallet switched networks. Nothing further was sent.');

      onStep?.({ kind: step.kind, status: 'signing' });
      let hash;
      try {
        hash = await signer.sendTransaction(step.tx);
      } catch (err) {
        if (err?.code === USER_REJECTED) throw fail('rejected', `The ${step.kind} was declined in your wallet.`);
        throw fail('step-failed', `The wallet could not send the ${step.kind}: ${err?.message || err}`);
      }
      sent.push({ kind: step.kind, hash });
      onStep?.({ kind: step.kind, status: 'sent', hash });

      // A swap must not be signed until its approval/permit is actually on-chain.
      if (step.kind !== 'swap') {
        const receipt = await waitForReceipt(signer, hash, opts);
        if (!receipt) throw fail('not-confirmed', `The ${step.kind} has not confirmed yet, so the swap was not sent.`);
        if (String(receipt.status) !== '0x1' && receipt.status !== 1) {
          throw fail('step-failed', `The ${step.kind} failed on-chain, so the swap was not sent.`);
        }
        onStep?.({ kind: step.kind, status: 'confirmed', hash });
      }
    }
    return { sent };
  }

  // ── Solana signer (Wallet Standard, legacy request fallback) ────────────────

  function createSolanaSigner(record) {
    const wallet = record?.provider;
    const standard = record?.kind === 'solana-standard';
    const signFeature = standard ? wallet?.features?.['solana:signAndSendTransaction'] : null;
    const legacy = !standard && typeof wallet?.request === 'function';
    if (!signFeature && !legacy) {
      throw new SwapWalletError('unsupported-wallet', 'This Solana wallet cannot sign and send a prepared transaction.');
    }
    let generation = 0;
    const bump = () => { generation += 1; };
    const off = standard
      ? wallet.features?.['standard:events']?.on?.('change', bump)
      : (wallet.on?.('accountChanged', bump), wallet.on?.('disconnect', bump), null);

    const standardAccount = () => (wallet.accounts || [])[0] || null;
    return {
      kind: 'solana',
      get generation() { return generation; },
      async connect() {
        if (standard) {
          const res = await wallet.features['standard:connect'].connect();
          return (res?.accounts || wallet.accounts || [])[0]?.address || null;
        }
        const res = await wallet.connect();
        return (res?.publicKey || wallet.publicKey)?.toString?.() || null;
      },
      async currentAccount() {
        return standard ? standardAccount()?.address || null : wallet.publicKey?.toString?.() || null;
      },
      async signAndSend(bytes) {
        if (standard) {
          const account = standardAccount();
          const [result] = await signFeature.signAndSendTransaction({ account, transaction: bytes, chain: SOLANA_MAINNET });
          return base58Encode(result.signature);
        }
        const res = await wallet.request({ method: 'signAndSendTransaction', params: { message: base58Encode(bytes) } });
        return typeof res === 'string' ? res : res?.signature;
      },
      dispose() {
        if (typeof off === 'function') off();
        if (!standard) { wallet.removeListener?.('accountChanged', bump); wallet.removeListener?.('disconnect', bump); }
      },
    };
  }

  async function executeSolanaPlan(plan, signer, opts = {}) {
    const { onStep, now = Date.now } = opts;
    const started = signer.generation;
    if (signer.currentAccount && (await signer.currentAccount()) !== plan.sourceAccount) {
      throw new SwapWalletError('wrong-account', 'Your Solana wallet is on a different account than this quote.');
    }
    if (now() >= plan.expiresAt) throw new SwapWalletError('expired', 'This quote has expired. Refresh it and try again.');
    if (signer.generation !== started) throw new SwapWalletError('account-changed', 'Your wallet account changed. Nothing was sent.');
    onStep?.({ kind: 'swap', status: 'signing' });
    let signature;
    try {
      signature = await signer.signAndSend(plan.steps[0].bytes);
    } catch (err) {
      if (err?.code === USER_REJECTED || /reject/i.test(String(err?.message))) {
        throw new SwapWalletError('rejected', 'The swap was declined in your wallet.');
      }
      throw new SwapWalletError('step-failed', `The wallet could not send the swap: ${err?.message || err}`);
    }
    onStep?.({ kind: 'swap', status: 'sent', hash: signature });
    return { sent: [{ kind: 'swap', hash: signature }] };
  }

  function executePlan(plan, signer, opts) {
    if (plan?.ecosystem !== signer?.kind) {
      return Promise.reject(new SwapWalletError('invalid-plan', 'The connected wallet does not match the quote\'s source network.'));
    }
    return plan.ecosystem === 'evm' ? executeEvmPlan(plan, signer, opts) : executeSolanaPlan(plan, signer, opts);
  }

  return {
    SwapWalletError,
    planSwap,
    createEvmSigner,
    createSolanaSigner,
    executePlan,
    waitForReceipt,
    base58Encode,
  };
}));
