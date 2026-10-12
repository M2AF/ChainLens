(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ChainLensProfiles = api;
})(typeof window === 'object' ? window : globalThis, function () {
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const pathId = path => { const id = String(path || '').replace(/^\//, '').replace(/\/$/, ''); return UUID.test(id) ? id.toLowerCase() : null; };
  const parseId = value => {
    const text = String(value || '').trim();
    if (UUID.test(text)) return text.toLowerCase();
    try { const url = new URL(text); return url.protocol === 'https:' && ['www.chainlensnft.info', 'chainlensnft.info'].includes(url.hostname) ? pathId(url.pathname) : null; } catch { return null; }
  };
  const profileLink = id => `https://www.chainlensnft.info/${id}`;
  return { pathId, parseId, profileLink };
});
