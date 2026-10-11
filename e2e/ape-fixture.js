const fs=require('node:fs'),path=require('node:path');
exports.installApeFixture=async function(page,options={balance:1,ids:['6637']}){
  const control={...options,fail:false,owner:'0x01faf6dfc230d755141d84d7cb980dd68f5efe13'};
  const word=n=>'0x'+n.toString(16).padStart(64,'0');
  await page.route('https://ethereum-rpc.publicnode.com/',route=>{
    if(control.fail)return route.fulfill({status:503,body:'Offline'});
    const call=route.request().postDataJSON(),data=call.params?.[0]?.data || '';
    let result=call.method==='eth_chainId'?'0x1':call.method==='eth_blockNumber'?'0xabc':word(0n);
    if(data.startsWith('0x70a08231')){control.owner='0x'+data.slice(-40);result=word(BigInt(control.balance))}
    if(data.startsWith('0x6352211e'))result='0x'+control.owner.slice(2).padStart(64,'0');
    if(data.startsWith('0xc87b56dd')){
      const id=BigInt('0x'+data.slice(10)).toString(),meta={name:id==='6637'?'Roch Edwards':'Second Ape',image:`ipfs://bafyfixture/${id}.jpg`};
      const b=Buffer.from('data:application/json;base64,'+Buffer.from(JSON.stringify(meta)).toString('base64'));
      result=word(32n)+word(BigInt(b.length)).slice(2)+b.toString('hex').padEnd(Math.ceil(b.length/32)*64,'0');
    }
    return route.fulfill({json:{jsonrpc:'2.0',id:call.id,result}});
  });
  await page.route('https://eth.blockscout.com/api/v2/tokens/**',route=>route.fulfill({json:{items:control.ids.map(id=>({id})),next_page_params:null}}));
  const portrait=fs.readFileSync(path.resolve(__dirname,'../public/themes/ape-society/portrait.png'));
  await page.route('**/ipfs/bafyfixture/**',route=>route.fulfill({contentType:'image/png',body:portrait}));
  return control;
};
