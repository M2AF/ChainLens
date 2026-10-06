const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createAlchemyNFTPage } = require('../nft-source-page');
test('NFT pages carry an opaque cursor, stable identity, collection and separate preview/art URLs', async () => {
  const calls = [];
  const read = createAlchemyNFTPage({ apiKey:'fixture', fetchImpl: async url => {
    calls.push(new URL(url));
    return {ok:true,json:async()=>({pageKey:'next+/=',ownedNfts:[{contract:{address:'0xabc',name:'Dreamers'},tokenId:'7',name:'Dreamer',image:{cachedUrl:'https://art.example/full',thumbnailUrl:'https://art.example/preview'}}]})};
  }});
  const first = await read('base-mainnet','0xowner','base');
  await read('base-mainnet','0xowner','base',first.nextPageKey);
  assert.equal(calls[1].searchParams.get('pageKey'),'next+/=');
  assert.equal(first.nfts[0].contractAddress,'0xabc');
  assert.equal(first.nfts[0].tokenId,'7');
  assert.equal(first.nfts[0].collectionName,'Dreamers');
  assert.equal(first.nfts[0].image,'https://art.example/full');
  assert.equal(first.nfts[0].thumbnailUrl,'https://art.example/preview');
});
test('provider failure remains an error, never a successful empty portfolio', async () => {
  const read = createAlchemyNFTPage({apiKey:'fixture', fetchImpl:async()=>({ok:false,status:429})});
  await assert.rejects(read('base-mainnet','0xowner','base'),/429/);
});
