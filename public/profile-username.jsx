(function(){
  const {useState,useEffect}=React;
  window.ProfileUsername=function({profile,editable=false,authFetch,onSave}){
    const [editing,setEditing]=useState(false),[value,setValue]=useState(profile.username||''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
    useEffect(()=>{setValue(profile.username||'');setEditing(false);setError('');setNotice('');},[profile.id,profile.username]);
    const copy=async()=>{try{await navigator.clipboard.writeText('@'+profile.username);setNotice('Username copied');setError('');}catch{setError('Could not copy username.');}};
    const save=async(event)=>{
      event.preventDefault();setBusy(true);setError('');setNotice('');
      try{
        const response=await authFetch('/api/profile/username',{method:'PUT',body:JSON.stringify({username:value})});
        const data=await response.json();if(!response.ok)throw new Error(data.error||'Could not claim username.');
        if(data.id!==profile.id || !data.username)throw new Error('Could not confirm your username.');
        onSave?.(data);setEditing(false);setNotice('Username saved');
      }catch(error){setError(error.message);}finally{setBusy(false);}
    };
    if(!editable && !profile.username)return null;
    return <section className="cl-profile-username" aria-label="ChainLens username">
      <div className="cl-username-row"><span className="profile-id-label">Username</span>
        {profile.username ? <><strong>@{profile.username}</strong><button type="button" onClick={copy} aria-label="Copy username">Copy</button>{editable && <button type="button" onClick={()=>{setEditing(true);setError('');}} disabled={busy}>Edit</button>}</> : <span>Choose your unique username</span>}
      </div>
      {editable && (editing || !profile.username) && <form onSubmit={save}>
        <label htmlFor="profile-username-input">Username</label><div className="cl-username-form-row"><span aria-hidden="true">@</span><input id="profile-username-input" autoComplete="off" autoCapitalize="none" spellCheck="false" value={value} maxLength={25} onChange={event=>setValue(event.target.value)} placeholder="your_username" disabled={busy} required/><button type="submit" disabled={busy}>{busy?'Saving…':profile.username?'Save username':'Claim username'}</button>{profile.username && <button type="button" disabled={busy} onClick={()=>{setEditing(false);setValue(profile.username);setError('');}}>Cancel</button>}</div>
        <small>3–24 characters: a–z, 0–9 or underscores. Usernames are unique; display names stay customizable.</small>
      </form>}
      {(error||notice) && <p role={error?'alert':'status'}>{error||notice}</p>}
    </section>;
  };
})();
