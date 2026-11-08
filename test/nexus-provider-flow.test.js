const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),crypto=require('node:crypto');
const {oauthReturnUrl}=require('../nexus-oauth');
function fixture(){
 const routes=new Map(),requests=[],states={};const source=fs.readFileSync(require.resolve('../backend-server'),'utf8');
 const context={require:name=>{assert.equal(name,'./nexus-oauth');return {oauthReturnUrl};},app:{get:(path,handler)=>routes.set(path,handler)},crypto,_oauthStates:states,FRONTEND_URL:'https://www.chainlensnft.info',URLSearchParams,Date,console:{error:()=>{}},process:{env:{GOOGLE_CLIENT_ID:'fixture',GOOGLE_CLIENT_SECRET:'fixture',DISCORD_CLIENT_ID:'fixture',DISCORD_CLIENT_SECRET:'fixture'}},supabase:{},JWT_SECRET:'fixture',jwt:{sign:()=> 'fake-browser-token'},dbFindUserBySocial:async()=>({id:'fixture-user',display_name:'Saved Name'}),dbLinkSocialAccount:async()=>{},fetch:async url=>{requests.push(url);if(url.endsWith('/token'))return {json:async()=>({access_token:'fake-provider-token'})};return {json:async()=>({id:'fixture-social',name:'Name',global_name:'Name',picture:'https://media.example/photo.png'})};}};
 vm.runInNewContext(source.slice(source.indexOf("const {oauthReturnUrl}=require('./nexus-oauth');"),source.indexOf("require('./profile-username').mountUsernameRoutes")),context);
 return {routes,requests,states};
}
for(const provider of ['google','discord'])test(`Nexus ${provider} login and cancelled/expired flows stay out of the full crypto application`,async()=>{
 const f=fixture();let redirect;const res={redirect:url=>{redirect=url;}};
 f.routes.get('/auth/'+provider)({query:{client:'nexus-desktop'}},res);const state=new URL(redirect).searchParams.get('state');assert(state.startsWith('nx_'));assert.equal(f.states[state].nexus,true);
 await f.routes.get('/auth/'+provider+'/callback')({query:{state,code:'fixture'}},res);let target=new URL(redirect);assert.equal(target.pathname,'/nexus-account.html');assert.equal(target.search,'');assert.equal(new URLSearchParams(target.hash.slice(1)).get('auth_token'),'fake-browser-token');assert.equal(f.requests.length,2);assert(f.requests.every(url=>/^https:\/\/(oauth2\.googleapis\.com|www\.googleapis\.com|discord\.com)\//.test(url)));
 await f.routes.get('/auth/'+provider+'/callback')({query:{state,code:'replay'}},res);target=new URL(redirect);assert.equal(target.pathname,'/nexus-account.html');assert.equal(target.searchParams.get('auth_error'),'invalid_state');assert.equal(f.requests.length,2);
 f.routes.get('/auth/'+provider)({query:{client:'nexus-desktop'}},res);const cancelled=new URL(redirect).searchParams.get('state');await f.routes.get('/auth/'+provider+'/callback')({query:{state:cancelled,error:'access_denied'}},res);assert.equal(new URL(redirect).pathname,'/nexus-account.html');assert.equal(new URL(redirect).searchParams.get('auth_error'),'access_denied');
 f.routes.get('/auth/'+provider)({query:{}},res);const ordinary=new URL(redirect).searchParams.get('state');assert(!ordinary.startsWith('nx_'));await f.routes.get('/auth/'+provider+'/callback')({query:{state:ordinary,code:'fixture'}},res);assert.equal(new URL(redirect).pathname,'/');
});
