const { test } = require('node:test');
const assert = require('node:assert/strict');
const { buildCandles, candleBucketMs } = require('../public/market-candles');

const minute = 60_000;
const day = 24 * 60 * minute;

test('Market Watch groups sampled prices into matching Magic Money OHLC buckets', () => {
  const start = Math.floor(1_700_000_000_000 / (30 * minute)) * (30 * minute);
  const candles = buildCandles([
    { time: start + 20 * minute, price: 9 },
    { time: start, price: 10 },
    { time: start + 10 * minute, price: 14 },
    { time: start + 30 * minute, price: 11 },
    { time: start + 40 * minute, price: 8 },
    { time: start + 50 * minute, price: 12 },
  ], '1d');
  assert.deepEqual(candles, [
    { time: start, open: 10, high: 14, low: 9, close: 9 },
    { time: start + 30 * minute, open: 9, high: 12, low: 8, close: 12 },
  ]);
});

test('Market Watch candles ignore unusable samples and size all-time buckets by span', () => {
  assert.deepEqual(buildCandles([{ time: 0, price: 1 }, { time: day, price: NaN }], '7d'), []);
  assert.equal(candleBucketMs('7d', 7 * day), 4 * 60 * minute);
  assert.equal(candleBucketMs('all', 4380 * day), 73 * day);
});
