/** Deposit-address exchange: ChainLens server -> Magic Money Worker -> providers.
 * No provider credential or Worker tag is sent to the browser. Order creation is
 * bound to a recent server-held quote and is single-use (even on uncertain errors).
 */
'use strict';

const crypto = require('node:crypto');
const ASSETS = require('./public/exchange-assets');
const ASSET_BY_KEY = new Map(ASSETS.map(asset => [asset.key, asset]));
const DEFAULT_WORKER_URL = 'https://magicmoney-swap-proxy.guildfordking.workers.dev';
const QUOTE_TTL_MS = 120_000;
const MAX_QUOTES = 500;

class ExchangeInputError extends Error {}
const text = value => String(value ?? '').trim();
const amountOk = value => /^(?:0|[1-9]\d{0,17})(?:\.\d{1,18})?$/.test(value) && Number(value) > 0 && Number.isFinite(Number(value));
const positive = value => value != null && Number(value) > 0 && Number.isFinite(Number(value));

function validAddress(network, value) {
  if (!value || value.length > 150 || /\s/.test(value)) return false;
  if (['eth', 'bsc', 'polygon', 'avaxc'].includes(network)) return /^0x[0-9a-fA-F]{40}$/.test(value);
  if (network === 'sol') return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(value);
  if (network === 'btc') return /^(?:bc1[ac-hj-np-z02-9]{11,87}|[13][1-9A-HJ-NP-Za-km-z]{25,34})$/i.test(value);
  if (network === 'trx') return /^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(value);
  if (network === 'ada') return /^addr1[0-9a-z]{40,}$/.test(value);
  // Other chain formats are diverse. Provider validation is authoritative;
  // reject only obviously malformed input rather than pretending to checksum.
  return /^[A-Za-z0-9:_-]{20,150}$/.test(value);
}

function parsePair(input) {
  const from = ASSET_BY_KEY.get(text(input.from));
  const to = ASSET_BY_KEY.get(text(input.to));
  const amount = text(input.amount);
  const fixed = input.fixed === true || input.fixed === 'true';
  if (!from || !to || from.key === to.key) throw new ExchangeInputError('Choose two different supported assets.');
  if (!amountOk(amount)) throw new ExchangeInputError('Enter a valid amount greater than zero.');
  return { from, to, amount, fixed };
}

function safeMessage(body, fallback) {
  const candidate = body?.description ?? body?.message ?? body?.error;
  return typeof candidate === 'string' && candidate.length < 200 && !/api.key|secret|token/i.test(candidate)
    ? candidate : fallback;
}

function normalizeExchange(provider, raw) {
  const r = raw?.result ?? raw;
  if (!r || typeof r !== 'object') throw new Error('Exchange provider returned an invalid response.');
  const obj = provider === 'changenow' ? {
    id: r.id, status: r.status === 'new' ? 'waiting' : r.status,
    addressFrom: r.payinAddress, extraIdFrom: r.payinExtraId,
    addressTo: r.payoutAddress, amountFrom: r.amountFrom ?? r.expectedAmountFrom,
    amountTo: r.amountTo ?? r.expectedAmountTo, validUntil: r.validUntil,
  } : r;
  return {
    id: text(obj.id), provider, status: text(obj.status || 'waiting'),
    addressFrom: text(obj.addressFrom), extraIdFrom: text(obj.extraIdFrom) || null,
    addressTo: text(obj.addressTo), amountFrom: text(obj.amountFrom), amountTo: text(obj.amountTo),
    validUntil: text(obj.validUntil) || null,
  };
}

