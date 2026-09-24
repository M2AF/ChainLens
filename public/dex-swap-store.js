/**
 * dex-swap-store.js — ChainLens's persisted record of every DEX swap it starts.
 *
 * The record is Magic Money's shared settlement session (swap-core.js), kept in
 * this browser's localStorage, so a swap is still tracked after a reload or a
 * browser restart and its outcome (completed, partial, refunded, not sent) is
 * decided by the same shared mapper the wallet uses. Nothing here signs.
 *
 * Every write goes through a pure `(map) => map` update from the shared core;
 * this module only loads, saves and sequences them.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ChainLensDexSwapStore = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const STORAGE_KEY = 'chainlens.dexSwapSessions.v1';
  /** Longer than any quote can live: a session with no swap by then never will. */
  const UNSENT_FINAL_AFTER_MS = 15 * 60 * 1000;

  function createStore(core, storage, now = Date.now) {
    const read = () => {
      try {
        const parsed = JSON.parse(storage.getItem(STORAGE_KEY) || '{}');
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
        const out = {};
        for (const [id, s] of Object.entries(parsed)) {
          if (s && typeof s === 'object' && s.id === id && typeof s.fromChain === 'string') out[id] = s;
        }
        return core.pruneSettled(out, now());
      } catch {
        return {};
      }
    };
    const write = (map) => {
      try { storage.setItem(STORAGE_KEY, JSON.stringify(map)); } catch { /* storage full or blocked */ }
      return map;
    };
    const update = (fn) => write(fn(read()));

    return {
      list() {
        return Object.values(read()).sort((a, b) => b.createdAt - a.createdAt);
      },
      get(id) {
        return read()[id] || null;
      },

      /** One session per user swap, opened before the first transaction is sent. */
      open(quote, approved, tokens) {
        const id = `cl-${now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
        update(map => core.openSwapSession(map, {
          id,
          walletId: `${approved.sourceAccount}|${approved.destinationAccount}`,
          accountIndex: 0,
          environment: 'mainnet',
          provider: quote.provider,
          fromChain: quote.fromChain,
          toChain: quote.toChain,
          fromTokenAddress: quote.fromTokenAddress,
          fromTokenSymbol: quote.fromTokenSymbol || tokens.from.symbol,
          fromTokenDecimals: tokens.from.decimals,
          toTokenAddress: quote.toTokenAddress,
          toTokenSymbol: quote.toTokenSymbol || tokens.to.symbol,
          toTokenDecimals: tokens.to.decimals,
          sellAmountRaw: quote.sellAmountRaw,
          expectedBuyAmountRaw: quote.buyAmountRaw,
          minBuyAmountRaw: quote.minBuyAmountRaw || null,
          recipient: approved.destinationAccount,
          isCrossChain: quote.fromChain !== quote.toChain,
          bridgeTool: quote.bridgeTool || null,
          providerRequestId: quote.requestId || null,
          appFee: quote.appFee || null,
          now: now(),
        }));
        return id;
      },

      /** An approval, permit or allowance reset reached the network. */
      notePreSwapTx(id, hash) { update(map => core.recordPreSwapTx(map, id, hash, now())); },

      /** The swap transaction reached the network (not yet confirmed). */
      noteBroadcast(id, hash, explorerUrl) {
        update(map => core.recordSwapBroadcast(map, id, { txHash: hash, explorerUrl: explorerUrl || null, now: now() }));
      },

      /** No swap transaction was sent. Any approval hash already recorded stays. */
      noteNotSent(id, reason) { update(map => core.recordSwapNotSent(map, id, reason, now())); },

      /** The source transaction was included (success or revert). */
      noteReceipt(id, hash, success) {
        update(map => core.recordSourceReceipt(map, id, { txHash: hash, success, now: now() }));
      },

      /**
       * Apply a Worker /swap/status body: the provider's vocabulary is mapped by
       * the shared mapper, the approved minimum is re-checked against what
       * arrived, and published payout evidence (Relay) is attached.
       */
      applyWorkerStatus(id, body) {
        const session = read()[id];
        if (!session || !body || body.transient) return session;
        let report = core.mapStatusForProvider(session.provider, {
          provider: session.provider,
          status: body.providerStatus ?? null,
          substatus: body.providerSubstatus ?? null,
          receivedAmountRaw: body.receivedAmountRaw ?? null,
          receivedTokenAddress: body.receivedTokenAddress ?? null,
          receivedTokenSymbol: body.receivedTokenSymbol ?? null,
          receivedTokenDecimals: body.receivedTokenDecimals ?? null,
          receivedTokenChain: body.receivedTokenChain ?? null,
          destTxHash: body.destTxHash ?? null,
          destExplorerUrl: body.destExplorerUrl ?? null,
          notFound: body.notFound ?? null,
          failReason: body.failReason ?? null,
          sourceChain: body.sourceChain ?? null,
          outboundChain: body.outboundChain ?? null,
        }, session.toTokenAddress);
        report = core.applyShortfallToReport(session.minBuyAmountRaw, report);
        return update(map => {
          let next = core.applyStatusReport(map, id, report, now());
          if (Array.isArray(body.paidAppFees)) {
            next = core.applyPaidAppFees(next, id, body.paidAppFees, `${session.provider}: settlement record`);
          }
          return { ...next, [id]: { ...next[id], lastPolledAt: now() } };
        })[id];
      },

      /** Sessions that still need a poll: source not yet confirmed, or bridge in flight. */
      pending() {
        return Object.values(read()).filter(s => core.isSwapSessionActive(s));
      },

      /** Close out sessions that never got a swap and no longer can (quote long expired). */
      finaliseUnsent() {
        update(map => {
          let next = map;
          for (const s of core.sessionsLeftUnsent(map, now(), UNSENT_FINAL_AFTER_MS)) {
            next = core.recordSwapNotSent(next, s.id,
              'no swap transaction was recorded for this swap, and its quote has expired, so it can no longer be sent.', now());
          }
          return next;
        });
      },
    };
  }

  return { createStore, STORAGE_KEY, UNSENT_FINAL_AFTER_MS };
}));
