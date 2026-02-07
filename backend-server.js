require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const path = require('path');

const app = express();
// FIX: Bind to process.env.PORT for Render, default to 10000
const PORT = process.env.PORT || 10000; 

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const API_KEYS = {
  alchemy: process.env.ALCHEMY_KEY,
  blockfrost: process.env.BLOCKFROST_KEY,
  helius: process.env.HELIUS_KEY || "95f83906-d8dc-4e2e-a408-d5e6930d8cea", // Your provided key
  unstoppable: process.env.UNSTOPPABLE_KEY
};

// --- 1. Unstoppable Domains Resolution (EXISTING) ---
app.get('/api/resolve/unstoppable/:domain', async (req, res) => {
  const { domain } = req.params;
  try {
    const response = await fetch(`https://api.unstoppabledomains.com/resolve/domains/${domain}`, {
      headers: { 
        'Authorization': `Bearer ${API_KEYS.unstoppable}`,
        'Accept': 'application/json'
      }
    });
    
    if (!response.ok) return res.status(404).json({ error: 'Domain not found.' });
    
    const data = await response.json();
    const address = data.records?.['crypto.ETH.address'] || data.meta?.owner;
    
    if (address) res.json({ address });
    else res.status(404).json({ error: 'No EVM address linked.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- 2. EVM NFT Helper (EXISTING) ---
const fetchAlchemyNFTs = async (network, address, chainId) => {
  try {
    const res = await fetch(`https://${network}.g.alchemy.com/nft/v3/${API_KEYS.alchemy}/getNFTsForOwner?owner=${address}&withMetadata=true`);
    const data = await res.json();
    return (data.ownedNfts || []).map(nft => ({
      id: `${chainId}-${nft.contract.address}-${nft.tokenId}`,
      name: nft.name || nft.title || 'Unnamed NFT',
      image: nft.image?.cachedUrl || nft.image?.thumbnailUrl || nft.image?.originalUrl || '',
      collection: nft.contract.name || 'Collection',
      chain: chainId,
      isToken: false, 
      metadata: { traits: nft.raw?.metadata?.attributes || [], description: nft.description || '' }
    }));
  } catch (e) { return []; }
};

// --- 3. EVM Token Helper (NEW FOR TOKEN MODE) ---
const fetchAlchemyTokens = async (network, address, chainId) => {
  try {
    const res = await fetch(`https://${network}.g.alchemy.com/v2/${API_KEYS.alchemy}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: "2.0",
        method: "alchemy_getTokenBalances",
        params: [address]
      })
    });
    const data = await res.json();
    const balances = data.result?.tokenBalances || [];

    // Filter zero balances
    const nonZero = balances.filter(t => {
      const raw = parseInt(t.tokenBalance, 16);
      return !isNaN(raw) && raw > 0;
    });

    const tasks = nonZero.map(async (token) => {
      try {
        const metaRes = await fetch(`https://${network}.g.alchemy.com/v2/${API_KEYS.alchemy}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: "2.0",
            method: "alchemy_getTokenMetadata",
            params: [token.contractAddress]
          })
        });
        const meta = await metaRes.json();
        const metadata = meta.result;
        
        const rawBalance = parseInt(token.tokenBalance, 16);
        const decimals = metadata.decimals || 18;
        const balance = rawBalance / Math.pow(10, decimals);

        if (balance < 0.000001) return null; // Dust filter

        return {
          id: token.contractAddress,
          name: metadata.name || 'Unknown Token',
          symbol: metadata.symbol || '???',
          balance: balance.toLocaleString(undefined, { maximumFractionDigits: 4 }),
          image: metadata.logo || `https://via.placeholder.com/400/334155/ffffff?text=${metadata.symbol || '$'}`,
          chain: chainId,
          isToken: true 
        };
      } catch (e) { return null; }
    });

    const results = await Promise.all(tasks);
    return results.filter(t => t !== null);
  } catch (e) { return []; }
};

// --- 4. EVM Routes (NFTs & Tokens) ---
const evmChains = [
  { id: 'ethereum', net: 'eth-mainnet' },
  { id: 'abstract', net: 'abstract-mainnet' },
  { id: 'monad', net: 'monad-testnet' },
  { id: 'base', net: 'base-mainnet' },
  { id: 'polygon', net: 'polygon-mainnet' }
];

evmChains.forEach(chain => {
  // Original NFT Route
  app.get(`/api/nfts/${chain.id}/:address`, (req, res) => fetchAlchemyNFTs(chain.net, req.params.address, chain.id).then(n => res.json({ nfts: n })));
  // New Token Route
  app.get(`/api/tokens/${chain.id}/:address`, (req, res) => fetchAlchemyTokens(chain.net, req.params.address, chain.id).then(t => res.json({ nfts: t })));
});

// --- 5. Solana Routes (Helius DAS) ---

