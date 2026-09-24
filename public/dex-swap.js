/**
 * dex-swap.js — ChainLens's connected-wallet Magic Swap mode.
 *
 *   search/quotes  /api/dex/* (swap-service.js; provider credentials stay there)
 *   judging        MagicMoneySwapCore (swap-core.js, generated from Magic Money)
 *   signing        ChainLensSwapWallet (swap-wallet-adapter.js) → the user's wallet
 *   status         ChainLensDexSwapStore (dex-swap-store.js, persisted locally)
 *
 * The quote the user approves is frozen (`approveSwap`). Before EVERY signature
 * the adapter re-runs `checkQuoteBeforeSigning` against it (account, chain,
 * recipient, token identities, fees, minimum output, spender, exact plan) and
 * this page reads allowance, balance and a simulation from the wallet's own RPC.
 */
(function () {
  'use strict';

  function mount(root) {

  const core = window.MagicMoneySwapCore;
  const adapter = window.ChainLensSwapWallet;
  const providers = window.ChainLensWalletProviders;
  const store = window.ChainLensDexSwapStore.createStore(core, window.localStorage);
  // The shared policy admits broad cross-chain routes only where a partial
  // delivery or refund cannot go unreported. This page persists and polls every
  // swap it starts (reloads included), so tracking is active: but only while
  // this browser actually lets it persist.
  core.setSettlementTrackingActive(window.ChainLensDexSwapStore.storageWorks(window.localStorage));

  const EXPLORER_TX = {
    ethereum: 'https://etherscan.io/tx/', arbitrum: 'https://arbiscan.io/tx/', optimism: 'https://optimistic.etherscan.io/tx/',
    base: 'https://basescan.org/tx/', polygon: 'https://polygonscan.com/tx/', avalanche: 'https://snowtrace.io/tx/',
    monad: 'https://monadvision.com/tx/', abstract: 'https://abscan.org/tx/', blast: 'https://blastscan.io/tx/',
    gnosis: 'https://gnosisscan.io/tx/', solana: 'https://solscan.io/tx/', apechain: 'https://apescan.io/tx/',
    worldchain: 'https://worldscan.org/tx/', soneium: 'https://soneium.blockscout.com/tx/', zora: 'https://explorer.zora.energy/tx/',
    ronin: 'https://app.roninchain.com/tx/', hyperevm: 'https://purrsec.com/tx/',
  };
  const CHAIN_NAMES = {
    ethereum: 'Ethereum', arbitrum: 'Arbitrum', optimism: 'Optimism', base: 'Base', polygon: 'Polygon', avalanche: 'Avalanche',
    monad: 'Monad', robinhood: 'Robinhood Chain', arc: 'Arc', abstract: 'Abstract', worldchain: 'World Chain', soneium: 'Soneium',
    blast: 'Blast', gnosis: 'Gnosis', ronin: 'Ronin', zora: 'Zora', hyperevm: 'HyperEVM', apechain: 'ApeChain', solana: 'Solana',
  };
  const POLL_MS = 5000;

  const $ = (sel) => root.querySelector(sel);
  // Token names/symbols come from open token lists and wallet names from
  // extensions: both are untrusted text and are escaped wherever HTML is built.
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const ecosystemOf = (chain) => (chain === 'solana' ? 'solana' : 'evm');
  const short = (a) => (a && a.length > 14 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a || '');
  const chainName = (c) => CHAIN_NAMES[c] || c;
  const evmChainIdOf = (c) => (c === 'solana' ? null : core.swapCapability(c)?.chainId ?? null);
  const signingContext = () => ({
    now: Date.now(),
    isEvmChain: (c) => evmChainIdOf(c) != null,
    evmChainIdOf,
  });

  const state = {
    evm: null,          // { record, signer, address }
    solana: null,
    from: { chain: 'base', token: null },
    to: { chain: 'base', token: null },
    quote: null,
    routing: null,
    busy: false,
  };

  // ── Amounts ────────────────────────────────────────────────────────────────

  function toRaw(text, decimals) {
    const s = String(text || '').trim();
    if (!/^\d*(\.\d*)?$/.test(s) || s === '' || s === '.') return null;
    const [whole, frac = ''] = s.split('.');
    if (frac.length > decimals) return null;
    const raw = BigInt((whole || '0') + frac.padEnd(decimals, '0'));
    return raw > 0n ? raw.toString() : null;
  }
  function fromRaw(raw, decimals, places = 6) {
    if (raw == null || !/^\d+$/.test(String(raw))) return '—';
    const v = BigInt(raw);
    const base = 10n ** BigInt(decimals);
    const whole = v / base;
    let frac = (v % base).toString().padStart(decimals, '0').slice(0, places).replace(/0+$/, '');
    return frac ? `${whole}.${frac}` : whole.toString();
  }

  // ── Messages ───────────────────────────────────────────────────────────────

  function say(el, text, tone) {
    el.textContent = text || '';
    el.className = `msg${tone ? ` ${tone}` : ''}${text ? '' : ' hidden'}`;
  }
  const formMsg = (t, tone) => say($('[data-testid="form-message"]'), t, tone);
  const swapMsg = (t, tone) => say($('[data-testid="swap-message"]'), t, tone);

  // ── Wallets ────────────────────────────────────────────────────────────────

  function renderWallets() {
    const line = (w) => (w ? `<strong>${esc(w.address)}</strong> · ${esc(w.record.name)}` : '<strong>not connected</strong>');
    $('[data-testid="evm-wallet"]').innerHTML = `EVM: ${line(state.evm)}`;
    $('[data-testid="solana-wallet"]').innerHTML = `Solana: ${line(state.solana)}`;
    renderRecipient();
  }

  function renderRecipient() {
    const dest = state[ecosystemOf(state.to.chain)];
    $('[data-testid="recipient"]').innerHTML = dest
      ? `Receives at: <strong>${esc(dest.address)}</strong> (${ecosystemOf(state.to.chain) === 'evm' ? 'EVM' : 'Solana'} wallet)`
      : `Receives at: <strong>connect a ${ecosystemOf(state.to.chain) === 'evm' ? 'EVM' : 'Solana'} wallet</strong>`;
  }

  function invalidateQuote(reason) {
    if (state.quote && reason) swapMsg(reason, 'warn');
    state.quote = null;
    $('[data-testid="quote"]').classList.add('hidden');
  }

  async function connect(kind) {
    const picker = $('[data-testid="provider-picker"]');
    picker.innerHTML = '';
    const found = await providers.discoverWalletProviders(kind, window);
    const usable = found.filter(r => (kind === 'evm' ? /^evm-/.test(r.kind) : /^solana-/.test(r.kind)));
    if (!usable.length) {
      formMsg(`No ${kind === 'evm' ? 'EVM' : 'Solana'} wallet was found in this browser.`, 'bad');
      return;
    }
    const pick = async (record) => {
      picker.classList.add('hidden');
      try {
        const signer = kind === 'evm' ? adapter.createEvmSigner(record) : adapter.createSolanaSigner(record);
        const address = await signer.connect();
        if (!address) throw new Error('The wallet did not return an account.');
        state[kind]?.signer.dispose?.();
        state[kind] = { record, signer, address };
        watchAccount(kind);
        invalidateQuote('Your wallet changed, so the quote was cleared. Get a new quote.');
        renderWallets();
        formMsg('');
      } catch (err) {
        formMsg(err?.code === 4001 ? 'The connection request was declined.' : `Could not connect: ${err?.message || err}`, 'bad');
      }
    };
    if (usable.length === 1) return pick(usable[0]);
    for (const record of usable) {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = record.name;
      b.addEventListener('click', () => pick(record));
      picker.appendChild(b);
    }
    picker.classList.remove('hidden');
  }

  /** Keep the shown account true to the wallet; a change invalidates the quote. */
  function watchAccount(kind) {
    const w = state[kind];
    const provider = w.record.provider;
    const refresh = async () => {
      if (state[kind] !== w) return;
      const address = await w.signer.currentAccount().catch(() => null);
      if (address && address !== w.address) {
        w.address = address;
        renderWallets();
        invalidateQuote('Your wallet switched accounts, so the quote was cleared. Get a new quote.');
      }
    };
    if (kind === 'evm') provider.on?.('accountsChanged', refresh);
    else if (w.record.kind === 'solana-standard') provider.features?.['standard:events']?.on?.('change', refresh);
    else provider.on?.('accountChanged', refresh);
  }

  // ── Networks and tokens ────────────────────────────────────────────────────

  function fillChains() {
    const src = core.swappableSourceChains().map(c => c.id);
    const dst = core.swappableDestinationChains().map(c => c.id);
    const opts = (ids) => ids.map(id => `<option value="${esc(id)}">${esc(chainName(id))}</option>`).join('');
    $('#from-chain').innerHTML = opts(src);
    $('#to-chain').innerHTML = opts(dst);
    $('#from-chain').value = state.from.chain;
    $('#to-chain').value = state.to.chain;
  }

  function curated(chain) {
    return core.curatedTokensForChain(chain).map(t => ({ ...t, logoUri: null, verified: true, source: 'curated' }));
  }

  function renderToken(side) {
    const t = state[side].token;
    $(`[data-testid="${side}-token"]`).textContent = t
      ? `${t.symbol} · ${t.name} · ${t.isNative ? 'native' : t.address}${t.verified ? '' : ' · unverified: check the address'}`
      : '';
  }

  function chooseToken(side, token) {
    state[side].token = token;
    $(`#${side}-search`).value = token.symbol;
    $(`[data-testid="${side}-results"]`).classList.add('hidden');
    renderToken(side);
    invalidateQuote();
  }

  function showResults(side, tokens) {
    const box = $(`[data-testid="${side}-results"]`);
    box.innerHTML = '';
    for (const t of tokens.slice(0, 20)) {
      const b = document.createElement('button');
      b.type = 'button';
      b.setAttribute('role', 'option');
      b.dataset.address = t.address;
      b.innerHTML = `<span>${esc(t.symbol)} <span style="opacity:.6">${esc(t.name)}</span>${t.verified ? ' ✓' : ''}</span><small>${t.isNative ? 'native' : esc(short(t.address))}</small>`;
      b.addEventListener('click', () => chooseToken(side, t));
      box.appendChild(b);
    }
    box.classList.toggle('hidden', tokens.length === 0);
  }

  let searchTimer = {};
  function onSearch(side) {
    clearTimeout(searchTimer[side]);
    const chain = state[side].chain;
    const q = $(`#${side}-search`).value.trim();
    if (!q) { showResults(side, curated(chain)); return; }
    searchTimer[side] = setTimeout(async () => {
      const local = curated(chain).filter(t => t.symbol.toLowerCase().includes(q.toLowerCase()));
      const param = core.looksLikeSwapAddress(chain, q) ? 'address' : 'q';
      try {
        const res = await fetch(`/api/dex/tokens?chain=${encodeURIComponent(chain)}&${param}=${encodeURIComponent(q)}&limit=20`);
        const body = await res.json();
        if ($(`#${side}-search`).value.trim() !== q) return;   // a newer search is in flight
        showResults(side, core.mergeDiscoveredTokens(local, body.tokens || []));
        if (body.error) formMsg(body.error, 'warn');
      } catch {
        showResults(side, local);
      }
    }, 250);
  }

  // ── Quote ──────────────────────────────────────────────────────────────────

  function accountsFor(fromChain, toChain) {
    const src = state[ecosystemOf(fromChain)];
    const dst = state[ecosystemOf(toChain)];
    return { sourceAccount: src?.address || null, destinationAccount: dst?.address || null };
  }

  async function getQuote() {
    swapMsg('');
    const { from, to } = state;
    if (!from.token || !to.token) return formMsg('Choose a token to sell and a token to buy.', 'bad');
    const amount = toRaw($('#amount').value, from.token.decimals);
    if (!amount) return formMsg(`Enter an amount of ${from.token.symbol} (up to ${from.token.decimals} decimal places).`, 'bad');
    const { sourceAccount, destinationAccount } = accountsFor(from.chain, to.chain);
    if (!sourceAccount) return formMsg(`Connect a ${ecosystemOf(from.chain) === 'evm' ? 'EVM' : 'Solana'} wallet to pay for this swap.`, 'bad');
    if (!destinationAccount) return formMsg(`Connect a ${ecosystemOf(to.chain) === 'evm' ? 'EVM' : 'Solana'} wallet to receive this swap.`, 'bad');

    const params = new URLSearchParams({
      fromChain: from.chain, toChain: to.chain, sell: from.token.address, buy: to.token.address,
      sellSymbol: from.token.symbol, buySymbol: to.token.symbol, amount, slippageBps: $('#slippage').value,
      taker: sourceAccount, toAddress: destinationAccount,
      fromDecimals: String(from.token.decimals), toDecimals: String(to.token.decimals),
    });
    formMsg('Finding the best safe route…');
    $('[data-testid="get-quote"]').disabled = true;
    try {
      const res = await fetch(`/api/dex/quote?${params}`);
      const body = await res.json();
      if (!body.quote) { invalidateQuote(); return formMsg(body.error || 'No route is available for this swap.', 'bad'); }
      // The server already filtered candidates, but its answer is a claim: the
      // same shared filter runs here before anything is shown as swappable.
      const recheck = core.selectFromCandidates([body.quote], []);
      if (!recheck.quote) { invalidateQuote(); return formMsg(recheck.error, 'bad'); }
      state.quote = recheck.quote;
      state.routing = body.routing || null;
      formMsg('');
      renderQuote();
    } catch {
      formMsg('The swap service could not be reached. Try again.', 'bad');
    } finally {
      $('[data-testid="get-quote"]').disabled = false;
    }
  }

  function feeLine(q) {
    const fee = core.classifyQuoteFee(q);
    if (fee.tier === 'fee-paying') {
      const pct = ((q.appFee.appliedBps ?? q.appFee.requestedBps) / 100).toFixed(2).replace(/\.?0+$/, '');
      return `${pct}% Magic Money fee, charged inside this swap transaction`;
    }
    return 'No Magic Money fee on this route';
  }

  function renderQuote() {
    const q = state.quote;
    const dl = $('[data-testid="quote-details"]');
    const toDec = state.to.token.decimals;
    const rows = [
      ['Route', `${q.provider}${q.bridgeTool ? ` via ${q.bridgeTool}` : ''}${q.fromChain !== q.toChain ? ` · ${chainName(q.fromChain)} → ${chainName(q.toChain)}` : ''}`],
      ['You pay', `${fromRaw(q.sellAmountRaw, state.from.token.decimals)} ${state.from.token.symbol}`],
      ['You receive (est.)', `${fromRaw(q.buyAmountRaw, toDec)} ${state.to.token.symbol}`],
      ['Minimum received', `${fromRaw(q.minBuyAmountRaw, toDec)} ${state.to.token.symbol}${q.destination ? ` (${core.describeMinReceivedScope(q.destination.minReceivedScope)})` : ''}`],
      ['Fee', feeLine(q)],
      ['Receives at', accountsFor(q.fromChain, q.toChain).destinationAccount],
    ];
    const spender = core.quoteApprovalSpender(q);
    if (spender) rows.push(['Approval', `${state.from.token.symbol} spending by ${spender}, up to the amount you are swapping`]);
    dl.innerHTML = '';
    for (const [k, v] of rows) {
      const dt = document.createElement('dt'); dt.textContent = k;
      const dd = document.createElement('dd'); dd.textContent = v;
      dl.append(dt, dd);
    }
    $('[data-testid="quote-note"]').textContent = q.fromChain !== q.toChain
      ? 'Cross-chain delivery is asynchronous; this page keeps tracking it, even after a reload.'
      : '';
    $('[data-testid="quote"]').classList.remove('hidden');
    tickExpiry();
  }

  function tickExpiry() {
    const q = state.quote;
    const btn = $('[data-testid="swap"]');
    if (!q) return;
    const left = Math.floor((q.expiresAt - Date.now()) / 1000);
    btn.disabled = state.busy || left <= 0;
    btn.textContent = state.busy ? 'Waiting for your wallet…' : left > 0 ? `Swap (quote valid ${left}s)` : 'Quote expired — get a new quote';
  }
  const expiryTimer = setInterval(tickExpiry, 1000);

  // ── Chain reads through the connected EVM wallet's RPC ─────────────────────

  const pad = (hex) => hex.replace(/^0x/, '').toLowerCase().padStart(64, '0');
  async function evmCall(provider, tx) {
    return provider.request({ method: 'eth_call', params: [tx, 'latest'] });
  }
  const isRevert = (err) => err?.code === 3 || /revert/i.test(String(err?.message || err?.data?.message || ''));

  /**
   * Magic Money's executor checks, run against the wallet's own RPC:
   * approval needed? (skip / zero-reset), enough balance to sell, and a
   * simulation of the swap — which must RUN and PASS for a broad token.
   */
  function evmPreflight(quote, policy) {
    return async (step) => {
      const provider = state.evm.record.provider;
      const owner = step.tx.from;
      if (step.kind === 'approval') {
        const spender = '0x' + step.tx.data.slice(34, 74);
        try {
          const allowance = BigInt(await evmCall(provider, { to: step.tx.to, data: `0xdd62ed3e${pad(owner)}${pad(spender)}` }));
          if (allowance >= BigInt(quote.sellAmountRaw)) return 'skip';
          if (allowance > 0n) return 'reset-then-send';
        } catch { /* an unreadable allowance: send the approval as quoted */ }
        return 'send';
      }
      if (step.kind !== 'swap') return 'send';
      const native = core.isNativeSwapAddress(quote.fromChain, quote.fromTokenAddress);
      try {
        const held = native
          ? BigInt(await provider.request({ method: 'eth_getBalance', params: [owner, 'latest'] }))
          : BigInt(await evmCall(provider, { to: quote.fromTokenAddress, data: `0x70a08231${pad(owner)}` }));
        if (held < BigInt(quote.sellAmountRaw)) {
          throw Object.assign(new Error(`This account does not hold enough ${state.from.token.symbol} for this swap. Nothing was sent.`), { code: 'refused' });
        }
      } catch (err) {
        if (err?.code === 'refused') throw err;   // an unreadable balance is not a zero one
      }
      try {
        await evmCall(provider, { from: owner, to: step.tx.to, data: step.tx.data, value: step.tx.value });
      } catch (err) {
        if (isRevert(err)) throw new Error('This swap would fail on-chain (simulation reverted). Nothing was sent. Get a new quote.');
        if (policy.requireSimulation) {
          throw new Error('This token is outside the verified list, so its swap must pass a simulation first, and your wallet could not run one. Nothing was sent.');
        }
      }
      return 'send';
    };
  }

  // ── Swap ───────────────────────────────────────────────────────────────────

  async function swap() {
    const quote = state.quote;
    if (!quote || state.busy) return;
    swapMsg('');
    const { sourceAccount, destinationAccount } = accountsFor(quote.fromChain, quote.toChain);
    const wallet = state[ecosystemOf(quote.fromChain)];
    const evmChainId = evmChainIdOf(quote.fromChain);
    const approved = core.approveSwap(quote, { sourceAccount, destinationAccount }, evmChainId);
    const validateQuote = (q) => core.checkQuoteBeforeSigning(q, approved, signingContext());

    let plan;
    let policy;
    try {
      policy = validateQuote(quote);
      plan = adapter.planSwap(quote, { sourceAccount, destinationAccount, evmChainId, validateQuote });
    } catch (err) {
      return swapMsg(err?.message || String(err), 'bad');
    }

    state.busy = true;
    tickExpiry();
    const tokens = { from: state.from.token, to: state.to.token };
    const id = store.open(quote, approved, tokens);
    renderSwaps();
    try {
      await adapter.executePlan(plan, wallet.signer, {
        beforeStep: plan.ecosystem === 'evm' ? evmPreflight(quote, policy) : undefined,
        onStep: ({ kind, status, hash }) => {
          if (status === 'sent' && kind !== 'swap') store.notePreSwapTx(id, hash);
          if (status === 'sent' && kind === 'swap') store.noteBroadcast(id, hash, explorerLink(quote.fromChain, hash));
          if (status === 'signing') swapMsg(`Confirm the ${kind === 'allowance-reset' ? 'allowance reset' : kind} in your wallet…`);
          if (status === 'confirmed') swapMsg(`The ${kind} confirmed.`);
          renderSwaps();
        },
      });
      swapMsg(quote.fromChain === quote.toChain
        ? 'Swap sent. It is tracked below until it confirms.'
        : 'Swap sent. Cross-chain delivery is tracked below, even if you close this page.', 'good');
      invalidateQuote();
    } catch (err) {
      const sentSwap = (err?.sent || []).some(s => s.kind === 'swap');
      if (!sentSwap) store.noteNotSent(id, err?.message || 'the swap was not sent');
      const approval = (err?.sent || []).find(s => s.kind === 'approval');
      swapMsg(`${err?.message || err}${approval && !sentSwap ? ` The approval (${short(approval.hash)}) was sent and remains in place.` : ''}`, 'bad');
    } finally {
      state.busy = false;
      tickExpiry();
      renderSwaps();
      poll();
    }
  }

  function explorerLink(chain, hash) {
    return EXPLORER_TX[chain] && hash ? EXPLORER_TX[chain] + hash : null;
  }

  // ── Status, persisted and resumed ──────────────────────────────────────────

  const STATE_TEXT = {
    'source-submitted': 'Sent, waiting for confirmation',
    'source-confirmed': 'Confirmed on the source chain',
    bridging: 'Bridging',
    completed: 'Completed',
    partial: 'Partial delivery',
    'refund-pending': 'Refund in progress',
    refunded: 'Refunded',
    failed: 'Failed',
    unknown: 'Status unknown, still checking',
  };

  /**
   * What is known about the app fee on a swap. "Charged" means the transaction
   * carrying it succeeded; only a provider's payout record (or an on-chain check)
   * shows it reached Magic Money's recipient.
   */
  function feeText(fee) {
    if (!fee) return '';
    const payout = fee.payout?.status === 'confirmed' ? ', payout confirmed by the provider' : '';
    const text = {
      'no-fee': 'no Magic Money fee',
      'not-executed': 'no fee taken',
      submitted: 'fee pending confirmation',
      'collected-onchain': 'fee charged in the swap transaction',
      'accrued-claimable': 'fee credited to a claimable balance',
      'not-collected': 'no fee taken (the transaction reverted)',
      unknown: 'fee outcome unknown',
    }[fee.state] || fee.state;
    return ` · ${text}${payout}`;
  }

  /** Last source-transaction check per session (this page load only). */
  const checks = {};

  function timeText(t) {
    return new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }

  /**
   * The source transaction's on-chain state, shown on every row: waiting (with
   * when it was last checked, and why a check failed), confirmed (with block or
   * Solana finality), or failed on-chain.
   */
  function confirmationBadge(s) {
    if (!s.sourceTxHash || s.sourceTxState === 'not-sent') return '';
    const c = checks[s.id];
    if (s.sourceTxState === 'reverted') return '<span class="badge bad" data-testid="tx-badge">✕ Failed on-chain</span>';
    if (s.sourceTxState === 'confirmed') {
      const detail = c?.finality === 'finalized' ? ' · finalized'
        : c?.blockNumber ? ` · block ${esc(c.blockNumber.toLocaleString())}` : '';
      return `<span class="badge good" data-testid="tx-badge">✓ Confirmed on ${esc(chainName(s.fromChain))}${detail}</span>`;
    }
    const checked = c?.at ? ` · checked ${timeText(c.at)}` : '';
    const problem = c?.error ? ` <span class="warn-text">${esc(c.error)}</span>` : '';
    return `<span class="badge pending" data-testid="tx-badge"><span class="spinner" aria-hidden="true"></span>Waiting for confirmation${checked}</span>${problem}`
      + ' <button type="button" class="link" data-action="check-now">Check now</button>';
  }

  function renderSwaps() {
    const box = $('[data-testid="swaps"]');
    const list = store.list();
    if (!list.length) { box.innerHTML = '<p class="note">No swaps yet.</p>'; return; }
    box.innerHTML = '';
    for (const s of list) {
      const div = document.createElement('div');
      div.className = 'swap';
      div.dataset.testid = 'swap-row';
      div.dataset.state = s.state;
      const notSent = s.sourceTxState === 'not-sent';
      const label = notSent ? 'Not sent' : (STATE_TEXT[s.state] || s.state);
      const delivered = s.deliveredAmountRaw
        ? ` · received ${fromRaw(s.deliveredAmountRaw, s.deliveredTokenDecimals ?? s.toTokenDecimals)} ${esc(s.deliveredTokenSymbol || s.toTokenSymbol)} (as reported by ${esc(s.provider)})`
        : '';
      const fee = esc(feeText(s.fee));
      const link = s.sourceTxHash
        ? ` · <a href="${esc(explorerLink(s.fromChain, s.sourceTxHash) || '#')}" target="_blank" rel="noopener" class="mono">${esc(short(s.sourceTxHash))}</a>`
        : '';
      div.innerHTML = `<div class="badges">${confirmationBadge(s)}</div><div><span class="state ${esc(s.state)}">${esc(label)}</span> · ${fromRaw(s.sellAmountRaw, s.fromTokenDecimals)} ${esc(s.fromTokenSymbol)} (${esc(chainName(s.fromChain))}) → ${esc(s.toTokenSymbol)} (${esc(chainName(s.toChain))})${link}</div>`
        + `<div class="note" style="margin:2px 0 0">${`${esc(s.message || '')}${delivered}${fee}`.replace(/^ · /, '')}</div>`;
      box.appendChild(div);
    }
  }

  /**
   * Source-transaction status: ChainLens's server first (keyed RPC, then public
   * RPCs), then the connected EVM wallet's own RPC when it is on that chain.
   */
  async function sourceTxStatus(s) {
    let serverError = null;
    try {
      const res = await fetch(`/api/dex/tx-status?chain=${encodeURIComponent(s.fromChain)}&hash=${encodeURIComponent(s.sourceTxHash)}`);
      const body = await res.json().catch(() => null);
      if (res.ok && body && ['confirmed', 'failed', 'pending'].includes(body.state)) return { ...body, error: null };
      serverError = body?.error || `status service ${res.status}`;
    } catch {
      serverError = 'status service unreachable';
    }
    const wallet = state.evm;
    const chainId = evmChainIdOf(s.fromChain);
    if (wallet && chainId != null) {
      try {
        if (await wallet.signer.currentChainId() === chainId) {
          const receipt = await wallet.record.provider.request({ method: 'eth_getTransactionReceipt', params: [s.sourceTxHash] });
          if (receipt && receipt.status != null) {
            return {
              state: String(receipt.status) === '0x1' || receipt.status === 1 ? 'confirmed' : 'failed',
              blockNumber: receipt.blockNumber ? Number.parseInt(receipt.blockNumber, 16) : null,
              source: 'wallet', error: null,
            };
          }
          return { state: 'pending', source: 'wallet', error: null };
        }
      } catch { /* fall through to the server's error */ }
    }
    return { state: 'pending', error: `Could not check the status (${serverError}), retrying.` };
  }

  let polling = false;
  async function poll() {
    if (polling) return;
    polling = true;
    try {
      store.finaliseUnsent();
      for (const s of store.pending()) {
        if (!s.sourceTxHash) continue;
        if (s.sourceTxState === 'submitted') {
          const r = await sourceTxStatus(s);
          checks[s.id] = { ...r, at: Date.now() };
          if (r.state === 'confirmed') store.noteReceipt(s.id, s.sourceTxHash, true);
          else if (r.state === 'failed') store.noteReceipt(s.id, s.sourceTxHash, false);
        } else if (s.isCrossChain) {
          const params = new URLSearchParams({ provider: s.provider, txHash: s.sourceTxHash, fromChain: s.fromChain, toChain: s.toChain });
          if (s.bridgeTool) params.set('bridge', s.bridgeTool);
          if (s.providerRequestId) params.set('requestId', s.providerRequestId);
          const body = await fetch(`/api/dex/status?${params}`).then(x => x.json()).catch(() => null);
          if (body) store.applyWorkerStatus(s.id, body);
        }
      }
    } finally {
      polling = false;
      renderSwaps();
    }
  }
  const pollTimer = setInterval(poll, POLL_MS);

  // ── Wiring ─────────────────────────────────────────────────────────────────

  root.addEventListener('click', (e) => {
    const action = e.target.closest('[data-action]')?.dataset.action;
    if (action === 'connect-evm') connect('evm');
    if (action === 'connect-solana') connect('solana');
    if (action === 'quote') getQuote();
    if (action === 'swap') swap();
    if (action === 'check-now') poll();
    if (action === 'flip') flip();
  });

  /** Swap the pay and receive sides (network and token), as on Magic Money's swap screen. */
  function flip() {
    const from = state.from;
    state.from = state.to;
    state.to = from;
    $('#from-chain').value = state.from.chain;
    $('#to-chain').value = state.to.chain;
    for (const side of ['from', 'to']) {
      $(`#${side}-search`).value = state[side].token ? state[side].token.symbol : '';
      renderToken(side);
    }
    renderRecipient();
    invalidateQuote();
  }
  for (const side of ['from', 'to']) {
    $(`#${side}-chain`).addEventListener('change', (e) => {
      state[side].chain = e.target.value;
      state[side].token = null;
      $(`#${side}-search`).value = '';
      renderToken(side);
      renderRecipient();
      invalidateQuote();
    });
    $(`#${side}-search`).addEventListener('input', () => onSearch(side));
    $(`#${side}-search`).addEventListener('focus', () => onSearch(side));
  }
  $('#amount').addEventListener('input', () => invalidateQuote());
  $('#slippage').addEventListener('change', () => invalidateQuote());

  fillChains();
  renderWallets();
  renderSwaps();
  poll();
  return () => {
    clearInterval(expiryTimer);
    clearInterval(pollTimer);
    clearTimeout(searchTimer.from);
    clearTimeout(searchTimer.to);
    state.evm?.signer.dispose?.();
    state.solana?.signer.dispose?.();
  };
  }

  window.ChainLensDexSwap = { mount };
}());
