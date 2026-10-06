(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.nftMetadata = api;
})(typeof window === 'undefined' ? globalThis : window, function () {
  const scalar = value => ['string', 'number', 'boolean'].includes(typeof value);
  function traits(value) {
    if (typeof value === 'string') {
      try { value = JSON.parse(value); } catch { return []; }
    }
    const entries = Array.isArray(value) ? value : value && typeof value === 'object'
      ? Object.entries(value).map(([trait_type, value]) => ({ trait_type, value })) : [];
    return entries.filter(t => t && typeof t === 'object' && scalar(t.trait_type) && scalar(t.value))
      .map(t => ({ trait_type: String(t.trait_type), value: String(t.value) }));
  }
  return { traits };
});
