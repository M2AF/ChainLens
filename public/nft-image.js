(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.nftImage = api;
})(typeof window === 'undefined' ? globalThis : window, function () {
  function urls(value) {
    if (typeof value !== 'string' || !value.trim()) return [];
    let url = value.trim();
    if (/^\/(?!\/)/.test(url)) return [url];
    if (url.startsWith('ar://')) return ['https://arweave.net/' + url.slice(5)];
    let path;
    if (url.startsWith('ipfs://')) path = url.slice(7).replace(/^ipfs\//,'');
    else {
      try {
        const parsed = new URL(url);
        if (parsed.hostname.includes('.ipfs.')) path = parsed.hostname.split('.ipfs.')[0] + parsed.pathname + parsed.search;
        else if (/\/ipfs\//.test(parsed.pathname)) path = parsed.pathname.split('/ipfs/')[1] + parsed.search;
      } catch {}
    }
    if (path) return ['https://ipfs.io/ipfs/' + path, 'https://dweb.link/ipfs/' + path];
    return /^(https?:|data:image\/|blob:)/i.test(url) ? [url] : [];
  }
  function sources(asset, preview = true) {
    const values = preview ? [asset.thumbnailUrl,asset.image,...(asset.imageSources || [])] : [asset.image,...(asset.imageSources || []),asset.thumbnailUrl];
    return [...new Set(values.flatMap(urls))];
  }
  return { urls, sources };
});
