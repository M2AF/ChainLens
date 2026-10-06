(function (root) {
  // Both galleries share complete, paginated wallet/chain results for this session.
  const targetKey = (chain, address) => `${chain}:${/^0x/i.test(address) ? address.toLowerCase() : address}`;
  async function request(url, signal, timeout = 30000) {
    const child = new AbortController();
    const cancel = () => child.abort();
    signal?.addEventListener('abort', cancel, { once: true });
    if (signal?.aborted) cancel();
    const timer = setTimeout(cancel, timeout);
    try {
      const response = await fetch(url, { signal: child.signal });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const body = await response.json();
      if (body.error) throw new Error(String(body.error));
      return body;
    } catch (error) {
      if (child.signal.aborted && !signal?.aborted) throw new Error('Request timed out');
      throw error;
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', cancel);
    }
  }
  function create({ key, normalize = asset => asset, fetchPage = request } = {}) {
    const entries = new Map(), queue = [];
    let active = 0;
    const drain = () => {
      while (active < 6 && queue.length) {
        const job = queue.shift(); active++;
        job().finally(() => { active--; drain(); });
      }
    };
    const peek = (chain, address) => [...(entries.get(targetKey(chain, address))?.assets.values() || [])];
    function load(chain, address, onPage) {
      const id = targetKey(chain, address);
      let entry = entries.get(id);
      if (entry && !entry.error) {
        if (onPage) { if (!entry.complete) entry.listeners.add(onPage); onPage([...entry.assets.values()]); }
        return entry.promise;
      }
      entry = { assets: new Map(entry?.assets || []), listeners: new Set(onPage ? [onPage] : []), controller: new AbortController() };
      entries.set(id, entry);
      entry.promise = new Promise((resolve, reject) => {
        queue.push(async () => {
          const deadline = setTimeout(() => entry.controller.abort(), 120000);
          try {
            let cursor = '', pages = 0;
            const seen = new Set();
            do {
              if (entry.controller.signal.aborted) throw new Error('NFT loading cancelled or timed out');
              const body = await fetchPage(`/api/nfts/${chain}/${encodeURIComponent(address)}${cursor ? `?pageKey=${encodeURIComponent(cursor)}` : ''}`, entry.controller.signal);
              for (const asset of body.nfts || []) {
                const nft = normalize({ ...asset, chain: asset.chain || chain, isToken: false });
                entry.assets.set(key(nft), nft);
              }
              for (const listener of entry.listeners) listener([...entry.assets.values()]);
              cursor = body.nextPageKey ? String(body.nextPageKey) : '';
              if (cursor && (seen.has(cursor) || ++pages >= 200)) throw new Error('NFT pagination did not finish');
              seen.add(cursor);
            } while (cursor);
            entry.complete = true;
            resolve([...entry.assets.values()]);
          } catch (error) { entry.error = error; reject(error); }
          finally { clearTimeout(deadline); entry.listeners.clear(); }
        });
        drain();
      });
      return entry.promise;
    }
    return { load, peek, clear() { for (const entry of entries.values()) entry.controller.abort(); entries.clear(); } };
  }
  const api = { create, request, targetKey };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.NftSession = api;
})(typeof window === 'undefined' ? globalThis : window);
