const test=require('node:test'),assert=require('node:assert/strict');
const {favoriteKeys,favoriteIdentity,artworkSnapshot,createFavoriteResolver,koiosMetadata}=require('../public-favorites');
const key='ethereum:n:0x1111111111111111111111111111111111111111:7';
test('gallery decisions include only current mainnet stars, never tombstones or private filter data',()=>{
  assert.deepEqual(favoriteKeys({['favorite:mainnet:'+key]:{s:'f',t:2},['favorite:mainnet:'+key.replace(':7',':8')]:{s:'u',t:3},['favorite:testnet:'+key]:{s:'f',t:4},['mainnet:'+key]:{s:'s',t:5},'favorite:mainnet:ethereum:n:https://evil.example':{s:'f',t:6}}),[key]);
});
test('snapshot exposes safe artwork identity fields and rejects injected URLs and private fields',()=>{
  const asset=artworkSnapshot(key,{id:'fake',name:'Seal',image:'javascript:alert(1)',imageSources:['https://images.example/nft.png','http://127.0.0.1/private'],email:'hidden',owner:'secret',address:'secret'});
  assert.equal(asset.id,'ethereum-0x1111111111111111111111111111111111111111-7');assert.equal(asset.email,undefined);assert.equal(asset.owner,undefined);assert.equal(asset.address,undefined);assert.equal(asset.image,'');assert.deepEqual(asset.imageSources,['https://images.example/nft.png']);
  assert.equal(favoriteIdentity('ethereum:n:0x1111111111111111111111111111111111111111:../x'),null);
});
test('Alchemy resolver uses canonical identity and caches metadata without re-reading favorite decisions',async()=>{
  const calls=[];const resolve=createFavoriteResolver({apiKeys:{alchemy:'test'},fetchImpl:async url=>{calls.push(url);return{ok:true,json:async()=>({name:'Seal Seven',contract:{name:'Seals'},image:{originalUrl:'https://images.example/7.png'}})};}});
  const asset=await resolve(key);assert.equal(asset.name,'Seal Seven');assert.equal(asset.image,'https://images.example/7.png');assert.equal(new URL(calls[0]).searchParams.get('tokenId'),'7');await resolve(key);assert.equal(calls.length,1);
});
test('Solana wallet-only synced favorites recover original mint case without disclosing the owner',async()=>{
  const mint='So11111111111111111111111111111111111111112';const resolve=createFavoriteResolver({apiKeys:{helius:'test'},fetchImpl:async(url,options)=>{const body=JSON.parse(options.body);assert.equal(body.method,'getAssetsByOwner');return{ok:true,json:async()=>({result:{items:[{id:mint,content:{metadata:{name:'Solana Star'},links:{image:'https://images.example/sol.png'}}}]}})};}});
  const asset=await resolve('solana:n:'+mint.toLowerCase(),[{chain:'solana',address:'private-owner'}]);assert.equal(asset.id,mint);assert.equal(asset.name,'Solana Star');assert.doesNotMatch(JSON.stringify(asset),/private-owner/);
});
test('Cardano unit resolves through existing media parser and unavailable metadata retains an NFT card',async()=>{
  const unit='a'.repeat(56)+'000de140';const resolve=createFavoriteResolver({apiKeys:{blockfrost:'test'},fetchImpl:async()=>({ok:true,json:async()=>({onchain_metadata:{name:'Cardano Star',image:'https://images.example/cardano.png'}})})});assert.equal((await resolve('cardano:n:'+unit)).name,'Cardano Star');
  const unavailable=createFavoriteResolver({fetchImpl:async()=>{throw new Error('Provider down');}});assert.equal((await unavailable(key)).metadataStatus,'unavailable');
});
test('Koios CIP-68 datum and CIP-25 mint metadata are matched to the exact policy and asset',()=>{
  const policy='a'.repeat(56),name='000de140',unit=policy+name,bytes=text=>({bytes:Buffer.from(text).toString('hex')});
  const row={policy_id:policy,asset_name:name,cip68_metadata:{222:{fields:[{map:[{k:bytes('name'),v:bytes('Lil Sappys')},{k:bytes('image'),v:bytes('ipfs://example')}]}]}}};
  assert.equal(koiosMetadata(row,unit).name,'Lil Sappys');assert.equal(koiosMetadata(row,unit).image,'ipfs://example');assert.equal(koiosMetadata({...row,policy_id:'b'.repeat(56)},unit),null);
  assert.equal(koiosMetadata({policy_id:policy,asset_name:name,asset_name_ascii:'Seal',minting_tx_metadata:{721:{[policy]:{Seal:{name:'CIP25 Seal',image:'https://images.example/seal.png'}}}}},unit).name,'CIP25 Seal');
});
test('Monad metadata falls back to the existing token URI repair reader when indexer is unavailable',async()=>{
  const resolve=createFavoriteResolver({fetchImpl:async()=>{throw new Error('No indexer');},repairMetadata:async(network,nfts)=>{assert.equal(network,'monad-mainnet');nfts[0].name='Monad Seal';nfts[0].image={originalUrl:'https://images.example/monad.png'};}});const asset=await resolve(key.replace('ethereum:','monad:'));assert.equal(asset.name,'Monad Seal');assert.equal(asset.image,'https://images.example/monad.png');
});
