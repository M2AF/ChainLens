const {test}=require('node:test');
const assert=require('node:assert/strict');
const {Readable}=require('node:stream');
const {createDocumentReader,embedded}=require('../nft-metadata-document');
test('embedded metadata supports encoded JSON and base64',()=>{
 const json=JSON.stringify({image:'ipfs://art/1.png'});
 assert.equal(embedded('data:application/json,'+encodeURIComponent(json)).image,'ipfs://art/1.png');
 assert.equal(embedded('data:application/json;base64,'+Buffer.from(json).toString('base64')).image,'ipfs://art/1.png');
});
test('custom metadata connections pin public DNS and reject private redirects',async()=>{
 let calls=0;
 const read=createDocumentReader({lookup:async()=>[{address:'8.8.8.8',family:4}],fetchImpl:async(url,options)=>{
  calls++;assert.ok(options.agent);return {status:302,headers:{get:()=> 'https://127.0.0.1/private'}};
 }});
 await assert.rejects(read('https://metadata.example/1'),/Private/);assert.equal(calls,1);
});
test('streaming metadata is stopped at the body limit',async()=>{
 const read=createDocumentReader({fetchImpl:async()=>({ok:true,status:200,body:Readable.from([Buffer.alloc(1024*1024),Buffer.alloc(1)])})});
 await assert.rejects(read('https://ipfs.blockfrost.dev/ipfs/art'),/large/);
});

test('IPFS documents retry the same content through another gateway',async()=>{
 const calls=[];
 const read=createDocumentReader({fetchImpl:async url=>{
  calls.push(url);
  if(url.includes('blockfrost'))return {ok:false,status:503};
  return {ok:true,status:200,text:async()=>JSON.stringify({name:'Peng #42',image:'ipfs://art/42'})};
 }});
 assert.equal((await read('https://gateway.pinata.cloud/ipfs/collection/42')).name,'Peng #42');
 assert.deepEqual(calls,['https://ipfs.blockfrost.dev/ipfs/collection/42','https://gateway.pinata.cloud/ipfs/collection/42']);
});
