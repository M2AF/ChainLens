// CORS-safe web endpoint; native wallet uses the same canonical reader directly.
const {MALLARD_POLICY,readMallardPolicy}=require('./mallard-policy-core');
function mountMallardHolder(app,rateLimit){
  app.get('/api/theme-holder/mallard',rateLimit,async(req,res)=>{
    res.set('Cache-Control','no-store');
    try{res.json(await readMallardPolicy(req.query.address));}catch(error){res.status(error.message==='Invalid mainnet payment address'?400:503).json({error:'Ownership check unavailable'});}
  });
}
module.exports={MALLARD_POLICY,readMallardPolicy,mountMallardHolder};
