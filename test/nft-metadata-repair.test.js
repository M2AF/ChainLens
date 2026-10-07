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
test('a transient contract read failure keeps last known good art for the same token only', async () => {
  let rpcWorks = true;
  const repair = createMetadataRepair({apiKey:'fixture',fetchImpl:async(url,options)=>{
    if(options.method === 'POST') {
      if(!rpcWorks) throw Error('RPC unavailable');
      return {ok:true,json:async()=>[{id:0,result:abi.encodeFunctionResult('tokenURI',['ar://fresh/1'])}]};
    }
    return {ok:true,status:200,text:async()=>JSON.stringify({name:'Correct #1',image:'ar://art/1.png'})};
  }});
  const first = nft(1);
  await repair('robinhood-mainnet',[first]);
  assert.equal(first.image.originalUrl,'https://arweave.net/art/1.png');
  rpcWorks = false;
  const later = nft(1), different = nft(2);
  await repair('robinhood-mainnet',[later,different]);
  assert.equal(later.name,'Correct #1');
  assert.equal(later.image.originalUrl,'https://arweave.net/art/1.png');
  assert.equal(later.image.cachedUrl,undefined);
  assert.equal(different.name,'Wrong #10');
});
test('RPC or gateway errors preserve provider art and arbitrary HTTPS metadata is not followed', async()=>{
  const item=nft(1);let calls=0;
  const repair=createMetadataRepair({apiKey:'fixture',lookup:async()=>[{address:'127.0.0.1',family:4}],fetchImpl:async(_url,options)=>{calls++;assert.equal(options.method,'POST');return {ok:true,json:async()=>[{id:0,result:abi.encodeFunctionResult('tokenURI',['https://private.example/meta'])}]};}});
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
  await repair('base-mainnet',[item]);assert.equal(metadataUrl,'https://ipfs.blockfrost.dev/ipfs/fresh/'+('10'.padStart(64,'0'))+'.json');
});

test('deferred repair covers documents beyond twelve without blocking ownership pages',async()=>{
 let active=0,peak=0;
 const repair=createMetadataRepair({apiKey:'fixture',waitMs:1,fetchImpl:async(url,options)=>{
  if(options.method==='POST')return {ok:true,json:async()=>JSON.parse(options.body).map(r=>({id:r.id,result:abi.encodeFunctionResult('tokenURI',['ar://queued/'+r.id])}))};
  active++;peak=Math.max(peak,active);await new Promise(resolve=>setTimeout(resolve,8));active--;
  return {ok:true,status:200,text:async()=>JSON.stringify({image:'ar://art/'+url.split('/').pop()+'.png'})};
 }});
 const items=Array.from({length:18},(_,i)=>nft(i+1));await repair('robinhood-mainnet',items);
 assert.ok(items.some(n=>n.artRepairPending));
 await new Promise(resolve=>setTimeout(resolve,100));
 assert.equal(peak,6);assert.equal(repair.artwork('robinhood-mainnet',items[17].contract.address,'18').artwork.image,'https://arweave.net/art/17.png');
});

test('Solana missing artwork repairs by exact asset ID and invalidates changed metadata URIs',async()=>{
 const repair=createMetadataRepair({fetchImpl:async url=>({ok:true,status:200,text:async()=>JSON.stringify({image:'ar://art/'+url.split('/').pop()+'.png'})})});
 const first={id:'mint-one',image:'',metadataUri:'ar://metadata/one'};repair.enrich('solana',[first]);
 await new Promise(resolve=>setTimeout(resolve,10));
 assert.equal(repair.assetArtwork('solana','mint-one').artwork.image,'https://arweave.net/art/one.png');
 assert.equal(repair.assetArtwork('solana','mint-two').artwork,null);
 const changed={id:'mint-one',image:'',metadataUri:'ar://metadata/two'};repair.enrich('solana',[changed]);
 await new Promise(resolve=>setTimeout(resolve,10));
 assert.equal(repair.assetArtwork('solana','mint-one').artwork.image,'https://arweave.net/art/two.png');
});

test('agreeing contract metadata retains provider thumbnails until a targeted retry',async()=>{
 const item=nft(1);item.tokenUri='ar://fresh/1';item.name='Correct #1';item.raw={metadata:{image:'ar://art/1.png'}};
 const repair=createMetadataRepair({apiKey:'fixture',fetchImpl:async(url,options)=>options.method==='POST'?{ok:true,json:async()=>[{id:0,result:abi.encodeFunctionResult('tokenURI',['ar://fresh/1'])}]}:{ok:true,status:200,text:async()=>JSON.stringify({name:'Correct #1',image:'ar://art/1.png'})}});
 await repair('robinhood-mainnet',[item]);assert.equal(item.image.cachedUrl,'https://stale.example/10.png');
 repair.retry('robinhood-mainnet',item.contract.address,'1');await new Promise(resolve=>setTimeout(resolve,20));
 assert.equal(repair.artwork('robinhood-mainnet',item.contract.address,'1').artwork.image,'https://arweave.net/art/1.png');
});

test('Monad small batches retain successes and retry rate-limited identities on the alternate RPC',async()=>{
 const calls=[];
 const repair=createMetadataRepair({apiKey:'fixture',fetchImpl:async(url,options)=>{
  if(options.method!=='POST')return {ok:true,status:200,text:async()=>JSON.stringify({image:'ar://art/'+url.split('/').pop()+'.png'})};
  const batch=JSON.parse(options.body);calls.push({url,ids:batch.map(r=>r.id)});
  assert.ok(batch.length<=10);
  return {ok:true,json:async()=>batch.map(r=>r.id===3&&url==='https://rpc.monad.xyz'?{id:r.id,error:{code:-32007,message:'request limit'}}:{id:r.id,result:abi.encodeFunctionResult('tokenURI',['ar://meta/'+r.id])})};
 }});
 const items=Array.from({length:12},(_,i)=>nft(i+1));await repair('monad-mainnet',items);
 assert.deepEqual(calls.map(r=>r.ids),[[0,1,2,3,4,5,6,7,8,9],[3],[10,11]]);
 assert.equal(calls[1].url,'https://rpc1.monad.xyz');
 assert.equal(items[3].image.originalUrl,'https://arweave.net/art/3.png');
 assert.equal(items[11].image.originalUrl,'https://arweave.net/art/11.png');
});

test('empty on-chain URI reports unpublished artwork without inventing collection images',async()=>{
 const item=nft(1);item.image={};item.tokenUri='';
 const repair=createMetadataRepair({apiKey:'fixture',fetchImpl:async()=>({ok:true,json:async()=>[{id:0,result:abi.encodeFunctionResult('tokenURI',[''])}]})});
 await repair('robinhood-mainnet',[item]);
 assert.equal(item.artworkStatus,'missing-metadata');
 assert.deepEqual(item.image,{});
 assert.equal(repair.artwork('robinhood-mainnet',item.contract.address,'1').artwork,null);
});
