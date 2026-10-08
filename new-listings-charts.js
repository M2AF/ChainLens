'use strict';

const RANGES = { '1h': { seconds: 3600, unit: 1 }, '6h': { seconds: 21600, unit: 5 }, '1d': { seconds: 86400, unit: 15 }, '7d': { seconds: 604800, unit: 60 } };
const HOSTS = { upbit: 'https://api.upbit.com', bithumb: 'https://api.bithumb.com', coinbase: 'https://api.exchange.coinbase.com', mexc: 'https://api.mexc.com', binance: 'https://data-api.binance.vision' };
const { sourceListingPath, providerLinkedMarket } = require('./new-listings-chart-reference');
const unavailable = reason => ({ status: 'unavailable', reason, candles: [] });

function normalizeCandles(rows, exchange, market, start, end) {
  if (!Array.isArray(rows) || rows.length > 1000) throw new Error('Invalid candles');
  const candles = rows.map(row => {
    if (exchange === 'upbit' || exchange === 'bithumb') {
      if (row.market !== market) throw new Error('Wrong market');
      return { time: Date.parse(row.candle_date_time_utc + 'Z'), open: Number(row.opening_price), high: Number(row.high_price), low: Number(row.low_price), close: Number(row.trade_price), volume: Number(row.candle_acc_trade_volume) };
    }
    if (!Array.isArray(row) || row.length < 6) throw new Error('Invalid candle');
    return exchange === 'coinbase'
      ? { time: Number(row[0]) * 1000, low: Number(row[1]), high: Number(row[2]), open: Number(row[3]), close: Number(row[4]), volume: Number(row[5]) }
      : { time: Number(row[0]), open: Number(row[1]), high: Number(row[2]), low: Number(row[3]), close: Number(row[4]), volume: Number(row[5]) };
  });
  for (const candle of candles) {
    if (!Object.values(candle).every(Number.isFinite) || candle.time <= 0 || candle.volume < 0 || candle.low <= 0 || candle.low > Math.min(candle.open, candle.close) || candle.high < Math.max(candle.open, candle.close)) throw new Error('Invalid candle values');
  }
  const unique = new Map(candles.filter(c => c.time >= start && c.time <= end).map(c => [c.time, c]));
  return [...unique.values()].sort((a, b) => a.time - b.time);
}