// Original NFT Route
app.get('/api/nfts/solana/:address', async (req, res) => {
  try {
    const response = await fetch(`https://mainnet.helius-rpc.com/?api-key=${API_KEYS.helius}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 'sol-nft',
        method: 'getAssetsByOwner',
        params: { 
          ownerAddress: req.params.address, 
          page: 1, 
          limit: 100, 
          displayOptions: { showCollectionMetadata: true } 
        }
      })
    });
    const data = await response.json();
    const items = data.result?.items || [];
    // Filter OUT fungible tokens to show only NFTs
    const nfts = items.filter(i => i.interface !== 'FungibleToken' && i.interface !== 'FungibleAsset').map(asset => ({
      id: asset.id,
      name: asset.content?.metadata?.name || 'Solana NFT',
      chain: 'solana',
      image: asset.content?.links?.image || '',
      collection: asset.grouping?.[0]?.collection_metadata?.name || 'Solana',
      isToken: false,
      metadata: { traits: asset.content?.metadata?.attributes || [], description: asset.content?.metadata?.description || '' }
    }));
    res.json({ nfts });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// New Token Route
app.get('/api/tokens/solana/:address', async (req, res) => {
  try {
    const response = await fetch(`https://mainnet.helius-rpc.com/?api-key=${API_KEYS.helius}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 'sol-token',
        method: 'getAssetsByOwner',
        params: { 
          ownerAddress: req.params.address, 
          page: 1, 
          limit: 100, 
          displayOptions: { showFungible: true, showNativeBalance: true } 
        }
      })
    });
    const data = await response.json();
    const items = data.result?.items || [];
    
    // Filter FOR fungible tokens
    const tokens = items.filter(i => i.interface === 'FungibleToken' || i.interface === 'FungibleAsset').map(t => ({
      id: t.id,
      name: t.content?.metadata?.name || 'Solana Token',
      symbol: t.content?.metadata?.symbol || 'SOL',
      balance: (t.token_info?.balance / Math.pow(10, t.token_info?.decimals || 0)).toFixed(4),
      image: t.content?.links?.image || 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png',
      chain: 'solana',
      isToken: true
    }));
    res.json({ nfts: tokens.filter(t => parseFloat(t.balance) > 0) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// --- 6. Cardano Routes (Blockfrost) ---

// Helper to resolve address/handle to stake address
const getCardanoAssets = async (address) => {
  let target = address;
  if (target.startsWith('$')) {
    const hRes = await fetch(`https://api.handle.me/handles/${target.replace('$', '').toLowerCase()}`);
    if (hRes.ok) {
      const hData = await hRes.json();
      if (hData.resolved_addresses?.ada) target = hData.resolved_addresses.ada;
    }
  }
  const addrRes = await fetch(`https://cardano-mainnet.blockfrost.io/api/v0/addresses/${target}`, { headers: { project_id: API_KEYS.blockfrost } });
  const addrData = await addrRes.json();
  const stakeAddr = addrData.stake_address;
  if (!stakeAddr) return [];

  const assetsRes = await fetch(`https://cardano-mainnet.blockfrost.io/api/v0/accounts/${stakeAddr}/addresses/assets`, { headers: { project_id: API_KEYS.blockfrost } });
  return await assetsRes.json();
};

// Original NFT Route
app.get('/api/nfts/cardano/:address', async (req, res) => {
  try {
    const assets = await getCardanoAssets(req.params.address);
    // Filter: Quantity MUST be 1 for NFTs
    const tasks = assets.filter(a => parseInt(a.quantity) === 1).slice(0, 50).map(async (asset) => {
      try {
        const metaRes = await fetch(`https://cardano-mainnet.blockfrost.io/api/v0/assets/${asset.unit}`, { headers: { project_id: API_KEYS.blockfrost } });
        const meta = await metaRes.json();
        let img = meta.onchain_metadata?.image || '';
        if (Array.isArray(img)) img = img.join('');
        const imageUrl = img ? (img.startsWith('ipfs://') ? `https://ipfs.io/ipfs/${img.replace('ipfs://', '')}` : (img.startsWith('http') ? img : `https://ipfs.io/ipfs/${img}`)) : '';
        return {
          id: asset.unit,
          name: meta.onchain_metadata?.name || meta.asset_name || 'Cardano NFT',
          chain: 'cardano',
          image: imageUrl || 'https://via.placeholder.com/400/06b6d4/ffffff?text=ADA+NFT',
          collection: meta.onchain_metadata?.collection || 'Cardano',
          isToken: false,
          metadata: { traits: meta.onchain_metadata?.attributes || [], description: meta.onchain_metadata?.description || '' }
        };
      } catch (e) { return null; }
    });
    const results = await Promise.all(tasks);
    res.json({ nfts: results.filter(n => n !== null) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// New Token Route
app.get('/api/tokens/cardano/:address', async (req, res) => {
  try {
    const assets = await getCardanoAssets(req.params.address);
    // Filter: Quantity > 1 for Tokens
    const tasks = assets.filter(a => parseInt(a.quantity) > 1).slice(0, 50).map(async (asset) => {
      try {
        const metaRes = await fetch(`https://cardano-mainnet.blockfrost.io/api/v0/assets/${asset.unit}`, { headers: { project_id: API_KEYS.blockfrost } });
        const meta = await metaRes.json();
        return {
          id: asset.unit,
          name: meta.onchain_metadata?.name || meta.asset_name || 'Cardano Token',
          chain: 'cardano',
          image: 'https://via.placeholder.com/400/0033AD/ffffff?text=ADA',
          balance: (parseInt(asset.quantity) / Math.pow(10, meta.metadata?.decimals || 0)).toFixed(2),
          symbol: meta.metadata?.ticker || 'ADA',
          isToken: true
        };
      } catch (e) { return null; }
    });
    const results = await Promise.all(tasks);
    res.json({ nfts: results.filter(n => n !== null) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

// FIX: Bind to 0.0.0.0
app.listen(PORT, '0.0.0.0', () => console.log(`🚀 Server running on port ${PORT}`));