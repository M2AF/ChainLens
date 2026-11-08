(()=>{
 'use strict';const $=id=>document.getElementById(id),fragment=new URLSearchParams(location.hash.slice(1)),query=new URLSearchParams(location.search);
 const returned=fragment.get('auth_token');if(returned){history.replaceState(null,'',location.pathname);localStorage.setItem('cl_token',returned);}
 async function check(){
  $('account').hidden=true;$('signin').hidden=true;
  try{const token=localStorage.getItem('cl_token');if(!token)throw Error('Sign in to continue.');const r=await fetch('/api/nexus/account',{headers:{Authorization:'Bearer '+token},cache:'no-store'});if(!r.ok)throw Error('Sign in to continue.');const {user}=await r.json();$('name').textContent=user.name;$('username').textContent=user.username?'@'+user.username:'';$('identity').textContent=user.id;$('avatar').textContent=Array.from(user.name||'?')[0];if(typeof user.avatar_url==='string'&&(/^https:\/\//i.test(user.avatar_url)||/^data:image\/(?:png|jpeg|gif|webp);base64,/i.test(user.avatar_url))){const img=document.createElement('img');img.alt='Your saved profile picture';img.referrerPolicy='no-referrer';img.onerror=()=>{$('avatar').textContent=Array.from(user.name||'?')[0];};img.src=user.avatar_url;$('avatar').replaceChildren(img);}$('account').hidden=false;$('status').textContent='Signed in. Your saved ChainLens profile is ready.';}
  catch(error){$('signin').hidden=false;$('status').textContent=query.has('auth_error')?'Sign-in could not finish. Try again.':error.message;}
 }
 addEventListener('focus',check);addEventListener('storage',e=>{if(e.key==='cl_token')check();});check();
})();
