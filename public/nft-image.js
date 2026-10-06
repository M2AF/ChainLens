(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.nftImage = api;
})(typeof window === 'undefined' ? globalThis : window, function () {
  function validCID(value) {
    if (typeof value !== 'string' || value.length > 128) return false;
    let bytes = [];
    if (/^(?:Qm|z)[1-9A-HJ-NP-Za-km-z]+$/.test(value)) {
      let n = 0n; const alphabet = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
      for (const char of value.startsWith('z') ? value.slice(1) : value) n = n * 58n + BigInt(alphabet.indexOf(char));
      while (n) { bytes.unshift(Number(n & 255n)); n >>= 8n; }
      if (value.startsWith('Qm')) return bytes.length === 34 && bytes[0] === 18 && bytes[1] === 32;
    } else if (/^b[a-z2-7]+$/.test(value)) {
      let bits = 0, buffer = 0; const alphabet = 'abcdefghijklmnopqrstuvwxyz234567';
      for (const char of value.slice(1)) { buffer = (buffer << 5) | alphabet.indexOf(char); bits += 5; if (bits >= 8) { bits -= 8; bytes.push((buffer >> bits) & 255); } }
      if (bits && (buffer & ((1 << bits)-1))) return false;
    } else return false;
    let index = 0;
    const integer = () => { let n=0,factor=1; for (let i=0;i<7 && index<bytes.length;i++) { const byte=bytes[index++]; n+=(byte&127)*factor; if (!(byte&128)) return n; factor*=128; } return null; };
    if (integer() !== 1 || !integer() || !integer()) return false;
    const size = integer(); return size > 0 && size <= 64 && bytes.length-index === size;
  }
  function urls(value, base) {
    if (Array.isArray(value)) value = value.every(v => typeof v === 'string') ? value.join('') : '';
    if (typeof value !== 'string' || !value.trim()) return [];
    let url = value.trim();
    if (base && !/^[a-z][a-z0-9+.-]*:/i.test(url)) {
      try { url = new URL(url, urls(base)[0]).href; } catch { return []; }
    }
    if (/^\/(?!\/)/.test(url)) return [url];
    if (url.startsWith('ar://')) return ['https://arweave.net/' + url.slice(5)];
    let path;
    if (url.startsWith('ipfs://')) path = url.slice(7).replace(/^ipfs\//,'');
    else if (validCID(url.split('/')[0])) path = url;
    else {
      try {
        const parsed = new URL(url);
        if (parsed.hostname.includes('.ipfs.')) path = parsed.hostname.split('.ipfs.')[0] + parsed.pathname + parsed.search;
        else if (/\/ipfs\//.test(parsed.pathname)) path = parsed.pathname.split('/ipfs/')[1] + parsed.search;
      } catch {}
    }
    if (path) {
      let retired = false;
      try { const host = new URL(url).hostname; retired = ['cloudflare-ipfs.com','ipfs.io','dweb.link','w3s.link'].some(name => host === name || host.endsWith('.'+name)); } catch {}
      return [...new Set([...( /^https?:/i.test(url) && !retired ? [url] : []), 'https://ipfs.blockfrost.dev/ipfs/' + path, 'https://gateway.pinata.cloud/ipfs/' + path, 'https://ipfs.filebase.io/ipfs/' + path])];
    }
    return /^(https?:|data:image\/|blob:)/i.test(url) ? [url] : [];
  }
  function sources(asset, preview = true) {
    const extras = Array.isArray(asset.imageSources) ? asset.imageSources : [];
    const values = preview ? [asset.thumbnailUrl,asset.image,...extras] : [asset.image,...extras,asset.thumbnailUrl];
    return [...new Set(values.flatMap(value => urls(value, asset.metadataUri)))];
  }
  function metadataSources(metadata = {}, base) {
    if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return [];
    const svg = typeof metadata.image_data === 'string' && metadata.image_data.trim().startsWith('<svg') ? 'data:image/svg+xml,' + encodeURIComponent(metadata.image_data) : '';
    const files = Array.isArray(metadata.files) ? metadata.files : [];
    return [...new Set([metadata.image,metadata.image_url,svg,...files.filter(file => /^image\//i.test(file?.mediaType || file?.mimeType || file?.mime || '')).map(file => file.src || file.uri)].flatMap(value => urls(value,base)))];
  }
  function createLoader({ makeImage = () => new Image(), limit = 6, timeoutMs = 12000, maxAttempts = 9 } = {}) {
    const records = new Map(), queue = [], successful = new Map(), targets = new WeakMap();
    let targetCounter = 0;
    let active = 0;
    const drain = () => {
      while (active < limit && queue.length) {
        const record = queue.shift();
        if (!record.listeners.size) { records.delete(record.key); continue; }
        active++;
        let index = 0, timer, finished = false, image;
        const finish = url => {
          if (finished) return;
          finished = true; clearTimeout(timer);
          if (image) { image.onload = image.onerror = null; if (!url) image.src = record.target ? '/profile-art-fallback.svg' : ''; }
          record.url = url; record.status = url ? 'loaded' : 'failed'; record.at = Date.now();
          if (url) successful.set(record.signature,url);
          if (successful.size > 3000) successful.delete(successful.keys().next().value);
          active--; for (const listener of record.listeners) listener({url,status:record.status});
          drain();
        };
        record.cancel = () => finish('');
        const next = () => {
          clearTimeout(timer);
          if (finished) return;
          if (image) { image.onload = image.onerror = null; image.src = ''; }
          if (index >= Math.min(maxAttempts, record.candidates.length)) return finish('');
          image = record.target || makeImage(); const candidate = record.candidates[index++], attempt = index;
          image.onload = () => {
            if (image.decode) image.decode().then(() => { if (index === attempt && !finished) finish(candidate); }, () => { if (index === attempt && !finished) next(); });
            else finish(candidate);
          };
          image.onerror = next;
          timer = setTimeout(next, timeoutMs); image.src = candidate;
        };
        next();
      }
    };
    return {
      load(candidates, listener, target) {
        const signature = JSON.stringify(candidates);
        if (target && !targets.has(target)) targets.set(target,++targetCounter);
        const key = signature + (target ? ':' + targets.get(target) : '');
        let record = records.get(key);
        if (record?.status === 'failed' && Date.now() - record.at > 30000) { records.delete(key); record = null; }
        if (!record) {
          const previous = successful.get(signature);
          record = { key, signature, target, candidates:previous ? [previous,...candidates.filter(url => url !== previous)] : candidates, listeners: new Set(), status:'loading', url:'' };
          records.set(key, record); queue.push(record);
          // Bound retained source records without evicting in-flight work.
          if (records.size > 3000) for (const [oldKey, old] of records) {
            if (old.status !== 'loading' && !old.listeners.size) { records.delete(oldKey); break; }
          }
        }
        record.listeners.add(listener);
        listener({url:record.url,status:record.status}); drain();
        return () => {
          record.listeners.delete(listener);
          if (target && record.status === 'loading' && !record.listeners.size) record.cancel?.();
        };
      },
      clear() {
        queue.length = 0;
        for (const record of records.values()) { record.listeners.clear(); record.cancel?.(); }
        records.clear(); successful.clear();
      },
      forget(candidates) {
        const signature = JSON.stringify(candidates); successful.delete(signature);
        for (const [key,record] of records) if (record.signature === signature) { record.cancel?.(); records.delete(key); }
      }
    };
  }
  const repairs = new Map();
  function readRepair(asset, retry = false) {
    const key = `${asset.chain}:${asset.contractAddress || asset.id}:${asset.tokenId || ''}`;
    const hit = repairs.get(key);
    if (!retry && hit && Date.now() - hit.at < 4000) return hit.promise;
    const identity = asset.chain === 'solana' ? encodeURIComponent(asset.id) : `${encodeURIComponent(asset.contractAddress)}/${encodeURIComponent(asset.tokenId)}`;
    const promise = fetch(`/api/nft-art/${encodeURIComponent(asset.chain)}/${identity}`, {method:retry ? 'POST' : 'GET',signal:AbortSignal.timeout(10000)})
      .then(response => { if (!response.ok) throw Error('Artwork repair unavailable'); return response.json(); });
    repairs.set(key,{at:Date.now(),promise});
    if (repairs.size > 2000) repairs.delete(repairs.keys().next().value);
    return promise;
  }
  return { urls, sources, metadataSources, validCID, createLoader, readRepair };
});
