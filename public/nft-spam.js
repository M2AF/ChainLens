(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.nftSpam = api;
})(typeof window === 'undefined' ? globalThis : window, function () {
  // Preserve the scanner's existing NFT rules in both galleries. Automatic
  // suspicion is local presentation; only a user's decision syncs as spam.
  const words = ['voucher','wen','airdrop','promo','lucky','ticket','pass','jup','jupiter','unprotected','box','redeem','claim','gift','reward'];
  function suspected(asset) {
    if (asset.isToken) return asset.suspectedSpam === true;
    if (asset.suspectedSpam === true || asset.isSpam === true || asset.isSpam === 'true') return true;
    const name = String(asset.name || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9\s]/g,'');
    return words.some(w => name.includes(w));
  }
  function isSpam(asset, entry) {
    if (entry?.s === 'a') return false;
    return ['h','s'].includes(entry?.s) || suspected(asset);
  }
  return { suspected, isSpam };
});
