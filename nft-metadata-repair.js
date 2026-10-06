'use strict';
const { Interface } = require('ethers');
const abi = new Interface(['function tokenURI(uint256) view returns (string)', 'function uri(uint256) view returns (string)']);
const gateways = uri => {
  if (typeof uri !== 'string') return null;
  if (/^ar:\/\/[a-z0-9_-]+(?:\/[^\s?#]*)?$/i.test(uri)) return 'https://arweave.net/' + uri.slice(5);
  if (/^ipfs:\/\/(?:ipfs\/)?[a-z0-9]+(?:\/[^\s?#]*)?$/i.test(uri)) return 'https://ipfs.io/ipfs/' + uri.slice(7).replace(/^ipfs\//,'');
  return null;
};
function createMetadataRepair({ fetchImpl, apiKey }) {
  const cache = new Map();
  const document = async url => {
    const signal = AbortSignal.timeout(2500);
    for (let redirects = 0; redirects < 4; redirects++) {
      const target = new URL(url);
      if (target.protocol !== 'https:' || target.username || target.password || target.port || !['arweave.net','ipfs.io','dweb.link'].some(host => target.hostname === host || target.hostname.endsWith('.'+host))) throw new Error('Unsupported metadata gateway');
      const response = await fetchImpl(url,{signal,redirect:'manual'});
      if (![301,302,303,307,308].includes(response.status)) return response;
      const next = response.headers.get('location');
      if (!next) throw new Error('Missing redirect');
      url = new URL(next,url).href;
    }
    throw new Error('Too many redirects');
  };
  return async (network, nfts) => {
    const requests = nfts.map((nft,index) => {
      try {
        if (!/^0x[0-9a-f]{40}$/i.test(nft.contract?.address || '')) return null;
        const method = /1155/.test(nft.contract.tokenType || '') ? 'uri' : 'tokenURI';
        return {index,method,body:{jsonrpc:'2.0',id:index,method:'eth_call',params:[{to:nft.contract.address,data:abi.encodeFunctionData(method,[nft.tokenId])},'latest']}};
      } catch { return null; }
    }).filter(Boolean);
    if (!requests.length) return;
    let results;
    try {
      const rpc = { 'robinhood-mainnet':'https://rpc.mainnet.chain.robinhood.com', 'monad-mainnet':'https://rpc.monad.xyz' }[network] || `https://${network}.g.alchemy.com/v2/${apiKey}`;
      const response = await fetchImpl(rpc, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(requests.map(r=>r.body)),signal:AbortSignal.timeout(4000)});
      if (!response.ok) return;
      results = await response.json();
      if (!Array.isArray(results)) return;
    } catch { return; }
    const pending = [];
    for (const row of results) {
      const request = requests.find(r=>r.index === row.id);
      if (!request || !row.result) continue;
      try {
        const nft = nfts[request.index];
        let current = abi.decodeFunctionResult(request.method,row.result)[0];
        if (request.method === 'uri') current = current.replace(/\{id\}/g,BigInt(nft.tokenId).toString(16).padStart(64,'0'));
        const url = gateways(current);
        const cachedUri = nft.tokenUri || nft.raw?.tokenUri;
        // Fetch only content-addressed documents from fixed gateways. Never
        // follow arbitrary token URLs or redirects from the backend.
        if (!url || (url === gateways(cachedUri) && (nft.image?.cachedUrl || nft.image?.originalUrl || nft.raw?.metadata?.image))) continue;
        pending.push({nft,url});
      } catch {}
    }
    let cursor = 0;
    // Bound gateway work per page and share immutable documents across owners.
    const remembered = item => { const hit = cache.get(item.url); return hit && hit.until > Date.now(); };
    const selected = [...pending.filter(remembered), ...pending.filter(item => !remembered(item)).slice(0,12)];
    const worker = async () => {
      while (cursor < selected.length) {
        const {nft,url} = selected[cursor++];
        const hit = cache.get(url);
        let metadata = hit && hit.until > Date.now() ? hit.metadata : null;
        if (!metadata) {
          try {
            const response = await document(url);
            if (!response.ok || Number(response.headers?.get('content-length') || 0) > 1024*1024) continue;
            const body = await response.text();
            if (body.length > 1024*1024) continue;
            metadata = JSON.parse(body);
            if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) continue;
            if (cache.size >= 1000) cache.delete(cache.keys().next().value);
            cache.set(url,{metadata,until:Date.now()+10*60*1000});
          } catch { continue; }
        }
        const image = metadata.image || metadata.image_url;
        if (typeof image !== 'string' || (!gateways(image) && !/^https:\/\/[^\s]+$/i.test(image) && !/^data:image\//i.test(image))) continue;
        nft.image = { originalUrl: gateways(image) || image }; // discard stale thumbnails too
        if (typeof metadata.name === 'string') nft.name = metadata.name;
        if (typeof metadata.description === 'string') nft.description = metadata.description;
        nft.raw = {...nft.raw,metadata};
        nft.tokenUri = url;
      }
    };
    await Promise.all(Array.from({length:Math.min(6,selected.length)},worker));
  };
}
module.exports = { createMetadataRepair, gateways };
