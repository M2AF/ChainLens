/* OHLC candles from the sampled prices returned by every Market Watch source.
 * High and low reflect sampled prices, not exchange tick-level extremes. */
(function (root) {
  'use strict';

  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;
  const fixedBuckets = {
    '1d': 30 * minute,
    '7d': 4 * hour,
    '1m': day,
    '1y': 7 * day,
  };

  function candleBucketMs(timeframe, spanMs) {
    return fixedBuckets[timeframe] || Math.max(day, Math.ceil(spanMs / 60 / day) * day);
  }

  function buildCandles(prices, timeframe) {
    const points = (prices || [])
      .map(point => ({ time: Number(point.time), price: Number(point.price) }))
      .filter(point => Number.isFinite(point.time) && Number.isFinite(point.price) && point.price >= 0)
      .sort((a, b) => a.time - b.time);
    if (points.length < 2) return [];

    const bucketMs = candleBucketMs(timeframe, points[points.length - 1].time - points[0].time);
    const candles = [];
    let current = null;
    for (const point of points) {
      const time = Math.floor(point.time / bucketMs) * bucketMs;
      if (current && time === current.time) {
        current.high = Math.max(current.high, point.price);
        current.low = Math.min(current.low, point.price);
        current.close = point.price;
        continue;
      }
      const open = current ? current.close : point.price;
      if (current) candles.push(current);
      current = {
        time,
        open,
        high: Math.max(open, point.price),
        low: Math.min(open, point.price),
        close: point.price,
      };
    }
    if (current) candles.push(current);
    return candles;
  }

  const api = { candleBucketMs, buildCandles };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.ChainLensMarketCandles = api;
})(typeof window !== 'undefined' ? window : undefined);
