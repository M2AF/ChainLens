const { Interface } = require('ethers');
const { CHAIN_MAP, DEFAULT_CHAINS } = require('./public/chain-catalog');
const { explorerUrl, isIdentity } = require('./public/search-entities');
const { RPCS } = require('./search-transaction-service');
const KNOWN_COLLECTIONS = [
  { chain: 'ethereum', address: '0x364C828eE171616a39897688A831c2499aD972ec', name: 'Sappy Seals' },
  { chain: 'monad', address: '0xaEAA920165fD7ce58a0E0772Ffc97F06626572cD', name: 'Sealuminati' },
  { chain: 'monad', address: '0x200723A706de0013316E5cd8EBa2b3f53DD90c29', name: 'r3tards' },
  { chain: 'cardano', address: '901ba6e9831b078e131a1cc403d6139af21bda255cea6c9f770f4834', name: 'Mallard Order' },
];
const fail = (statusCode, message) => Object.assign(new Error(message), { statusCode });
const clean = v => typeof v === 'string' ? v.slice(0, 160) : '';
const abi = new Interface(['function name() view returns (string)', 'function symbol() view returns (string)', 'function decimals() view returns (uint8)', 'function supportsInterface(bytes4) view returns (bool)']);
function createAssetSearch({ fetchImpl = globalThis.fetch, tokenSearch, alchemyKey = '', heliusKey = '' } = {}) {
  const known = new Map(KNOWN_COLLECTIONS.map(c => [`${c.chain}:${c.address.toLowerCase()}`, c]));
  const cache = new Map();
  const nativeAsset = chain => ({kind:'token',chain,key:`${chain}:native`,address:null,name:CHAIN_MAP[chain].label,symbol:CHAIN_MAP[chain].native,isNative:true,source:'ChainLens network catalog'});
  async function json(url, options = {}) {
    const res = await fetchImpl(url, { ...options, signal: AbortSignal.timeout(7000) });
    if (res.status === 404) throw fail(404, 'No asset was found for this identity on this network.');
    if (!res.ok) throw fail(503, 'Asset metadata is temporarily unavailable.');
    return res.json();
  }
  async function rpc(url, method, params) {
    const row = await json(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) });
    if (row.error || !Object.hasOwn(row, 'result')) throw fail(503, 'Asset metadata is temporarily unavailable.');
    return row.result;
  }
  const item = (chain, kind, address, name, source, extra = {}) => ({ kind, chain, address, name: clean(name) || 'Unnamed asset', source, key: `${chain}:${chain === 'solana' ? address : address.toLowerCase()}`, explorerUrl: explorerUrl(chain, kind, address), ...extra });
  async function exact({ chain, kind, query }) {
    if (chain === 'cardano') {
      if (query.length > 56) {
        const rows = await json('https://api.koios.rest/api/v1/asset_info', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ _asset_list: [[query.slice(0, 56).toLowerCase(), query.slice(56).toLowerCase()]] }) });
        const asset = Array.isArray(rows) && rows.find(r => r.policy_id + r.asset_name === query.toLowerCase());
        if (!asset) throw fail(404, 'No asset was found for this Cardano unit.');
        return item(chain, 'token', query.toLowerCase(), asset.token_registry_metadata?.name || asset.asset_name_ascii, 'Koios', { symbol: clean(asset.token_registry_metadata?.ticker), decimals: asset.token_registry_metadata?.decimals ?? null });
      }
      const policy = query.toLowerCase();
      const rows = await json(`https://api.koios.rest/api/v1/policy_asset_list?_asset_policy=${policy}&limit=5`);
      if (!Array.isArray(rows)) throw fail(503, 'Asset metadata is temporarily unavailable.');
      const valid = rows.filter(r => (r.policy_id == null || r.policy_id === policy) && typeof r.asset_name === 'string' && /^[a-f0-9]{0,64}$/i.test(r.asset_name));
      if (!valid.length) throw fail(404, 'No assets were found under this Cardano policy.');
      const name = known.get(`cardano:${policy}`)?.name || 'Cardano asset policy';
      return item(chain, 'policy', policy, name, 'Koios', { sampleAssets: valid.slice(0, 5).map(r => ({ name: clean(r.asset_name_ascii) || Buffer.from(r.asset_name, 'hex').toString('utf8'), assetNameHex: r.asset_name, fingerprint: clean(r.fingerprint) })), sampleOnly: true });
    }
    if (chain === 'solana' && kind === 'collection') {
      if (!heliusKey) throw fail(503, 'Solana NFT metadata is not configured.');
      const asset = await rpc(`https://mainnet.helius-rpc.com/?api-key=${encodeURIComponent(heliusKey)}`, 'getAsset', { id: query });
      if (!asset || asset.id !== query || ['FungibleToken', 'FungibleAsset'].includes(asset.interface)) throw fail(404, 'No NFT was found for this mint.');
      return item(chain, 'nft', query, asset.content?.metadata?.name, 'Helius DAS', { collectionAddress: asset.grouping?.find(g => g.group_key === 'collection')?.group_value || null });
    }
    if (kind === 'token' && tokenSearch) {
      const found = await tokenSearch({ chain, address: query, q: '', limit: '10' });
      const token = found.tokens?.find(t => (chain === 'solana' ? t.address === query : t.address?.toLowerCase() === query.toLowerCase()));
      if (token) return item(chain, 'token', token.address, token.name || token.symbol, 'Token discovery', { symbol: clean(token.symbol), decimals: token.decimals });
    }
    if (CHAIN_MAP[chain].family !== 'evm' || !RPCS[chain]) throw fail(404, 'No token metadata was found for this identity.');
    const read = async (method, args = []) => abi.decodeFunctionResult(method, await rpc(RPCS[chain], 'eth_call', [{ to: query, data: abi.encodeFunctionData(method, args) }, 'latest']))[0];
    if (kind === 'collection') {
      if (alchemyKey && CHAIN_MAP[chain].alchemyNetwork) {
        try {
          const meta = await json(`https://${CHAIN_MAP[chain].alchemyNetwork}.g.alchemy.com/nft/v3/${encodeURIComponent(alchemyKey)}/getContractMetadata?contractAddress=${query}`);
          if (meta.address?.toLowerCase() === query.toLowerCase() && ['ERC721', 'ERC1155'].includes(meta.tokenType)) return item(chain, 'collection', query, meta.name || meta.openseaMetadata?.collectionName, 'Alchemy NFT metadata', { standard: meta.tokenType });
        } catch { /* Read-only public RPC remains available when metadata API fails. */ }
      }
      const checks = await Promise.allSettled([read('supportsInterface', ['0x80ac58cd']), read('supportsInterface', ['0xd9b67a26'])]);
      const standard = checks[0].status === 'fulfilled' && checks[0].value === true ? 'ERC721' : checks[1].status === 'fulfilled' && checks[1].value === true ? 'ERC1155' : null;
      if (!standard) throw fail(checks.every(r => r.status === 'rejected') ? 503 : 404, 'No supported NFT contract was found on this network.');
      let name; try { name = await read('name'); } catch { name = known.get(`${chain}:${query.toLowerCase()}`)?.name || 'NFT contract'; }
      return item(chain, 'collection', query, name, 'Public RPC', { standard });
    }
    const [name, symbol, decimals] = await Promise.all([read('name'), read('symbol'), read('decimals')]);
    return item(chain, 'token', query, name, 'Public RPC', { symbol: clean(symbol), decimals: Number(decimals) });
  }
  async function search({ kind, q, chain = '' }) {
    if (!['token', 'collection'].includes(kind) || typeof q !== 'string' || !q.trim() || q.length > 128 || typeof chain !== 'string' || (chain && !Object.hasOwn(CHAIN_MAP, chain))) throw fail(400, 'Enter an asset name or identity and supported network.');
    const query = q.trim(), identity = /^0x[a-f0-9]{40}$/i.test(query) || (chain === 'cardano' && isIdentity(chain, query)) || /^[a-f0-9]{56}$/i.test(query) || /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(query);
    if (kind === 'token' && chain && (query.toLowerCase() === CHAIN_MAP[chain].native.toLowerCase() || query.toLowerCase() === CHAIN_MAP[chain].label.toLowerCase() || (CHAIN_MAP[chain].family === 'evm' && /^0x0{40}$/i.test(query)))) return {assets:[nativeAsset(chain)],partial:false};
    if (identity && (!chain || !isIdentity(chain, query))) throw fail(400, 'Choose the network for this contract, mint or policy ID.');
    if (!identity && query.length < 2) throw fail(400, 'Type at least two characters.');
    const key = `${kind}:${chain}:${chain === 'solana' ? query : query.toLowerCase()}`;
    const hit = cache.get(key); if (hit && hit.expires > Date.now()) return hit.value;
    let result;
    try {
      if (identity) {
        const asset = await exact({ kind, chain, query });
        if (asset.kind === 'collection') { if (known.size >= 256) known.delete(known.keys().next().value); known.set(asset.key, asset); }
        result = { assets: [asset], partial: false };
      } else if (kind === 'collection') {
        result = { assets: [...known.values()].filter(c => (!chain || c.chain === chain) && c.name.toLowerCase().includes(query.toLowerCase())).slice(0, 20).map(c => item(c.chain, c.chain === 'cardano' ? 'policy' : 'collection', c.address, c.name, 'ChainLens collection index')), partial: false, coverage: 'Searches ChainLens indexed collections. Use a contract, mint or policy ID for other collections.' };
      } else if (chain === 'cardano') {
        const needle = Buffer.from(query, 'utf8').toString('hex');
        const rows = await json(`https://api.koios.rest/api/v1/asset_list?asset_name=ilike.*${needle}*&limit=20`);
        if (!Array.isArray(rows)) throw fail(503, 'Cardano asset search is temporarily unavailable.');
        result = { assets: rows.filter(r => /^[a-f0-9]{56}$/i.test(r.policy_id || '') && /^[a-f0-9]{0,64}$/i.test(r.asset_name || '')).slice(0, 20).map(r => item('cardano', 'token', r.policy_id + r.asset_name, r.asset_name_ascii || Buffer.from(r.asset_name, 'hex').toString('utf8'), 'Koios asset-name index')), partial: rows.length >= 20, coverage: 'Matches on-chain asset names; a ticker may differ from its asset name.' };
      } else {
        const natives = DEFAULT_CHAINS.filter(c => (!chain || c.id === chain) && (c.native.toLowerCase() === query.toLowerCase() || c.label.toLowerCase() === query.toLowerCase())).map(c=>nativeAsset(c.id));
        let out;
        try {
          if (!tokenSearch) throw new Error('Discovery not configured');
          out = await tokenSearch({ chain: chain || 'all', q: query, limit: '20' });
        } catch {
          if (!natives.length) throw fail(503, 'Token discovery is temporarily unavailable.');
          out = {tokens:[],partial:true};
        }
        if (out.error && !out.tokens?.length && !natives.length) throw fail(503, 'Token discovery is temporarily unavailable.');
        const discovered = (out.tokens || []).slice(0,20).map(t => t.isNative && CHAIN_MAP[t.chain]?.family === 'evm' ? nativeAsset(t.chain) : item(t.chain, 'token', t.address, t.name || t.symbol, 'Token discovery', { symbol: clean(t.symbol), decimals: t.decimals }));
        result = { assets: [...new Map([...natives,...discovered].map(a=>[a.key,a])).values()].slice(0,20), partial: !!out.partial || !!out.error };
      }
      if (cache.size >= 256) cache.delete(cache.keys().next().value);
      cache.set(key, { value: result, expires: Date.now() + 60000 });
      return result;
    } catch (error) { throw error.statusCode ? error : fail(503, 'Asset metadata is temporarily unavailable. Try again.'); }
  }
  return { search };
}
module.exports = { createAssetSearch };
