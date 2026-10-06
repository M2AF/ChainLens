'use strict';
const { Interface } = require('ethers');
const { createDocumentReader } = require('./nft-metadata-document');
const { urls, metadataSources } = require('./public/nft-image');
const abi = new Interface(['function tokenURI(uint256) view returns (string)', 'function uri(uint256) view returns (string)']);
const gateways = uri => {
  if (typeof uri !== 'string') return null;
  if (/^ar:\/\/[a-z0-9_-]+(?:\/[^\s?#]*)?$/i.test(uri)) return 'https://arweave.net/' + uri.slice(5);
  if (/^ipfs:\/\/(?:ipfs\/)?[a-z0-9]+(?:\/[^\s?#]*)?$/i.test(uri)) return 'https://ipfs.blockfrost.dev/ipfs/' + uri.slice(7).replace(/^ipfs\//,'');
  return null;
};
function createMetadataRepair({ fetchImpl, apiKey, lookup, waitMs = 4500 }) {
  const document = createDocumentReader({fetchImpl,lookup});
  const cache = new Map();
  // A failed RPC/gateway read must not put an already repaired token back on
  // Alchemy's stale thumbnail. The contract is still checked on every call;
  // these values are only the last known good fallback for transient faults.
  const repaired = new Map();
  const jobs = new Map(), queue = [], known = new Map(), retrying = new Map();
  const generic = new Map();
  let active = 0;
  const enqueue = (key, work) => {
    if (jobs.has(key)) return jobs.get(key);
    if (queue.length >= 2000) return Promise.resolve();
    let resolve; const promise = new Promise(done => { resolve = done; });
    jobs.set(key,promise); queue.push({key,work,resolve});
    drain(); return promise;
  };
  const drain = () => {
    while (active < 6 && queue.length) {
      const job = queue.shift(); active++;
      Promise.resolve().then(job.work).catch(() => {}).finally(() => {
        active--; jobs.delete(job.key); job.resolve(); drain();
      });
    }
  };
  const tokenKey = (network, nft) => `${network}:${String(nft.contract.address).toLowerCase()}:${String(nft.tokenId)}`;
  const apply = (nft, value) => {
    nft.image = { originalUrl: value.image };
    nft.imageSources = value.imageSources;
    if (value.name !== null) nft.name = value.name;
    if (value.description !== null) nft.description = value.description;
    nft.raw = { ...nft.raw, metadata: value.metadata };
    nft.tokenUri = value.tokenUri;
  };
  const repair = async (network, nfts) => {
    for (const nft of nfts) {
      if (!/^0x[0-9a-f]{40}$/i.test(nft.contract?.address || '')) continue;
      const key = tokenKey(network, nft), hit = repaired.get(key);
      if (known.size >= 2000 && !known.has(key)) known.delete(known.keys().next().value);
      known.set(key,{network,nft:{...nft,contract:{...nft.contract}}});
      if (hit && hit.until > Date.now()) apply(nft, hit.value);
      else if (hit) repaired.delete(key);
    }
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
        const url = /^data:application\/json/i.test(current) ? current : urls(current)[0];
        // Custom HTTPS documents use DNS-pinned, bounded fetching.
        if (!url) continue;
        pending.push({nft,url});
      } catch {}
    }
    const tasks = pending.map(({nft,url}) => {
      const key = tokenKey(network,nft);
      nft.artRepairPending = true;
      return enqueue(key,async () => {
        const hit = cache.get(url);
        let metadata = hit && hit.until > Date.now() ? hit.metadata : null;
        if (!metadata) {
          try {
            metadata = await document(url);
            if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return;
            if (cache.size >= 1000) cache.delete(cache.keys().next().value);
            cache.set(url,{metadata,until:Date.now()+10*60*1000});
          } catch { return; }
        }
        const candidates = metadataSources(metadata,url);
        const image = candidates[0];
        if (typeof image !== 'string' || (!gateways(image) && !/^https:\/\/[^\s]+$/i.test(image) && !/^data:image\//i.test(image))) return;
        const previous = metadataSources(nft.raw?.metadata,nft.tokenUri || nft.raw?.tokenUri)[0];
        const previousUri = nft.tokenUri || nft.raw?.tokenUri;
        // Preserve useful provider previews when contract metadata agrees.
        // Failed artwork and explicit retries bypass this check.
        if (!nft.forceRepair && previous === image && (urls(previousUri)[0] || previousUri) === url &&
            (!metadata.name || metadata.name === nft.name) && (nft.image?.cachedUrl || nft.image?.thumbnailUrl)) return;
        const value = { image: gateways(image) || image, imageSources:candidates,
          name: typeof metadata.name === 'string' ? metadata.name : null,
          description: typeof metadata.description === 'string' ? metadata.description : null,
          metadata, tokenUri: url };
        apply(nft, value); // discard stale thumbnails too
        if (repaired.size >= 1000) repaired.delete(repaired.keys().next().value);
        repaired.set(tokenKey(network, nft), { value, until: Date.now() + 60*60*1000 });
      }).then(() => {
        nft.artRepairPending = false;
        const hit = repaired.get(key);
        if (hit) apply(nft,hit.value);
      });
    });
    // Ownership pages must not wait for every slow metadata document. Deferred
    // jobs stay coalesced and available to the token-only artwork endpoint.
    let timer;
    await Promise.race([Promise.all(tasks),new Promise(resolve => { timer = setTimeout(resolve,waitMs); })]);
    clearTimeout(timer);
  };
  repair.artwork = (network,contract,tokenId) => {
    const key = `${network}:${contract.toLowerCase()}:${tokenId}`;
    const hit = repaired.get(key);
    return {pending:jobs.has(key) || !!retrying.get(key)?.pending,artwork:hit && hit.until > Date.now() ? {
      image:hit.value.image, imageSources:hit.value.imageSources, thumbnailUrl:'', metadataUri:hit.value.tokenUri,
      name:hit.value.name, metadata:{traits:hit.value.metadata.attributes || [],description:hit.value.description || ''}
    } : null};
  };
  repair.retry = (network,contract,tokenId) => {
    const key = `${network}:${contract.toLowerCase()}:${tokenId}`;
    const queued = queue.findIndex(job => job.key === key);
    if (queued >= 0) queue.unshift(queue.splice(queued,1)[0]);
    const record = known.get(key), previous = retrying.get(key);
    if (!record || previous && Date.now()-previous.at < 30000) return;
    const hit = repaired.get(key); if (hit) cache.delete(hit.value.tokenUri);
    cache.delete(urls(record.nft.tokenUri || record.nft.raw?.tokenUri)[0]);
    record.nft.forceRepair = true;
    const state = {at:Date.now(),pending:true}; retrying.set(key,state);
    repair(network,[record.nft]).finally(async () => {
      await jobs.get(key); state.pending=false;
    }).catch(() => { state.pending=false; });
    if (retrying.size > 2000) retrying.delete(retrying.keys().next().value);
  };
  const repairAsset = record => enqueue(record.key,async () => {
    try {
      const metadata = await document(record.uri), candidates = metadataSources(metadata,record.uri);
      if (!candidates.length) return;
      record.artwork = {image:candidates[0],imageSources:candidates,thumbnailUrl:'',metadataUri:record.uri,
        name:typeof metadata.name === 'string' ? metadata.name : record.asset.name,
        metadata:{traits:metadata.attributes || [],description:typeof metadata.description === 'string' ? metadata.description : ''}};
      Object.assign(record.asset,record.artwork);
    } catch {} finally { record.asset.artRepairPending = false; }
  });
  repair.enrich = (chain,assets) => {
    for (const asset of assets) {
      if (!asset.metadataUri) continue;
      const key = `${chain}:${asset.id}`;
      let record = generic.get(key);
      if (record && (record.uri !== asset.metadataUri || Date.now()-record.at > 10*60*1000)) { generic.delete(key); record=null; }
      if (record?.artwork) Object.assign(asset,record.artwork);
      if (!urls(asset.metadataUri).length) continue;
      if (!record) {
        record = {key:key+'::'+asset.metadataUri,asset,uri:asset.metadataUri,at:Date.now()};
        if (generic.size >= 2000) generic.delete(generic.keys().next().value);
        generic.set(key,record);
      }
      if (!urls(asset.image).length && (!record.attempted || Date.now()-record.attempted > 30000)) {
        record.attempted=Date.now(); asset.artRepairPending=true; repairAsset(record);
      } else asset.artRepairPending = jobs.has(record.key);
    }
  };
  repair.assetArtwork = (chain,id,retry=false) => {
    const key = `${chain}:${id}`, record = generic.get(key);
    if (retry && record && Date.now()-record.at > 30000) { record.at=Date.now(); repairAsset(record); }
    return {pending:record ? jobs.has(record.key) : false,artwork:record?.artwork || null};
  };
  return repair;
}
module.exports = { createMetadataRepair, gateways };
