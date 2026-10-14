const test = require('node:test'), assert = require('node:assert/strict');
const { Interface } = require('ethers');
const { parseEntityIntent, explorerUrl } = require('../public/search-entities');
const { createTransactionSearch } = require('../search-transaction-service');
const { createAssetSearch } = require('../search-asset-service');
const HASH = '0x' + 'a'.repeat(64), ADDRESS = '0x' + '1'.repeat(40), OTHER = '0x' + '2'.repeat(40), POLICY = 'a'.repeat(56);
const response = data => ({ ok: true, status: 200, json: async () => data });
test('classifies explicit asset intent and asks for chain for ambiguous hashes/contracts', () => {
  assert.deepEqual(parseEntityIntent('token USDC on Base'), { kind: 'token', query: 'USDC', chain: 'base', needsChain: false });
  assert.equal(parseEntityIntent(ADDRESS).needsChain, true);
  assert.equal(parseEntityIntent(HASH).needsChain, true);
  assert.equal(parseEntityIntent(POLICY).chain, 'cardano');
  assert.equal(parseEntityIntent('collection '+POLICY+' on Ethereum').chain, 'ethereum');
  assert.equal(parseEntityIntent('transaction '+HASH+' on madeup'), null);
});
test('accepts only known mainnet explorer URLs without guessing hosts or networks', () => {
  assert.equal(parseEntityIntent('https://basescan.org/tx/'+HASH).chain, 'base');
  for (const q of ['https://basescan.org.evil/tx/'+HASH, 'https://user@basescan.org/tx/'+HASH, 'http://basescan.org/tx/'+HASH, 'https://basescan.org:443/tx/'+HASH+'#evil', 'https://sepolia.basescan.org/tx/'+HASH]) assert.equal(parseEntityIntent(q), null);
  assert.equal(explorerUrl('madeup','transaction',HASH),null);
});
test('transaction lookup distinguishes missing, pending, successful and failed and checks hashes', async () => {
  let state = 'missing';
  const service = createTransactionSearch({ fetchImpl: async (_url, options) => {
    const req = JSON.parse(options.body);
    const result = state === 'missing' ? null : req.method === 'eth_getTransactionByHash' ? { hash: HASH, from: ADDRESS, to: OTHER, value: '0xde0b6b3a7640000' } : state === 'pending' ? null : { transactionHash: state === 'mismatch' ? '0x'+'b'.repeat(64) : HASH, status: state === 'failed' ? '0x0' : '0x1', blockNumber: '0x10', gasUsed: '0x5208', effectiveGasPrice: '0x1', logs: [] };
    return response({ result });
  } });
  for (const [input, output] of [['missing','not-found'],['pending','pending'],['success','successful'],['failed','failed']]) { state=input; assert.equal((await service.search({chain:'base',hash:HASH})).state,output); }
  state='success'; const tx=await service.search({chain:'base',hash:HASH}); assert.equal(tx.value,'1.0'); assert.equal(tx.block,'16');
  state='mismatch'; await assert.rejects(service.search({chain:'base',hash:HASH}),e=>e.statusCode===503);
});
test('RPC outage is not pending/not-found; malformed hashes never fetch', async () => {
  let calls=0; const service=createTransactionSearch({fetchImpl:async()=>{calls++;throw new Error('offline')}});
  await assert.rejects(service.search({chain:'base',hash:'evil'}),e=>e.statusCode===400); assert.equal(calls,0);
  await assert.rejects(service.search({chain:'base',hash:HASH}),e=>e.statusCode===503);
});
test('NFT Transfer ID is distinct from quantity, malformed logs skipped and output capped', async () => {
  const topic='0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef', word='0x'+'0'.repeat(24)+'1'.repeat(40);
  const logs=Array.from({length:30},()=>({address:ADDRESS,topics:[topic,word,word,'0x'+'0'.repeat(63)+'7'],data:'0x'}));
  const service=createTransactionSearch({fetchImpl:async(_url,o)=>response({result:JSON.parse(o.body).method==='eth_getTransactionByHash'?{hash:HASH,value:'0x0'}:{transactionHash:HASH,status:'0x1',blockNumber:'0x1',logs}})});
  const tx=await service.search({chain:'monad',hash:HASH}); assert.equal(tx.transfers.length,20); assert.equal(tx.transfers[0].tokenId,'7'); assert.equal(tx.transfers[0].amountRaw,'1');
});
test('Bitcoin and Cardano transaction rows validate identities and normalize fees', async () => {
  const h=HASH.slice(2);
  const btc=createTransactionSearch({fetchImpl:async()=>response({txid:h,status:{confirmed:true,block_height:99},fee:123,vout:[{value:2000,scriptpubkey_address:'bc1example'}]})});
  assert.equal((await btc.search({chain:'bitcoin',hash:h})).fee,'0.00000123');
  const ada=createTransactionSearch({fetchImpl:async()=>response([{tx_hash:h,valid_contract:true,block_height:9,fee:'170000',outputs:[{payment_addr:{bech32:'addr1example'},value:'2000000',asset_list:[]}]}])});
  const tx=await ada.search({chain:'cardano',hash:h}); assert.equal(tx.fee,'0.17'); assert.equal(tx.transfers[0].to,'addr1example');
});
test('ERC1155 batch summary preserves IDs, quantities and the twenty-transfer cap', async () => {
  const events = new Interface(['event TransferBatch(address indexed operator,address indexed from,address indexed to,uint256[] ids,uint256[] values)']);
  const ids=Array.from({length:25},(_,i)=>BigInt(i)), values=ids.map(()=>3n);
  const encoded=events.encodeEventLog(events.getEvent('TransferBatch'),[ADDRESS,ADDRESS,OTHER,ids,values]);
  const service=createTransactionSearch({fetchImpl:async(_url,o)=>response({result:JSON.parse(o.body).method==='eth_getTransactionByHash'?{hash:HASH,value:'0x0'}:{transactionHash:HASH,status:'0x1',blockNumber:'0x1',logs:[{address:ADDRESS,...encoded}]}})});
  const tx=await service.search({chain:'base',hash:HASH});assert.equal(tx.transfers.length,20);assert.equal(tx.transfers[19].tokenId,'19');assert.equal(tx.transfers[0].amountRaw,'3');
});
test('token name discovery preserves chain-qualified identity and partial failures', async () => {
  const service=createAssetSearch({tokenSearch:async()=>({tokens:[{chain:'base',address:ADDRESS,name:'Same',symbol:'SAME',decimals:18},{chain:'monad',address:ADDRESS,name:'Same',symbol:'SAME',decimals:18}],partial:true})});
  const result=await service.search({kind:'token',q:'Same'}); assert.equal(result.assets.length,2); assert.notEqual(result.assets[0].key,result.assets[1].key); assert.equal(result.partial,true);
});
test('explicit native asset lookup has no fake contract and does not call discovery', async () => {
  const service=createAssetSearch({fetchImpl:()=>assert.fail('native metadata should not fetch'),tokenSearch:()=>assert.fail('native metadata should not discover')});
  const result=await service.search({kind:'token',chain:'cardano',q:'ADA'});assert.equal(result.assets[0].isNative,true);assert.equal(result.assets[0].address,null);assert.equal(result.assets[0].symbol,'ADA');
});
test('exact contract metadata requires chain and does not misidentify ERC721 as ERC20', async () => {
  let calls=0; const abi=new Interface(['function supportsInterface(bytes4) view returns(bool)','function name() view returns(string)']);
  const service=createAssetSearch({fetchImpl:async(_url,o)=>{calls++;const call=JSON.parse(o.body).params[0].data;return response({result:call.startsWith(abi.getFunction('name').selector)?abi.encodeFunctionResult('name',['NFT collection']):abi.encodeFunctionResult('supportsInterface',[true])})}});
  await assert.rejects(service.search({kind:'collection',q:ADDRESS}),e=>e.statusCode===400); assert.equal(calls,0);
  const out=await service.search({kind:'collection',q:ADDRESS,chain:'monad'}); assert.equal(out.assets[0].standard,'ERC721'); assert.equal(out.assets[0].kind,'collection');
});
test('Cardano policy list need not repeat policy_id; units and name filters are bounded', async () => {
  const urls=[]; const service=createAssetSearch({fetchImpl:async(url)=>{urls.push(url);return response([{asset_name:'4d494e',asset_name_ascii:'MIN',fingerprint:'asset1example'}])}});
  const out=await service.search({kind:'collection',chain:'cardano',q:POLICY}); assert.equal(out.assets[0].kind,'policy'); assert.equal(out.assets[0].sampleAssets[0].name,'MIN'); assert.match(urls[0],/limit=5/);
});
test('collection index does not invent metadata; provider errors remain errors', async () => {
  const service=createAssetSearch({fetchImpl:async()=>{throw new Error('secret URL key')}});
  const known=await service.search({kind:'collection',q:'Sappy'}); assert.equal(known.assets[0].chain,'ethereum'); assert.ok(known.coverage);
  const unknown=await service.search({kind:'collection',q:'not a known collection'}); assert.equal(unknown.assets.length,0);
  await assert.rejects(service.search({kind:'collection',q:POLICY,chain:'cardano'}),e=>e.statusCode===503 && !e.message.includes('secret'));
});
