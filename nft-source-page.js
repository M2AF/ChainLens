'use strict';
// Each browser worker follows provider cursors without holding a giant response
// open on the backend. Scanner consumers can continue to use just `nfts`.
const { amount } = require('./public/nft-floor');
const LEGACY_ETH_NETWORKS = new Set(['eth-mainnet','arb-mainnet','opt-mainnet','base-mainnet','blast-mainnet','abstract-mainnet','robinhood-mainnet','soneium-mainnet','zora-mainnet']);
function createAlchemyNFTPage({ fetchImpl, apiKey, getNativePrice = async () => 0, repairMetadata }) {
  // Share a quote across concurrently loaded chains/pages; failed quotes remain
  // unknown rather than making valuable collections look like zero-price NFTs.
  const quotes = new Map();
  const quote = symbol => {
    const previous = quotes.get(symbol);
    if (previous && Date.now() - previous.at < 90000) return previous.promise;
    let timer;
    const promise = Promise.race([
      Promise.resolve().then(() => getNativePrice(symbol)).catch(() => null),
      new Promise(resolve => { timer = setTimeout(() => resolve(null), 5000); }),
    ]).finally(() => clearTimeout(timer));
    quotes.set(symbol, { at: Date.now(), promise });
    return promise;
  };
  return async (network, address, chain, pageKey = '') => {
    const url = new URL(`https://${network}.g.alchemy.com/nft/v3/${apiKey}/getNFTsForOwner`);
    url.searchParams.set('owner', address);
    url.searchParams.set('withMetadata', 'true');
    if (pageKey) url.searchParams.set('pageKey', pageKey);
    const response = await fetchImpl(url.toString(), { signal: AbortSignal.timeout(20000) });
    if (!response.ok) throw new Error(`NFT provider HTTP ${response.status}`);
    const data = await response.json();
    const floorTask = Promise.all((data.ownedNfts || []).map(async nft => {
      const explicit = nft.collection?.floorPrice;
      const explicitAmount = amount(explicit?.floorPrice);
      // Legacy OpenSea metadata omits currency. Its ETH documentation does not
      // hold on newer non-ETH networks (confirmed against Monad). Leave those
      // values unpriced unless the provider supplies an explicit currency.
      const value = explicitAmount ?? amount(nft.contract?.openSeaMetadata?.floorPrice);
      const currency = explicitAmount !== null ? explicit.priceCurrency : LEGACY_ETH_NETWORKS.has(network) ? 'ETH' : null;
      const symbol = typeof currency === 'string' ? currency.toUpperCase() : '';
      if (value === null || !symbol) return { floorPrice: value, floorPriceCurrency: symbol || null, floorPriceUsd: null };
      const rate = amount(await quote(symbol === 'WETH' ? 'ETH' : symbol));
      const converted = rate !== null && rate > 0 ? amount(value * rate) : null;
      return { floorPrice: value, floorPriceCurrency: symbol, floorPriceUsd: converted };
    }));
    const [floors] = await Promise.all([floorTask, repairMetadata ? repairMetadata(network, data.ownedNfts || []).catch(() => {}) : null]);
    return {
      nextPageKey: data.pageKey || null,
      nfts: (data.ownedNfts || []).map((nft, index) => ({
        ...floors[index],
        id: `${chain}-${nft.contract.address}-${nft.tokenId}`,
        name: nft.name || nft.title || 'Unnamed NFT',
        image: nft.image?.cachedUrl || nft.image?.originalUrl || nft.raw?.metadata?.image || nft.image?.thumbnailUrl || '',
        thumbnailUrl: nft.image?.thumbnailUrl || '',
        imageSources: [nft.image?.cachedUrl, nft.image?.pngUrl, nft.image?.originalUrl, nft.raw?.metadata?.image, nft.raw?.metadata?.image_url].filter(url => typeof url === 'string' && url),
        collection: nft.contract.name || 'Collection',
        collectionName: nft.contract.name || 'Collection',
        contractAddress: nft.contract.address,
        tokenId: nft.tokenId,
        category: nft.raw?.metadata?.category || null,
        isSpam: nft.contract?.isSpam === true || nft.contract?.isSpam === 'true',
        chain, isToken: false,
        metadata: { traits: nft.raw?.metadata?.attributes || nft.raw?.metadata?.traits || [], description: nft.description || '' },
      })),
    };
  };
}
module.exports = { createAlchemyNFTPage };
