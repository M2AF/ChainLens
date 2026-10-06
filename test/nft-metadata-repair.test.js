const { test } = require('node:test');
const assert = require('node:assert/strict');
const { Interface } = require('ethers');
const { createMetadataRepair } = require('../nft-metadata-repair');
const abi = new Interface(['function tokenURI(uint256) view returns (string)','function uri(uint256) view returns (string)']);
const nft = id => ({contract:{address:'0x'+'1'.repeat(40),tokenType:'ERC721'},tokenId:String(id),tokenUri:'ar://old/'+id,name:'Wrong #10',image:{cachedUrl:'https://stale.example/10.png',thumbnailUrl:'https://stale.example/thumb.png'}});
test('contract metadata repairs each token independently, clears stale previews and caches immutable documents', async () => {
  let documents = 0;
  const repair = createMetadataRepair({apiKey:'fixture',fetchImpl:async(url,options)=>{
    if (options.method === 'POST') return {ok:true,json:async()=>JSON.parse(options.body).map(r=>({id:r.id,result:abi.encodeFunctionResult('tokenURI',['ar://fresh/'+(r.id+1)])}))};
    documents++; const id=url.split('/').pop();
    return {ok:true,status:200,text:async()=>JSON.stringify({name:'Correct #'+id,image:'ar://art/'+id+'.png',attributes:{hat:'blue'}})};
  }});
  const items=[nft(1),nft(2)];await repair('robinhood-mainnet',items);
  assert.deepEqual(items.map(n=>n.name),['Correct #1','Correct #2']);
  assert.deepEqual(items.map(n=>n.image.originalUrl),['https://arweave.net/art/1.png','https://arweave.net/art/2.png']);
  assert.equal(items[0].image.thumbnailUrl,undefined);
  await repair('robinhood-mainnet',[nft(1),nft(2)]);assert.equal(documents,2);
});
test('RPC or gateway errors preserve provider art and arbitrary HTTPS metadata is not followed', async()=>{
  const item=nft(1);let calls=0;
  const repair=createMetadataRepair({apiKey:'fixture',fetchImpl:async(_url,options)=>{calls++;assert.equal(options.method,'POST');return {ok:true,json:async()=>[{id:0,result:abi.encodeFunctionResult('tokenURI',['https://private.example/meta'])}]};}});
  await repair('robinhood-mainnet',[item]);assert.equal(calls,1);assert.equal(item.name,'Wrong #10');
  await createMetadataRepair({apiKey:'fixture',fetchImpl:async()=>{throw Error('offline');}})('robinhood-mainnet',[item]);assert.equal(item.image.cachedUrl,'https://stale.example/10.png');
});
test('metadata redirects stay within public gateway hosts',async()=>{
  const called=[];const item=nft(1);
  const repair=createMetadataRepair({apiKey:'fixture',fetchImpl:async(url,options)=>{
    called.push(url);
    if(options.method==='POST')return {ok:true,json:async()=>[{id:0,result:abi.encodeFunctionResult('tokenURI',['ar://fresh/1'])}]};
    return {ok:false,status:302,headers:{get:()=> 'http://127.0.0.1/private'}};
  }});
  await repair('robinhood-mainnet',[item]);assert.equal(called.length,2);assert.equal(item.name,'Wrong #10');
});
test('ERC1155 templates use padded hexadecimal token identity',async()=>{
  const item=nft(16);item.contract.tokenType='ERC1155';let metadataUrl;
  const repair=createMetadataRepair({apiKey:'fixture',fetchImpl:async(url,options)=>{
    if(options.method==='POST')return {ok:true,json:async()=>[{id:0,result:abi.encodeFunctionResult('uri',['ipfs://fresh/{id}.json'])}]};
    metadataUrl=url;return {ok:true,status:200,text:async()=>JSON.stringify({image:'ipfs://art/16.png'})};
  }});
  await repair('base-mainnet',[item]);assert.equal(metadataUrl,'https://ipfs.io/ipfs/fresh/'+('10'.padStart(64,'0'))+'.json');
});
