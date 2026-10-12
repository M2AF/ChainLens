const { DEFAULT_CHAINS } = require('./public/chain-catalog');
const { cardanoMedia } = require('./cardano-media');
const { metadataSources } = require('./public/nft-image');
function favoriteIdentity(key) {
  const [chain, kind, ...parts] = String(key).split(':');
  if (kind !== 'n' || !DEFAULT_CHAINS.some(c => c.id === chain)) return null;
  const joined = parts.join(':');
  if (chain === 'cardano' && /^[0-9a-f]{56,120}$/.test(joined) && joined.length % 2 === 0) return { chain, id: joined };
  if (chain === 'solana' && /^[1-9a-z]{32,64}$/.test(joined)) return { chain, id: joined };
  if (chain === 'bitcoin' && /^[0-9a-f]{64}i\d+$/.test(joined)) return { chain, id: joined };
  if (/^0x[0-9a-f]{40}$/.test(parts[0]) && /^\d{1,78}$/.test(parts[1]) && parts.length === 2) return { chain, id: `${chain}-${parts[0]}-${parts[1]}`, contractAddress: parts[0], tokenId: parts[1] };
  return null;
}
const favoriteKeys = entries => Object.entries(entries || {}).filter(([key, e]) => key.startsWith('favorite:mainnet:') && e?.s === 'f' && favoriteIdentity(key.slice(17))).sort((a,b) => (b[1].t || 0) - (a[1].t || 0) || a[0].localeCompare(b[0])).map(([key]) => key.slice(17));
function artworkSnapshot(key, asset) {
  const identity = favoriteIdentity(key);
  if (!identity || !asset || typeof asset !== 'object') return null;
  const urls = value => typeof value === 'string' && value.length <= 4096 && /^(https:\/\/|ipfs:\/\/|ar:\/\/)/i.test(value) ? value : '';
  const id = identity.chain === 'solana' && typeof asset.id === 'string' && asset.id.toLowerCase() === identity.id && /^[1-9A-HJ-NP-Za-km-z]{32,64}$/.test(asset.id) ? asset.id : identity.id;
  return { ...identity, id, key, isToken: false, name: typeof asset.name === 'string' ? asset.name.slice(0,200) : 'Favorite NFT',
    collection: typeof asset.collection === 'string' ? asset.collection.slice(0,200) : identity.chain,
    image: urls(asset.image), imageSources: (Array.isArray(asset.imageSources) ? asset.imageSources : []).map(urls).filter(Boolean).slice(0,6) };
}
function koiosMetadata(row,unit) {
  if(!row || row.policy_id!==unit.slice(0,56) || row.asset_name!==unit.slice(56)) return null;
  const cip68=row.cip68_metadata?.['222'] || row.cip68_metadata;
  if(cip68?.image || cip68?.files) return cip68;
  const datum=decodePlutus(cip68?.fields?.[0] || cip68);
  if(datum?.image || datum?.files)return datum;
  const mint=row.minting_tx_metadata;
  const metadata=Array.isArray(mint)?mint.find(item=>String(item.key)==='721')?.json:mint?.['721'];
  const policy=metadata?.[unit.slice(0,56)] || metadata?.[Object.keys(metadata || {}).find(key=>key.toLowerCase()===unit.slice(0,56))];
  return policy?.[row.asset_name_ascii] || policy?.[row.asset_name] || null;
}
function decodePlutus(value,depth=0) {
  if(!value || depth>12)return null;
  if(typeof value.bytes==='string' && /^(?:[0-9a-f]{2})*$/i.test(value.bytes) && value.bytes.length<=65536){
    const buffer=Buffer.from(value.bytes,'hex'),text=buffer.toString('utf8');return Buffer.from(text).equals(buffer)?text:value.bytes;
  }
  if(value.int!==undefined)return value.int;
  if(Array.isArray(value.list))return value.list.slice(0,1000).map(item=>decodePlutus(item,depth+1));
  if(Array.isArray(value.map)){
    const out=Object.create(null);
    for(const pair of value.map.slice(0,1000)){const key=decodePlutus(pair.k,depth+1);if(typeof key==='string' && key.length<=200)out[key]=decodePlutus(pair.v,depth+1);}
    return out;
  }
  return null;
}
function createFavoriteResolver({ fetchImpl = fetch, apiKeys = {}, repairMetadata }) {
  const cache = new Map();
  async function get(url, options = {}) {
    const response = await fetchImpl(url, { ...options, signal: AbortSignal.any([AbortSignal.timeout(8000),options.signal].filter(Boolean)) });
    if (!response.ok) throw new Error('Artwork unavailable'); return response.json();
  }
  return async function resolve(key, wallets = [], snapshot) {
    const identity = favoriteIdentity(key), saved = artworkSnapshot(key, snapshot);
    if (saved && (saved.image || saved.imageSources.length)) return saved;
    if (!identity) return null;
    const budget=AbortSignal.timeout(15000);
    const read=(url,options={})=>get(url,{...options,signal:budget});
    const cached = cache.get(key);
    if (cached && Date.now() < cached.until) return cached.asset;
    let asset = saved || artworkSnapshot(key, { name: `${identity.chain} NFT ${identity.tokenId || identity.id.slice(0,12)}` });
    try {
      if (identity.chain === 'cardano') {
        let meta;
        try { meta=await read(`https://cardano-mainnet.blockfrost.io/api/v0/assets/${identity.id}`, { headers: { project_id: apiKeys.blockfrost } }); }
        catch {
          const rows=await read('https://api.koios.rest/api/v1/asset_info',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({_asset_list:[[identity.id.slice(0,56),identity.id.slice(56)]]})});
          const metadata=koiosMetadata(rows?.[0],identity.id);
          if(!metadata)throw new Error('Artwork unavailable');
          meta={onchain_metadata:metadata};
        }
        asset = artworkSnapshot(key, { ...cardanoMedia(meta), name: meta.onchain_metadata?.name || meta.metadata?.name || asset.name, collection: 'Cardano' });
      } else if (identity.chain === 'bitcoin') {
        asset = artworkSnapshot(key, { name: `Inscription ${identity.id.slice(0,12)}`, image: `https://ordinals.com/content/${identity.id}`, collection: 'Bitcoin Ordinals' });
      } else if (identity.chain === 'solana') {
        // Shared preference keys lowercase mints. Recover original case from
        // linked owners or the website's snapshot; never send lowercase as a mint.
        let found;
        if (saved?.id && saved.id !== saved.id.toLowerCase()) {
          const response = await read(`https://mainnet.helius-rpc.com/?api-key=${apiKeys.helius}`, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({jsonrpc:'2.0',id:1,method:'getAsset',params:{id:saved.id}}) }); found = response.result;
        }
        for (const wallet of wallets.filter(w => w.chain === 'solana')) {
          if (found) break;
          for (let page = 1; page <= 8; page++) {
            const response = await read(`https://mainnet.helius-rpc.com/?api-key=${apiKeys.helius}`, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({jsonrpc:'2.0',id:1,method:'getAssetsByOwner',params:{ownerAddress:wallet.address,page,limit:1000}}) });
            const items = response.result?.items || []; found = items.find(item => item.id?.toLowerCase() === identity.id);
            if (found || items.length < 1000) break;
          }
        }
        if (!found) throw new Error('Artwork unavailable');
        asset = artworkSnapshot(key, { id: found.id, name:found.content?.metadata?.name, image:found.content?.links?.image, imageSources:(found.content?.files || []).flatMap(f => [f.cdn_uri,f.uri]), collection: 'Solana' });
      } else {
        const network = identity.chain==='monad' ? 'monad-mainnet' : DEFAULT_CHAINS.find(c => c.id === identity.chain)?.alchemyNetwork;
        if (!network) throw new Error('Artwork unavailable');
        const url = new URL(`https://${network}.g.alchemy.com/nft/v3/${apiKeys.alchemy}/getNFTMetadata`);
        url.searchParams.set('contractAddress',identity.contractAddress); url.searchParams.set('tokenId',identity.tokenId);
        let nft;
        try { if(identity.chain==='monad')throw new Error('Use native metadata');nft=await read(url.href); }
        catch { if(!repairMetadata)throw new Error('Artwork unavailable');nft={contract:{address:identity.contractAddress},tokenId:identity.tokenId}; }
        if (repairMetadata) await repairMetadata(network,[nft]);
        asset = artworkSnapshot(key, { name:nft.name || nft.title, image:nft.image?.cachedUrl || nft.image?.originalUrl || nft.raw?.metadata?.image, imageSources:[nft.image?.cachedUrl,nft.image?.originalUrl,...metadataSources(nft.raw?.metadata)], collection:nft.contract?.name });
      }
    } catch { asset.metadataStatus = 'unavailable'; }
    if(!asset.image && !asset.imageSources.length)asset.metadataStatus='unavailable';
    cache.set(key, { asset, until:Date.now() + (asset.metadataStatus ? 15000 : 300000) });
    if (cache.size > 1000) cache.delete(cache.keys().next().value);
    return asset;
  };
}
module.exports = { favoriteIdentity, favoriteKeys, artworkSnapshot, createFavoriteResolver, koiosMetadata };
