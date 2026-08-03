const test = require('node:test');
const assert = require('node:assert/strict');
const { createSearchService, normalizeBaseUrl, validateQuery } = require('../search-service');

test('normalizes provider base URLs and validates queries', () => {
  assert.equal(normalizeBaseUrl('https://search.example.com///'), 'https://search.example.com');
  assert.equal(validateQuery('  chain   lens  '), 'chain lens');
  assert.throws(() => validateQuery('   '), /Enter a search query/);
  assert.throws(() => normalizeBaseUrl('file:///tmp/search'), /HTTP or HTTPS/);
});

test('builds a SearXNG request and normalizes safe results', async () => {
  let requestedUrl;
  const service = createSearchService({
    baseUrl: 'https://search.example.com/',
    fetchImpl: async (url) => {
      requestedUrl = new URL(url);
      return {
        ok: true,
        json: async () => ({ results: [
          { title: '<b>ChainLens</b>', url: 'https://chainlensnft.info/about', content: 'Multi-chain <em>search</em>', engines: ['duckduckgo'] },
          { title: 'Unsafe', url: 'javascript:alert(1)', content: 'ignored' },
        ] }),
      };
    },
  });

  const payload = await service.searchWeb('ChainLens');
  assert.equal(requestedUrl.origin, 'https://search.example.com');
  assert.equal(requestedUrl.pathname, '/search');
  assert.equal(requestedUrl.searchParams.get('format'), 'json');
  assert.equal(requestedUrl.searchParams.get('q'), 'ChainLens');
  assert.equal(payload.results.length, 1);
  assert.equal(payload.results[0].title, 'ChainLens');
  assert.equal(payload.results[0].snippet, 'Multi-chain search');
  assert.equal(payload.results[0].source, 'chainlensnft.info');
});

test('caches successful searches without repeating the upstream request', async () => {
  let calls = 0;
  const service = createSearchService({
    baseUrl: 'https://search.example.com',
    fetchImpl: async () => {
      calls += 1;
      return { ok: true, json: async () => ({ results: [] }) };
    },
  });

  const first = await service.searchWeb('wallet');
  const second = await service.searchWeb('WALLET');
  assert.equal(calls, 1);
  assert.equal(first.cached, false);
  assert.equal(second.cached, true);
});

test('reports missing configuration and upstream failures safely', async () => {
  const missing = createSearchService({ baseUrl: '' });
  await assert.rejects(() => missing.searchWeb('test'), error => error.statusCode === 503);

  const failing = createSearchService({
    baseUrl: 'https://search.example.com',
    fetchImpl: async () => ({ ok: false, status: 500 }),
  });
  await assert.rejects(() => failing.searchWeb('test'), /temporarily unavailable/);
});
