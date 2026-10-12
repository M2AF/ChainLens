const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const source = fs.readFileSync(require('node:path').join(__dirname,'../public/sovereign.js'),'utf8');
const owner = {chain:'evm',watch_only:false,address:'0x1111111111111111111111111111111111111111'};
function fixture({balance=1n,chain='0x1237',request} = {}) {
  const calls=[],timers=[],attributes=new Map();
  const root={getAttribute:key=>attributes.get(key),dataset:{},style:{removeProperty(){}}};
  const window={dispatchEvent(){},addEventListener(){},chainlensThemes:{builtinById:require('../public/theme-engine').builtinById,applyTheme(colors){assert.equal(colors.bg,'#060b18');attributes.delete('data-cl-art-theme')}}};
  const document={documentElement:root,hidden:false,addEventListener(){}};
  const fetch=request || (async (_url, options)=>{
    const call=JSON.parse(options.body); calls.push(call);
    return {ok:true,json:async()=>({jsonrpc:'2.0',id:call.id,result:call.method==='eth_chainId'?chain:call.method==='eth_blockNumber'?'0xabc':'0x'+balance.toString(16).padStart(64,'0')})};
  });
  vm.runInNewContext(source,{document,window,fetch,AbortController,CustomEvent:class{},MutationObserver:class{observe(){}},matchMedia:()=>({matches:false,addEventListener(){}}),setTimeout:fn=>{timers.push(fn);return timers.length},clearTimeout(){},setInterval(){},localStorage:{getItem:()=>null},cancelAnimationFrame(){},Date});
  return {api:window.chainlensSovereign,calls,timers,attributes};
}
test('Sovereign uses the precise chain, contract, verified owner and measured block',async()=>{
  const f=fixture(); f.api.bind([owner]); await f.api.refresh();
  assert.equal(f.api.allowed(),true);
  assert.deepEqual(f.calls[2].params,[{to:'0x0351566C7e98780A591c08000576a01801241B31',data:'0x70a08231'+owner.address.slice(2).padStart(64,'0')},'0xabc']);
  f.attributes.set('data-cl-art-theme','sovereign'); f.api.bind([]);
  assert.equal(f.api.allowed(),false); assert.equal(f.attributes.has('data-cl-art-theme'),false);
});
test('watch-only, malformed and non-EVM accounts cannot grant access',async()=>{
  const f=fixture();
  f.api.bind([{...owner,watch_only:true},{...owner,watch_only:undefined},{...owner,chain:'solana'},{...owner,address:'bad'}]);
  await f.api.refresh(); assert.equal(f.calls.length,0); assert.equal(f.api.allowed(),false);
});
test('zero balance and wrong chain fail closed',async()=>{
  for(const options of [{balance:0n},{chain:'0xb626'}]) {
    const f=fixture(options); f.api.bind([owner]); await f.api.refresh(); assert.equal(f.api.allowed(),false);
  }
});
test('late responses after account removal cannot restore access',async()=>{
  let resolve;
  const blocked=new Promise(done=>{resolve=done});
  const f=fixture({request:async()=>{await blocked; return {ok:true,json:async()=>({jsonrpc:'2.0',id:1,result:'0x1237'})}}});
  f.api.bind([owner]); const pending=f.api.refresh(); f.api.bind([]); resolve(); await pending;
  assert.equal(f.api.allowed(),false); assert.equal(f.api.get().status,'locked');
});
test('hung RPC times out without granting ownership',()=>{
  const f=fixture({request:()=>new Promise(()=>{})}); f.api.bind([owner]); f.timers[0]();
  assert.equal(f.api.allowed(),false); assert.equal(f.api.get().status,'error');
});
