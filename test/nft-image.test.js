const { test } = require('node:test');
const assert = require('node:assert/strict');
const image=require('../public/nft-image');
test('image sources retain previews and distinct token originals with path gateway alternatives',()=>{
  const asset={thumbnailUrl:'https://cdn.example/thumb',image:'https://cdn.example/full',imageSources:['ar://art/2.png','ipfs://ipfs/QmCaseSensitive/2.png','https://cdn.example/full']};
  assert.equal(image.sources(asset)[0],asset.thumbnailUrl);
  assert.equal(image.sources(asset,false)[0],asset.image);
  assert.deepEqual(image.urls('https://bafy.ipfs.dead.example/2.png'),['https://bafy.ipfs.dead.example/2.png','https://ipfs.blockfrost.dev/ipfs/bafy/2.png','https://gateway.pinata.cloud/ipfs/bafy/2.png','https://ipfs.filebase.io/ipfs/bafy/2.png']);
  assert.ok(image.sources(asset).includes('https://ipfs.blockfrost.dev/ipfs/QmCaseSensitive/2.png'));
  assert.deepEqual(image.urls('javascript:alert(1)'),[]);
});

test('relative metadata artwork, URI fragments and unsafe schemes are normalized',()=>{
  assert.equal(image.urls(['ipfs://','QmCaseSensitive','/art.png'])[0],'https://ipfs.blockfrost.dev/ipfs/QmCaseSensitive/art.png');
  assert.equal(image.urls('./art.png','https://example.com/nft/1.json')[0],'https://example.com/nft/art.png');
  assert.deepEqual(image.urls('A'.repeat(100)),[]);
});
test('loader bounds active work, times out stalls and shares successful fallback', async()=>{
  let active=0,peak=0,reads=0;
  const loader=image.createLoader({limit:2,timeoutMs:15,makeImage:()=>{
    let stopped=false;
    return {set src(url){if(!url){if(!stopped){active--;stopped=true;}return;}reads++;active++;peak=Math.max(peak,active);if(!url.includes('stall'))setTimeout(()=>{if(!stopped){active--;stopped=true;this.onload?.();}},2);}};
  }});
  const load=urls=>new Promise(resolve=>loader.load(urls,result=>{if(result.status!=='loading')resolve(result);}));
  const results=await Promise.all([load(['stall','ok']),load(['second']),load(['third'])]);
  assert.equal(results[0].url,'ok');assert.equal(peak,2);
  const before=reads;await load(['stall','ok']);assert.equal(reads,before);
  loader.clear();
});

test('bare CIDs validate the version and multihash, including base58 CIDv1',()=>{
 const v0='QmU3EubsL5MBW3L3tG4WuMHzXf4yZt27N2uQdoaNSieb2G';
 assert.ok(image.validCID(v0));assert.ok(image.urls(v0)[0].includes(v0));
 const raw=[1,0x55,0x12,0x20,...Array(32).fill(1)];let n=BigInt('0x'+Buffer.from(raw).toString('hex')),encoded='';
 const alphabet='123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';while(n){encoded=alphabet[Number(n%58n)]+encoded;n/=58n;}
 assert.ok(image.validCID('z'+encoded));assert.ok(image.urls('z'+encoded+'/art.png').length);
 assert.equal(image.validCID('Qm'+'A'.repeat(44)),false);
 assert.ok(!image.urls('https://ipfs.io/ipfs/'+v0).some(url=>new URL(url).host==='ipfs.io'));
});
