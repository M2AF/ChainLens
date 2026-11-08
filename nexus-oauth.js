'use strict';
// Only a fixed first-party account page may replace the normal web callback.
// The web JWT remains in that page's fragment and never reaches the native app.
function oauthReturnUrl(frontendUrl,state,values){
 const target=new URL(state?.nexus?'/nexus-account.html':'/',frontendUrl),params=new URLSearchParams(values);
 if(state?.nexus&&values.auth_token)target.hash=params.toString();else target.search=params.toString();
 return target.href;
}
module.exports={oauthReturnUrl};
