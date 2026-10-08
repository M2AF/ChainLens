const { test } = require('node:test');
const assert = require('node:assert/strict');
const { parseSourceIcons, createListingIconEnricher } = require('../new-listings-icons');
const image = '/_next/image?url=%2Fmedia%2Ftoken-images%2Fa.png&amp;w=64&amp;q=75';
const card = (id, symbols, urls = symbols.map(() => image)) => `<a data-feed-event-id="${id}" data-feed-cache="${encodeURIComponent(JSON.stringify(['feed', id, 'cache', symbols]))}">${urls.map(src => `<img src="${src}"/>`).join('')}</a>`;

test('source artwork matches exact event IDs and keeps multi-token order; unsafe and incomplete cards are skipped', () => {
  const icons = parseSourceIcons(card('1', ['A', 'B']) + card('2', ['A'], ['https://evil.example/image']) + card('3', ['A', 'B'], [image]));
  assert.equal(icons.size, 1);
  assert.deepEqual(icons.get('1').map(asset => asset.symbol), ['A', 'B']);
  assert.equal(icons.get('1')[0].url, 'https://newlistings.pro/_next/image?url=%2Fmedia%2Ftoken-images%2Fa.png&w=64&q=75');
});

test('one cached source request enriches matching events without guessing from symbols', async () => {
  let requests = 0;
  const enrich = createListingIconEnricher(async () => { requests++; return new Response(card('1', ['A', 'B'])); });
  const feed = { state: 'live', events: [{ id: '1', symbols: ['A', 'B'] }, { id: '2', symbols: ['A'] }, { id: '1', symbols: ['B', 'A'] }] };
  const [result] = await Promise.all([enrich(feed), enrich(feed)]);
  await enrich(feed);
  assert.equal(requests, 1);
  assert.equal(result.events[0].tokenIcons.length, 2);
  assert.equal(result.events[1].tokenIcons, undefined);
  assert.equal(result.events[2].tokenIcons, undefined);
  assert.equal(feed.events[0].tokenIcons, undefined);
});

test('source failure or oversized response preserves the announcements', async () => {
  const feed = { events: [{ id: '1', symbols: ['A'] }] };
  for (const fetchImpl of [async () => { throw new Error('offline'); }, async () => new Response('x'.repeat(2 * 1024 * 1024 + 1))]) {
    assert.deepEqual(await createListingIconEnricher(fetchImpl)(feed), feed);
  }
});
