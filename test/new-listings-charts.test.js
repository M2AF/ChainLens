const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createListingChartService, normalizeCandles } = require('../new-listings-charts');
const now = 1700000000000;
const event = (changes = {}) => ({ id: '123', symbols: ['PONS'], exchange: 'coinbase', marketType: 'spot', markets: [], timestamp: now - 600000, ...changes });
const feed = item => async () => ({ events: [item] });
const candle = [Math.floor(now / 1000) - 300, 1, 4, 2, 3, 20];
const response = data => new Response(JSON.stringify(data));

test('verifies exact exchange pair and base/quote metadata before returning sorted, real OHLCV', async () => {
  const calls = [];
  const service = createListingChartService(async url => {
    calls.push(url);
    return response(url.endsWith('/products') ? [{ id: 'PONS-USD', base_currency: 'PONS', quote_currency: 'USD' }] : [candle, [...candle].map((n, i) => i === 0 ? n - 300 : n), candle]);
  }, feed(event()), () => now);
  const result = await service.chart('123', 'PONS');
  assert.equal(result.market, 'PONS-USD'); assert.equal(result.quote, 'USD');
  assert.equal(result.candles.length, 2); assert.equal(result.candles[1].close, 3);
  assert(result.candles[0].time < result.candles[1].time);
  assert(calls.every(url => url.startsWith('https://api.exchange.coinbase.com/')));
  await service.chart('123', 'PONS'); assert.equal(calls.length, 2);
});

test('does not guess another exchange, another quote, substring symbols or a different listing', async () => {
  let calls = 0;
  const service = createListingChartService(async () => { calls++; return response([{ market: 'KRW-XPONS' }, { market: 'BTC-PONS' }]); }, feed(event({ exchange: 'upbit', markets: ['krw'] })), () => now);
  assert.equal((await service.chart('123', 'PONS')).status, 'unavailable');
  assert.equal((await service.chart('123', 'OTHER')).status, 'unavailable');
  assert.equal((await service.chart('456', 'PONS')).status, 'unavailable');
  assert.equal(calls, 2); // Catalog plus public listing-link discovery, with no guessed pair request.
});

test('unsupported markets and invalid parameters never fetch exchange data', async () => {
  for (const item of [event({ exchange: 'robinhood' }), event({ marketType: 'pre-market' }), event({ marketType: 'futures' })]) {
    const service = createListingChartService(async () => { throw new Error('unexpected fetch'); }, feed(item), () => now);
    assert.match((await service.chart('123', 'PONS')).reason, /No verified chart/);
  }
  let lookedUp = false;
  const service = createListingChartService(fetch, async () => { lookedUp = true; }, () => now);
  await service.chart('../123', 'PONS'); await service.chart('123', 'PONS', 'year');
  assert.equal(lookedUp, false);
});

test('normalization rejects mismatched markets and malformed OHLC rather than publishing a chart', () => {
  assert.throws(() => normalizeCandles([[now / 1000, 4, 2, 1, 3, 0]], 'coinbase', 'PONS-USD', 0, now));
  assert.throws(() => normalizeCandles([{ market: 'KRW-OTHER' }], 'upbit', 'KRW-PONS', 0, now));
  assert.throws(() => normalizeCandles([[now, 'bad', 4, 1, 3, 0]], 'mexc', 'PONSUSDT', 0, now));
});

test('shared in-flight requests, API failures and empty history stay bounded and explicit', async () => {
  let calls = 0;
  const service = createListingChartService(async url => { calls++; return response(url.endsWith('/products') ? [{ id: 'PONS-USD', base_currency: 'PONS', quote_currency: 'USD' }] : []); }, feed(event()), () => now);
  const results = await Promise.all([service.chart('123', 'PONS'), service.chart('123', 'PONS')]);
  assert.equal(calls, 3); assert.match(results[0].reason, /no published candles/);
  const offline = createListingChartService(async () => new Response('', { status: 429 }), feed(event()), () => now);
  assert.match((await offline.chart('123', 'PONS')).reason, /temporarily unavailable/);
});

test('reference fallback follows the exact listing metadata then verifies the linked Coinbase pair', async () => {
  const item = event({ exchange: 'bithumb', url: 'https://feed.bithumb.com/notice/1' });
  const scenario = { eventId: item.id, exchange: 'Bithumb', officialUrl: item.url, assets: [{ ticker: 'PONS', tradeOn: [{ exchange: 'Coinbase', url: 'https://www.coinbase.com/advanced-trade/spot/PONS-USD' }] }] };
  const service = createListingChartService(async url => {
    if (url.includes('/market/all')) return response([]);
    if (url === 'https://newlistings.pro/') return new Response('<a data-feed-event-id="123" href="/listings/bithumb/pons-abc">');
    if (url.includes('/listings/')) return new Response(`<script>self.__next_f.push(${JSON.stringify([1, '54:' + JSON.stringify({ props: { scenario } }) + '\n'])})</script>`);
    if (url.endsWith('/products')) return response([{ id: 'PONS-USD', base_currency: 'PONS', quote_currency: 'USD' }]);
    return response([candle]);
  }, feed(item), () => now);
  const chart = await service.chart('123', 'PONS');
  assert.equal(chart.match, 'provider-linked-market'); assert.equal(chart.listingExchange, 'bithumb');
  assert.equal(chart.exchange, 'coinbase'); assert.equal(chart.market, 'PONS-USD');
});

test('MEXC metadata chooses the exact base and quote and preserves the quote unit', async () => {
  const item = event({ exchange: 'mexc', symbols: ['DARK'] });
  const service = createListingChartService(async url => response(url.includes('exchangeInfo')
    ? { symbols: [{ symbol: 'DARKUSDT', baseAsset: 'DARK', quoteAsset: 'USDT' }] }
    : [[now - 300000, '0.002', '0.009', '0.001', '0.008', '123.45']]), feed(item), () => now);
  const chart = await service.chart('123', 'DARK');
  assert.equal(chart.quote, 'USDT'); assert.equal(chart.candles[0].open, 0.002);
});
