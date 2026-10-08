const { test } = require('node:test');
const assert = require('node:assert/strict');
const { sourceListingPath, providerLinkedMarket } = require('../new-listings-chart-reference');
const event = { id: '123', exchange: 'bithumb', url: 'https://feed.bithumb.com/notice/1' };
const scenario = { eventId: '123', exchange: 'Bithumb', officialUrl: event.url, assets: [{ ticker: 'PONS', tradeOn: [{ exchange: 'Coinbase', url: 'https://www.coinbase.com/advanced-trade/spot/PONS-USD' }] }] };
const page = value => `<script>self.__next_f.push(${JSON.stringify([1, '54:' + JSON.stringify({ props: { scenario: value } }) + '\n'])})</script>`;
test('reference market requires exact event, announcement, exchange, ticker and provider-linked market URL', () => {
  assert.deepEqual(providerLinkedMarket(page(scenario), event, 'PONS'), { exchange: 'coinbase', market: 'PONS-USD', quote: 'USD' });
  assert.equal(providerLinkedMarket(page({ ...scenario, eventId: '456' }), event, 'PONS'), null);
  assert.equal(providerLinkedMarket(page({ ...scenario, officialUrl: 'https://other.example' }), event, 'PONS'), null);
  assert.equal(providerLinkedMarket(page(scenario), event, 'OTHER'), null);
  assert.equal(providerLinkedMarket(page({ ...scenario, assets: [{ ticker: 'PONS', tradeOn: [{ exchange: 'Coinbase', url: 'https://evil.example/advanced-trade/spot/PONS-USD' }] }] }), event, 'PONS'), null);
});
test('only the exact event card supplies the source listing path', () => {
  assert.equal(sourceListingPath('<a data-feed-event-id="456" href="/listings/bithumb/pons-abc">', event), null);
  assert.equal(sourceListingPath('<a data-feed-event-id="123" href="//evil.example">', event), null);
  assert.equal(sourceListingPath('<a data-feed-event-id="123" href="/listings/bithumb/pons-abc">', event), '/listings/bithumb/pons-abc');
});
