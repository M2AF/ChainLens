const {test}=require('node:test');
const assert=require('node:assert/strict');
const {cardanoMedia,isCardanoNFT}=require('../cardano-media');
test('Cardano NFT media includes fragmented image and typed files without registry-logo substitution',()=>{
 const meta={onchain_metadata:{image:['ipfs://','QmTest/art.png'],files:[{mediaType:'video/mp4',src:'https://video.example/a'},{mediaType:'image/png',src:['https://art.example/','2.png']}]},metadata:{logo:'iVBORw0KGgoAAA'}};
 const media=cardanoMedia(meta);
 assert.ok(media.imageSources.includes('https://art.example/2.png'));
 assert.ok(!media.imageSources.some(v=>v.includes('video.example')||v.startsWith('data:')));
 assert.ok(cardanoMedia(meta,true).imageSources.some(v=>v.startsWith('data:image/png;base64,')));
 assert.equal(cardanoMedia({metadata:{url:'https://website.example'}}).image,'');
});
test('Cardano NFT classification uses global supply, CIP metadata and excludes reference assets',()=>{
 assert.equal(isCardanoNFT({quantity:'1000000',metadata:{ticker:'COIN'}}),false);
 assert.equal(isCardanoNFT({quantity:'1'}),true);
 assert.equal(isCardanoNFT({quantity:'10',onchain_metadata_standard:'CIP25'}),true);
 assert.equal(isCardanoNFT({quantity:'1',asset_name:'000643b0abc',onchain_metadata_standard:'CIP68'}),false);
});

test('CIP68 CBOR media strings decode and fungible metadata stays out of NFT galleries',()=>{
 const uri='ipfs://QmUHgAkdfS6okKWj4xUsAvCzJNsa4GeVL3Evi3KqxWDmsU';
 const bytes=Buffer.from(uri),hex=Buffer.concat([Buffer.from([0x58,bytes.length]),bytes]).toString('hex');
 assert.equal(cardanoMedia({onchain_metadata:{image:hex}},true).image,'https://ipfs.blockfrost.dev/ipfs/'+uri.slice(7));
 assert.equal(isCardanoNFT({quantity:'1',onchain_metadata_standard:'CIP68v1',metadata:{ticker:'eBTC',decimals:8}}),false);
 assert.equal(cardanoMedia({onchain_metadata:{image:'abc'.repeat(40)}}).image,'');
});