function createExchangeService(options = {}) {
  const workerUrl = text(options.workerUrl || DEFAULT_WORKER_URL).replace(/\/+$/, '');
  const clientToken = text(options.clientToken);
  const fetchImpl = options.fetchImpl || fetch;
  const now = options.now || Date.now;
  const quotes = new Map();

  async function worker(path, init = {}) {
    const headers = { accept: 'application/json', ...(init.headers || {}) };
    if (clientToken) headers['x-mm-client'] = clientToken;
    const res = await fetchImpl(`${workerUrl}${path}`, { ...init, headers, signal: AbortSignal.timeout(20_000) });
    const body = await res.json().catch(() => null);
    return { ok: res.ok, status: res.status, body };
  }

  function prune() {
    for (const [id, q] of quotes) if ((q.recoveryUntil || q.expiresAt) <= now()) quotes.delete(id);
    while (quotes.size >= MAX_QUOTES) quotes.delete(quotes.keys().next().value);
  }

  async function estimateFor(provider, pair) {
    const { from, to, amount, fixed } = pair;
    const f = provider === 'changenow' && from.key === 'dot:dot' ? { ...from, network: 'assethub' } : from;
    const t = provider === 'changenow' && to.key === 'dot:dot' ? { ...to, network: 'assethub' } : to;
    let estimatePath, rangePath;
    if (provider === 'simpleswap') {
      const q = new URLSearchParams({ from: f.ticker, fromNet: f.network, to: t.ticker, toNet: t.network, fixed: String(fixed) });
      estimatePath = `/ss/estimate?${q}&amount=${encodeURIComponent(amount)}`;
      rangePath = `/ss/ranges?${q}`;
    } else {
      const q = new URLSearchParams({ fromCurrency: f.ticker, fromNetwork: f.network, toCurrency: t.ticker, toNetwork: t.network, flow: fixed ? 'fixed-rate' : 'standard' });
      estimatePath = `/cn/estimate?${q}&fromAmount=${encodeURIComponent(amount)}&type=direct`;
      rangePath = `/cn/range?${q}`;
    }
    // As in the wallet (xchange-client.ts), only the estimate decides whether a
    // provider can serve the pair; limits are informational and a failed range
    // call leaves them unknown rather than forcing a fallback.
    const [est, range] = await Promise.all([worker(estimatePath), worker(rangePath).catch(() => ({ ok: false }))]);
    if (!est.ok) return { error: safeMessage(est.body, `${provider} could not price this pair.`) };
    const e = provider === 'simpleswap' ? est.body?.result : est.body;
    const r = range.ok ? (provider === 'simpleswap' ? range.body?.result : range.body) : null;
    const estimatedAmount = text(provider === 'simpleswap' ? e?.estimatedAmount : e?.toAmount);
    if (!positive(estimatedAmount)) return { error: `${provider} did not return a usable estimate.` };
    const min = text(provider === 'simpleswap' ? r?.min : r?.minAmount) || null;
    const max = text(provider === 'simpleswap' ? r?.max : r?.maxAmount) || null;
    const rateId = text(e?.rateId) || null;
    const validUntil = text(e?.validUntil) || null;
    if (fixed && !rateId) return { error: `${provider} did not return a fixed-rate reservation.` };
    return { estimatedAmount, min, max, rateId, validUntil, provider };
  }

  async function quote(input) {
    prune();
    const pair = parsePair(input);
    let result;
    try { result = await estimateFor('simpleswap', pair); } catch { result = { error: 'SimpleSwap is unavailable.' }; }
    if (result.error) {
      const simpleError = result.error;
      try { result = await estimateFor('changenow', pair); } catch { result = { error: 'Exchange providers are unavailable.' }; }
      // Neither could price it: surface SimpleSwap's reason, as the wallet does.
      if (result.error) throw new ExchangeInputError(simpleError);
    }
    const providerExpiry = result.validUntil ? Date.parse(result.validUntil) : NaN;
    const expiresAt = Math.min(now() + QUOTE_TTL_MS, Number.isFinite(providerExpiry) ? providerExpiry : Infinity);
    if (expiresAt <= now()) throw new ExchangeInputError('Quote expired. Get a fresh quote.');
    const id = crypto.randomUUID();
    quotes.set(id, { pair, result, expiresAt, used: false });
    return { quoteId: id, expiresAt, from: pair.from, to: pair.to, amount: pair.amount, fixed: pair.fixed,
      provider: result.provider, estimatedAmount: result.estimatedAmount, min: result.min, max: result.max };
  }

  async function create(input) {
    prune();
    const q = quotes.get(text(input.quoteId));
    if (!q) throw new ExchangeInputError('Quote expired. Get a fresh quote.');
    const addressTo = text(input.addressTo);
    const userRefundAddress = text(input.userRefundAddress);
    const extraIdTo = text(input.extraIdTo);
    const userRefundExtraId = text(input.userRefundExtraId);
    if (!validAddress(q.pair.to.network, addressTo)) throw new ExchangeInputError('Enter a valid destination address for the receive network.');
    if (userRefundAddress && !validAddress(q.pair.from.network, userRefundAddress)) throw new ExchangeInputError('Enter a valid refund address for the send network.');
    if (extraIdTo.length > 100 || userRefundExtraId.length > 100) throw new ExchangeInputError('Memo or tag is too long.');
    const requestKey = JSON.stringify([addressTo, userRefundAddress, extraIdTo, userRefundExtraId]);
    if (q.used) {
      if (q.created && q.requestKey === requestKey) return q.created;
      throw new ExchangeInputError('This quote was already used. Check your exchange status before creating another.');
    }
    if (q.expiresAt <= now()) throw new ExchangeInputError('Quote expired. Get a fresh quote.');
    const { min, max } = q.result;
    if ((min && Number(q.pair.amount) < Number(min)) || (max && Number(q.pair.amount) > Number(max))) {
      throw new ExchangeInputError(`Amount must be between ${min || '0'} and ${max || 'the provider maximum'} ${q.pair.from.label}.`);
    }
    q.used = true; // reserve before the network request; never make a duplicate on retry
    q.requestKey = requestKey;
    const { from, to, amount, fixed } = q.pair;
    const provider = q.result.provider;
    const body = provider === 'simpleswap' ? {
      tickerFrom: from.ticker, networkFrom: from.network, tickerTo: to.ticker, networkTo: to.network,
      amount, fixed, reverse: false, addressTo, extraIdTo, userRefundAddress, userRefundExtraId,
      rateId: fixed ? q.result.rateId : null,
    } : {
      fromCurrency: from.ticker, fromNetwork: from.key === 'dot:dot' ? 'assethub' : from.network,
      toCurrency: to.ticker, toNetwork: to.key === 'dot:dot' ? 'assethub' : to.network,
      fromAmount: amount, address: addressTo, extraId: extraIdTo,
      refundAddress: userRefundAddress, refundExtraId: userRefundExtraId,
      flow: fixed ? 'fixed-rate' : 'standard', type: 'direct',
      rateId: fixed ? q.result.rateId : undefined,
    };
    let response;
    try {
      response = await worker(provider === 'simpleswap' ? '/ss/exchange' : '/cn/exchange', {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
      });
    } catch {
      throw new Error('Order creation may have reached the provider. Do not retry automatically; contact support before creating another.');
    }
    if (!response.ok) throw new ExchangeInputError(safeMessage(response.body, 'Provider refused the exchange. Get a fresh quote.'));
    const exchange = normalizeExchange(provider, response.body);
    if (!exchange.id || !exchange.addressFrom) throw new Error('Provider created an incomplete exchange. Do not retry automatically; contact support.');
    q.created = { ...exchange, amountFrom: exchange.amountFrom || amount, addressTo: exchange.addressTo || addressTo,
      from, to, fixed, expectedAmount: q.result.estimatedAmount };
    q.recoveryUntil = now() + 10 * 60_000;
    return q.created;
  }

  async function status(provider, id) {
    const p = text(provider), orderId = text(id);
    if (!['simpleswap', 'changenow'].includes(p) || !/^[A-Za-z0-9-]{4,100}$/.test(orderId)) throw new ExchangeInputError('Invalid exchange reference.');
    const response = await worker(`/${p === 'simpleswap' ? 'ss' : 'cn'}/status/${encodeURIComponent(orderId)}`);
    if (!response.ok) throw new ExchangeInputError(safeMessage(response.body, 'Could not read exchange status.'));
    return normalizeExchange(p, response.body);
  }

  return { quote, create, status };
}

