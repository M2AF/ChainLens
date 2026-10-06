(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.nftFloor = api;
})(typeof window === 'undefined' ? globalThis : window, function () {
  function amount(value) {
    if (typeof value !== 'number' && typeof value !== 'string' || value === '') return null;
    if (typeof value === 'string' && !value.trim()) return null;
    const number = Number(value);
    return Number.isFinite(number) && number >= 0 ? number : null;
  }
  function usd(asset) { return amount(asset.floorPriceUsd); }
  function compare(a, b) {
    const left = usd(a), right = usd(b);
    return left === null ? (right === null ? 0 : 1) : right === null ? -1 : right - left;
  }
  function label(asset) {
    const value = usd(asset);
    return value === null ? 'Floor unavailable' : `Floor ${new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: value > 0 && value < .01 ? 6 : 2 }).format(value)}`;
  }
  return { amount, usd, compare, label };
});
