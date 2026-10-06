const { test } = require('node:test');
const assert = require('node:assert/strict');
const spam = require('../public/nft-spam');
test('shared galleries honor manual spam, provider/name suspicion and explicit restoration', () => {
  const legit = {name:'Sappy Seal',floorPriceUsd:null};
  assert.equal(spam.isSpam(legit),false);
  assert.equal(spam.isSpam(legit,{s:'s'}),true);
  assert.equal(spam.isSpam(legit,{s:'h'}),true);
  assert.equal(spam.isSpam({name:'CLAIM Reward Voucher'}),true);
  assert.equal(spam.isSpam({name:'CLAIM Reward Voucher'},{s:'a'}),false);
  assert.equal(spam.isSpam({name:'Seal',isSpam:true}),true);
  assert.equal(spam.isSpam({name:'Seal',isSpam:'true'},{s:'a'}),false);
  assert.equal(spam.isSpam({name:'Airdrop Token',isToken:true}),false);
});
