const {test}=require('node:test');const assert=require('node:assert/strict');
const {readMallardPolicy,MALLARD_POLICY}=require('../theme-holder-cardano');
const address='addr1vyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zygatvcjl';
test('fixed Mallard policy quantity excludes unrelated assets and ADA',async()=>{
  let body;const request=async(url,init)=>{assert.ok(url.startsWith('https://api.koios.rest/api/v1/address_assets?'));body=JSON.parse(init.body);return {ok:true,json:async()=>[{address,policy_id:MALLARD_POLICY,asset_name:'01',quantity:'1'},{address,policy_id:'f'.repeat(56),asset_name:'02',quantity:'200'}]}};
  assert.deepEqual(await readMallardPolicy(address,request),{address,policy:MALLARD_POLICY,quantity:'1'});assert.deepEqual(body,{_addresses:[address]});
});
test('empty holdings lock; malformed, missing quantities and unavailable providers reject',async()=>{
  assert.equal((await readMallardPolicy(address,async()=>({ok:true,json:async()=>[]}))).quantity,'0');
  await assert.rejects(readMallardPolicy(address,async()=>({ok:true,json:async()=>[{address,policy_id:MALLARD_POLICY,asset_name:'01'}]})),/Invalid asset/);
  await assert.rejects(readMallardPolicy(address,async()=>({ok:false})),/unavailable/);
  await assert.rejects(readMallardPolicy('stake1other'),/Invalid mainnet/);
  await assert.rejects(readMallardPolicy('addr_test1other'),/Invalid mainnet/);
});
test('paginated responses must progress without duplicate assets',async()=>{
  const rows=Array.from({length:1000},(_,i)=>({address,policy_id:MALLARD_POLICY,asset_name:i.toString(16).padStart(4,'0'),quantity:'1'}));let calls=0;
  const proof=await readMallardPolicy(address,async()=>({ok:true,json:async()=>++calls===1?rows:[]}));assert.equal(proof.quantity,'1000');assert.equal(calls,2);
  await assert.rejects(readMallardPolicy(address,async()=>({ok:true,json:async()=>rows})),/Repeated/);
});
