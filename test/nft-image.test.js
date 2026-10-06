const { test } = require('node:test');
const assert = require('node:assert/strict');
const image=require('../public/nft-image');
test('image sources retain previews and distinct token originals with path gateway alternatives',()=>{
  const asset={thumbnailUrl:'https://cdn.example/thumb',image:'https://cdn.example/full',imageSources:['ar://art/2.png','ipfs://ipfs/QmCaseSensitive/2.png','https://cdn.example/full']};
  assert.equal(image.sources(asset)[0],asset.thumbnailUrl);
  assert.equal(image.sources(asset,false)[0],asset.image);
  assert.deepEqual(image.urls('https://bafy.ipfs.dead.example/2.png'),['https://ipfs.io/ipfs/bafy/2.png','https://dweb.link/ipfs/bafy/2.png']);
  assert.ok(image.sources(asset).includes('https://ipfs.io/ipfs/QmCaseSensitive/2.png'));
  assert.deepEqual(image.urls('javascript:alert(1)'),[]);
});
