const { test } = require('node:test');
const assert = require('node:assert/strict');
const { traits } = require('../public/nft-metadata');
test('NFT traits normalize provider arrays, Cardano dictionaries and serialized JSON', () => {
  assert.deepEqual(traits({ category: 'PFP', Level: 7 }), [{trait_type:'category',value:'PFP'}, {trait_type:'Level',value:'7'}]);
  assert.deepEqual(traits([{trait_type:'type',value:'art'}]), [{trait_type:'type',value:'art'}]);
  assert.deepEqual(traits('[{"trait_type":"type","value":"art"}]'), [{trait_type:'type',value:'art'}]);
});
test('missing/scalar/malformed traits never reach category lookup or React as invalid children', () => {
  for (const value of [undefined, null, 'bad json', 42, true]) assert.deepEqual(traits(value), []);
  assert.deepEqual(traits([null, 'bad', 42, {}, {trait_type:null,value:'art'}, {trait_type:'nested',value:{bad:'child'}}, {trait_type:'valid',value:false}]), [{trait_type:'valid',value:'false'}]);
});