function registerExchangeRoutes(app, service) {
  const limits = new Map();
  function limited(max, routeName) {
    return (req, res, next) => {
      const key = `${req.ip}:${routeName}`;
      const now = Date.now();
      if (limits.size > 10000) limits.clear();
      const bucket = limits.get(key);
      const current = !bucket || bucket.until < now ? { count: 0, until: now + 60_000 } : bucket;
      current.count++; limits.set(key, current);
      if (current.count > max) return res.status(429).json({ error: 'Too many exchange requests. Please wait a minute.' });
      next();
    };
  }
  const handle = fn => async (req, res) => {
    try { res.json(await fn(req)); }
    catch (error) {
      const inputError = error instanceof ExchangeInputError;
      res.status(inputError ? 400 : 503).json({ error: inputError ? error.message : 'Exchange service is temporarily unavailable. If creating an order, do not retry automatically.' });
    }
  };
  app.get('/api/exchange/assets', (_req, res) => res.json(ASSETS));
  app.get('/api/exchange/quote', limited(30, 'quote'), handle(req => service.quote(req.query)));
  app.post('/api/exchange/create', limited(5, 'create'), handle(req => service.create(req.body || {})));
  app.get('/api/exchange/status/:provider/:id', limited(60, 'status'), handle(req => service.status(req.params.provider, req.params.id)));
}

module.exports = { createExchangeService, registerExchangeRoutes, ExchangeInputError, validAddress, parsePair };
