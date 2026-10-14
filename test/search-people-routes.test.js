const test=require('node:test'),assert=require('node:assert/strict'),express=require('express');
const {createClient}=require('@supabase/supabase-js');
const {createPeopleSearch}=require('../people-search-service');
const {mountPeopleSearch}=require('../search-people-routes');
const ID='ec18dcf5-3271-46fd-8029-41e5b2f39eed',OTHER='3f2c6cb8-2a43-4b69-bf5e-099ef63be79f';
test('actual Supabase client sends only allowlisted read queries to a stub transport',async()=>{
  const requests=[];
  const db=createClient('https://fixture.supabase.co','fixture-key',{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:async(url,options)=>{
    const u=new URL(url);requests.push({u,options});
    assert.equal(u.pathname,'/rest/v1/cl_users');assert.equal(options.method,'GET');
    return new Response(JSON.stringify([{id:ID,display_name:'Public Name',public_wallets:false,email:'never exposed'}]),{headers:{'Content-Type':'application/json'}});
  }}});
  const result=await createPeopleSearch({db}).search({q:'Public Name'});
  assert.equal(result.people[0].display_name,'Public Name');assert.equal(result.people[0].email,undefined);
  assert.equal(requests.length,3);for(const r of requests){assert.ok(!r.u.searchParams.get('select').includes('email'));assert.equal(r.u.searchParams.get('limit'),'11');}
});
test('people HTTP route applies rate/auth/block rules and exposes no-store results',async t=>{
  let limited=0,offline=false;
  const app=express();mountPeopleSearch(app,{service:{search:async()=>{if(offline)throw Object.assign(new Error('People search is temporarily unavailable'),{status:503});return{people:[{id:ID},{id:OTHER}],truncated:false};}},rateLimit:(_req,_res,next)=>{limited++;next();},optionalAuth:(req,_res,next)=>{if(req.headers.authorization)req.user={sub:ID};next();},blockedIds:async()=>new Set([OTHER])});
  const server=app.listen(0);await new Promise(r=>server.once('listening',r));t.after(()=>new Promise(r=>{server.close(r);server.closeAllConnections();}));
  const url=`http://127.0.0.1:${server.address().port}/api/search/people?q=Public`;
  let res=await fetch(url);assert.equal((await res.json()).people.length,2);assert.equal(res.headers.get('cache-control'),'no-store');
  res=await fetch(url,{headers:{Authorization:'Bearer fixture'}});assert.deepEqual((await res.json()).people,[{id:ID}]);
  offline=true;res=await fetch(url);assert.equal(res.status,503);assert.equal(limited,3);
});
