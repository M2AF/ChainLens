(()=>{
 'use strict';const $=id=>document.getElementById(id),params=new URLSearchParams(location.search);
 const request=Object.fromEntries(['client_id','redirect_uri','response_type','state','code_challenge','code_challenge_method'].map(k=>[k,params.get(k)]));
 const redirect='com.chainlens.ageofempirescastlesiege://auth/callback';let token=null,complete=false;
 const valid=request.client_id==='castle-siege-android'&&request.redirect_uri===redirect&&request.response_type==='code'&&request.code_challenge_method==='S256'&&/^[a-f0-9]{64}$/.test(request.state||'')&&/^[A-Za-z0-9_-]{43}$/.test(request.code_challenge||'');
 async function check(){
  if(!valid){$('status').textContent='This sign-in request is invalid. Start again from the Android game.';return;}
  if(complete)return;
  try{token=localStorage.getItem('cl_token');if(!token)throw Error();
   const response=await fetch('/api/profile',{headers:{Authorization:'Bearer '+token},cache:'no-store'});if(!response.ok)throw Error();
   const p=await response.json();$('identity').textContent=p.display_name||p.username||'ChainLens account';$('continue').disabled=false;$('signin').hidden=true;
   $('status').textContent='Connect this account, then return to the game.';
  }catch{token=null;$('identity').textContent='Sign in to ChainLens to connect your account.';$('continue').disabled=true;$('signin').hidden=false;}
 }
 $('continue').onclick=async()=>{
  $('continue').disabled=true;
  try{const response=await fetch('/api/castle-siege/authorize',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify(request),cache:'no-store'});
   const result=await response.json();if(!response.ok)throw Error('Could not connect. Start sign-in again from the game.');
   const target=new URL(result.redirect),expected=new URL(redirect);
   if(target.protocol!==expected.protocol||target.host!==expected.host||target.pathname!==expected.pathname||target.searchParams.get('state')!==request.state||!/^[a-f0-9]{64}$/.test(target.searchParams.get('code')||''))throw Error('Invalid game callback.');
   complete=true;$('continue').hidden=true;$('return-game').href=target.toString();$('return-game').hidden=false;
   $('status').textContent='Approved. Tap Return to Castle Siege to finish signing in.';
  }catch(e){$('status').textContent=e.message;$('continue').disabled=!token;}
 };
 addEventListener('storage',e=>{if(e.key==='cl_token')check();});addEventListener('focus',check);document.addEventListener('visibilitychange',()=>{if(!document.hidden)check();});check();
})();
