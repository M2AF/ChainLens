const test=require('node:test'),assert=require('node:assert/strict'),express=require('express');
const {normalizeUsername,mountUsernameRoutes}=require('../profile-username');
const ID='ec18dcf5-3271-46fd-8029-41e5b2f39eed';
test('usernames canonicalize case and @ without conflating display names',()=>{
  assert.equal(normalizeUsername(' @Artist_12 '),'artist_12');
  for(const value of [null,42,'','ab','two words','criptoejəsus','x'.repeat(25),'../../profile'])assert.throws(()=>normalizeUsername(value),e=>e.status===400);
});
test('claims are authenticated, update only signed-in UUID, and surface unique-index conflicts',async t=>{
  const calls=[];let mode='ok';const db={from(table){const call={table};calls.push(call);const b={update(value){call.value=value;return b;},eq(column,value){call.where={column,value};return b;},select(columns){call.columns=columns;return b;},maybeSingle(){return Promise.resolve(mode==='duplicate'?{error:{code:'23505'}}:mode==='offline'?{error:{code:'42703'}}:mode==='missing'?{data:null}:{data:{id:ID,username:call.value.username}});}};return b;}};
  const app=express();app.use(express.json());let limits=0;
  mountUsernameRoutes(app,{db,rateLimit:(_q,_s,next)=>{limits++;next();},requireAuth:(req,res,next)=>{if(req.headers.authorization!=='Bearer valid')return res.status(401).end();req.user={sub:ID};next();}});
  const server=app.listen(0);await new Promise(r=>server.once('listening',r));t.after(()=>new Promise(r=>{server.close(r);server.closeAllConnections();}));
  const url=`http://127.0.0.1:${server.address().port}/api/profile/username`;
  const put=(body,token='valid')=>fetch(url,{method:'PUT',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify(body)});
  assert.equal((await put({username:'artist'},'bad')).status,401);assert.equal(calls.length,0);
  assert.equal((await put({username:'ab'})).status,400);assert.equal(calls.length,0);
  let res=await put({username:'@Artist',id:'another-user',display_name:'Overwrite'});assert.equal(res.status,200);assert.deepEqual(await res.json(),{id:ID,username:'artist'});
  assert.deepEqual(calls[0].value,{username:'artist'});assert.deepEqual(calls[0].where,{column:'id',value:ID});assert.equal(res.headers.get('cache-control'),'no-store');
  mode='duplicate';res=await put({username:'artist'});assert.equal(res.status,409);assert.match((await res.json()).error,/already claimed/);
  mode='missing';assert.equal((await put({username:'artist'})).status,404);
  mode='offline';assert.equal((await put({username:'artist'})).status,503);assert.equal(limits,6);
});