function createListingChartService(fetchImpl, getFeed, now = Date.now) {
  const cache = new Map(), pending = new Map();
  function memo(key, ttl, load) {
    const saved = cache.get(key);
    if (saved && saved.until > now()) return Promise.resolve(saved.value);
    if (pending.has(key)) return pending.get(key);
    const promise = Promise.resolve().then(load).then(value => {
      cache.delete(key); cache.set(key, { value, until: now() + ttl });
      while (cache.size > 400) cache.delete(cache.keys().next().value);
      return value;
    }).finally(() => pending.delete(key));
    pending.set(key, promise); return promise;
  }
  async function read(url) {
    const response = await fetchImpl(url, { signal: AbortSignal.timeout(6000), redirect: 'error', headers: { Accept: 'application/json', 'User-Agent': 'ChainLens market charts' } });
    if (!response.ok) throw new Error('Market data unavailable');
    // Exchange catalogs can be large; enforce a bounded response while streaming.
    const reader = response.body.getReader(); const chunks = []; let size = 0;
    try {
      while (true) {
        const { done, value } = await reader.read(); if (done) break;
        size += value.byteLength;
        if (size > 8 * 1024 * 1024) { await reader.cancel(); throw new Error('Response too large'); }
        chunks.push(Buffer.from(value));
      }
    } finally { reader.releaseLock(); }
    return Buffer.concat(chunks).toString('utf8');
  }
  const json = async url => JSON.parse(await read(url));
  async function load(event, symbol, range) {
    const exchange = event.exchange.toLowerCase();
    if (!HOSTS[exchange] || event.marketType?.toLowerCase() !== 'spot') return unavailable('No verified chart source for this exchange or market type.');
    const host = HOSTS[exchange];
    const catalog = await memo('catalog:' + exchange, 300_000, async () => {
      const data = await json(host + (exchange === 'coinbase' ? '/products' : ['upbit', 'bithumb'].includes(exchange) ? '/v1/market/all' : '/api/v3/exchangeInfo'));
      const rows = exchange === 'mexc' || exchange === 'binance' ? data.symbols : data;
      if (!Array.isArray(rows)) throw new Error('Invalid catalog');
      return rows.map(row => exchange === 'coinbase'
        ? { id: row.id, base: row.base_currency, quote: row.quote_currency }
        : ['upbit', 'bithumb'].includes(exchange)
          ? { id: row.market, base: row.market?.split('-')[1], quote: row.market?.split('-')[0] }
          : { id: row.symbol, base: row.baseAsset, quote: row.quoteAsset });
    });
    const declared = (event.markets || []).map(q => q.toUpperCase());
    const quotes = declared.length ? declared : exchange === 'coinbase' ? ['USD', 'USDT', 'USDC', 'EUR', 'BTC'] : ['upbit', 'bithumb'].includes(exchange) ? ['KRW', 'USDT', 'BTC'] : ['USDT', 'USDC', 'BTC', 'ETH'];
    const market = quotes.map(quote => catalog.find(row => row.base === symbol && row.quote === quote)).find(Boolean);
    if (!market || !/^[A-Z0-9_-]{2,80}$/.test(market.id)) return unavailable('This token has no matching public trading pair on the announcing exchange yet.');
    const { seconds, unit } = RANGES[range]; const end = now(), start = end - seconds * 1000;
    let url;
    if (exchange === 'coinbase') url = `${host}/products/${market.id}/candles?granularity=${unit * 60}&start=${new Date(start).toISOString()}&end=${new Date(end).toISOString()}`;
    else if (['upbit', 'bithumb'].includes(exchange)) url = `${host}/v1/candles/minutes/${unit}?market=${market.id}&count=200`;
    else url = `${host}/api/v3/klines?symbol=${market.id}&interval=${unit === 60 ? exchange === 'mexc' ? '60m' : '1h' : unit + 'm'}&startTime=${start}&endTime=${end}&limit=200`;
    const candles = normalizeCandles(await json(url), exchange, market.id, start, end);
    if (!candles.length) return unavailable('The matching market has no published candles in this range yet.');
    return { status: 'available', exchange, market: market.id, symbol, quote: market.quote, range, intervalSeconds: unit * 60,
      detectedAt: event.timestamp, fetchedAt: end, coverageStart: candles[0].time, coverageEnd: candles.at(-1).time,
      match: 'announcing-exchange-pair', candles };
  }
  return { async chart(id, symbol, range = '6h') {
    if (!/^\d{1,30}$/.test(id) || !/^[A-Z0-9._-]{1,40}$/.test(symbol) || !Object.hasOwn(RANGES, range)) return unavailable('Invalid chart selection.');
    try {
      const feed = await memo('feed', 10_000, getFeed);
      const event = feed.events.find(item => String(item.id) === id && item.symbols.includes(symbol));
      if (!event) return unavailable('This listing is no longer available in the feed.');
      return await memo(JSON.stringify([id, symbol, range]), 60_000, async () => {
        let result;
        try { result = await load(event, symbol, range); } catch { return unavailable('Exchange chart data is temporarily unavailable.'); }
        if (result.status === 'available') return result;
        try {
          const html = await memo('source-feed', 60_000, () => read('https://newlistings.pro/'));
          const path = sourceListingPath(html, event);
          if (!path) return result;
          const reference = await memo('reference:' + id + ':' + symbol, 300_000, async () => providerLinkedMarket(await read('https://newlistings.pro' + path), event, symbol));
          if (!reference || reference.exchange === event.exchange.toLowerCase()) return result;
          const chart = await load({ ...event, exchange: reference.exchange, marketType: 'spot', markets: [reference.quote] }, symbol, range);
          if (chart.status !== 'available' || chart.market !== reference.market) return result;
          return { ...chart, match: 'provider-linked-market', listingExchange: event.exchange, sourceListingUrl: 'https://newlistings.pro' + path };
        } catch { return result; }
      });
    } catch { return unavailable('The listings feed is temporarily unavailable.'); }
  } };
}

module.exports = { createListingChartService, normalizeCandles };
