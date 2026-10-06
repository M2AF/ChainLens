'use strict';
// Each browser worker follows provider cursors without holding a giant response
// open on the backend. Scanner consumers can continue to use just `nfts`.
function createAlchemyNFTPage({ fetchImpl, apiKey }) {
  return async (network, address, chain, pageKey = '') => {
    const url = new URL(`https://${network}.g.alchemy.com/nft/v3/${apiKey}/getNFTsForOwner`);
    url.searchParams.set('owner', address);
    url.searchParams.set('withMetadata', 'true');
    if (pageKey) url.searchParams.set('pageKey', pageKey);
    const response = await fetchImpl(url.toString(), { signal: AbortSignal.timeout(20000) });
    if (!response.ok) throw new Error(`NFT provider HTTP ${response.status}`);
    const data = await response.json();
    return {
      nextPageKey: data.pageKey || null,
      nfts: (data.ownedNfts || []).map(nft => ({
        id: `${chain}-${nft.contract.address}-${nft.tokenId}`,
        name: nft.name || nft.title || 'Unnamed NFT',
        image: nft.image?.cachedUrl || nft.image?.originalUrl || nft.image?.thumbnailUrl || '',
        thumbnailUrl: nft.image?.thumbnailUrl || '',
        collection: nft.contract.name || 'Collection',
        collectionName: nft.contract.name || 'Collection',
        contractAddress: nft.contract.address,
        tokenId: nft.tokenId,
        category: nft.raw?.metadata?.category || null,
        chain, isToken: false,
        metadata: { traits: nft.raw?.metadata?.attributes || nft.raw?.metadata?.traits || [], description: nft.description || '' },
      })),
    };
  };
}
module.exports = { createAlchemyNFTPage };
