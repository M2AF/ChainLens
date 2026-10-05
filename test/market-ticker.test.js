const { test } = require('node:test');
const assert = require('node:assert/strict');
const { dexRows, marketRows, createTickerService } = require('../market-ticker-service');
const pair = (chain, address, liquidity = 20000) => ({
  chainId: chain, baseToken: { address, symbol: 'SAME', name: 'Token' },
  priceUsd: '0.0000000123', liquidity: { usd: liquidity }, priceChange: {}, pairAddress: 'pool',
});

test('Ticker preserves chain/address identity, selects liquidity and retains unknown changes', () => {
  const rows = dexRows([pair('solana', 'AbC'), pair('solana', 'abc'), pair('base', '0xABC'),
    pair('base', '0xabc', 50000), pair('ethereum', '0xabc'), pair('base', 'bad', 1)], 100);
  assert.equal(rows.length, 4);
  assert.equal(rows.find(r => r.chain === 'base').liquidity, 50000);
  assert.equal(rows.find(r => r.chain === 'base').change, null);
  assert.equal(rows.filter(r => r.chain === 'solana').length, 2);
  assert.equal(rows[0].price, 0.0000000123);
  assert.equal(marketRows([{ id: 'btc', current_price: 10, price_change_percentage_24h: null }], 100)[0].change, null);
});

test('Ticker coalesces requests and returns global coverage when DEX is unavailable', async () => {
  let calls = 0;
  const service = createTickerService(async () => { calls++; throw new Error('offline'); });
  const coins = [{ id: 'btc', symbol: 'btc', current_price: 64000 }];
  const results = await Promise.all([service.snapshot(coins, 100), service.snapshot(coins, 100)]);
  assert.equal(calls, 7);
  assert.equal(results[0].rows.length, 1);
  assert.equal(results[0].rows[0].updatedAt, 100);
  await service.snapshot(coins, 100);
  assert.equal(calls, 7);
});

test('Ticker resolves discovery across chains and caches the resulting prices', async () => {
  let calls = 0;
  const service = createTickerService(async url => {
    calls++;
    return { ok: true, json: async () => url.includes('token-profiles')
      ? [{ chainId: 'solana', tokenAddress: 'ABC' }, { chainId: 'base', tokenAddress: '0xabc' }]
      : url.includes('/search') ? { pairs: [] }
        : [url.includes('/solana/') ? pair('solana', 'ABC') : pair('base', '0xabc')] };
  });
  const result = await service.snapshot([], 0);
  assert.deepEqual(result.rows.map(r => r.chain), ['solana', 'base']);
  assert.equal(result.rows[0].change, null);
  assert.equal(calls, 9);
  await service.snapshot([], 0);
  assert.equal(calls, 9);
});
