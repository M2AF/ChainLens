const test=require('node:test'),assert=require('node:assert/strict');
const {oauthReturnUrl}=require('../nexus-oauth');
test('Nexus provider login returns only to the lightweight first-party account page with fragment credentials',()=>{
 const url=new URL(oauthReturnUrl('https://www.chainlensnft.info',{nexus:true,return_to:'https://evil.example'},{auth_token:'fake-browser-token'}));
 assert.equal(url.origin,'https://www.chainlensnft.info');assert.equal(url.pathname,'/nexus-account.html');assert.equal(url.search,'');assert.equal(new URLSearchParams(url.hash.slice(1)).get('auth_token'),'fake-browser-token');
 const failed=new URL(oauthReturnUrl(url.origin,{nexus:true},{auth_error:'denied&extra=bad'}));assert.equal(failed.pathname,'/nexus-account.html');assert.equal(failed.searchParams.get('auth_error'),'denied&extra=bad');assert.equal(failed.searchParams.size,1);
});
test('Existing web and social-link callback destinations retain the normal homepage',()=>{
 for(const state of [undefined,{}, {linkToken:'existing'}]){const url=new URL(oauthReturnUrl('https://www.chainlensnft.info',state,{auth_token:'fixture-token',linked:'google'}));assert.equal(url.pathname,'/');assert.equal(url.hash,'');assert.equal(url.searchParams.get('auth_token'),'fixture-token');assert.equal(url.searchParams.get('linked'),'google');}
});
