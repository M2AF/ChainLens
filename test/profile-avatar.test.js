const test=require('node:test'),assert=require('node:assert/strict');
const {validateAvatar}=require('../profile-avatar');
test('NFT avatar source persists; uploads and legacy avatar writes clear it',()=>{
  assert.deepEqual(validateAvatar({avatar_url:'https://media.example/nft.png',avatar_nft_key:'ethereum:n:0xabc:3'}).updates,{avatar_url:'https://media.example/nft.png',avatar_nft_key:'ethereum:n:0xabc:3'});
  assert.equal(validateAvatar({avatar_url:'data:image/png;base64,AA=='}).updates.avatar_nft_key,null);
  assert.equal(validateAvatar({avatar_url:'https://media.example/photo.png'}).updates.avatar_nft_key,null);
  assert.deepEqual(validateAvatar({avatar_url:''}).updates,{avatar_url:null,avatar_nft_key:null});
  assert.deepEqual(validateAvatar({display_name:'Name'}).updates,{});
});
test('avatar source cannot be changed alone or paired with unsupported media',()=>{
  for(const body of [{avatar_nft_key:'ethereum:n:x:3'},{avatar_url:'https://img.example/a',avatar_nft_key:'bad'},{avatar_url:'',avatar_nft_key:'ethereum:n:x:3'},{avatar_url:'data:image/png;base64,AA==',avatar_nft_key:'ethereum:n:x:3'},{avatar_url:'javascript:bad'}])assert.ok(validateAvatar(body).error);
});
