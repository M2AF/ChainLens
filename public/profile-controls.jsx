(function(){
  const {useState,useEffect,useRef}=React;
  window.PublicProfileControls=function({person,authToken,onMessage}){
    const [relation,setRelation]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
    const [more,setMore]=useState(false),[report,setReport]=useState(false),[reason,setReason]=useState('spam'),[details,setDetails]=useState('');
    const root=useRef(null);
    const request=async(url,opts={})=>{const res=await fetch(url,{...opts,headers:{'Content-Type':'application/json',Authorization:`Bearer ${authToken}`}});const body=await res.json();if(!res.ok)throw new Error(body.error || 'Profile action unavailable');return body;};
    const refresh=()=>request(`/api/profiles/${person.id}/relationship`).then(setRelation);
    useEffect(()=>{setRelation(null);setMore(false);setError('');if(!authToken)return;let cancelled=false;request(`/api/profiles/${person.id}/relationship`).then(body=>{if(!cancelled)setRelation(body);}).catch(err=>{if(!cancelled)setError(err.message);});return()=>{cancelled=true;};},[person.id,authToken]);
    useEffect(()=>{if(!more)return;const close=event=>{if(!root.current?.contains(event.target))setMore(false);};const key=e=>{if(e.key==='Escape'){setMore(false);root.current?.querySelector('[aria-haspopup]')?.focus();}};document.addEventListener('pointerdown',close);document.addEventListener('keydown',key);return()=>{document.removeEventListener('pointerdown',close);document.removeEventListener('keydown',key);};},[more]);
    const act=async(action)=>{
      setBusy(true);setError('');
      try{
        const friendship=relation?.friendship;
        if(action==='block'||action==='unblock')await request(`/api/profiles/${person.id}/block`,{method:action==='block'?'POST':'DELETE'});
        else await request(friendship ? `/api/chat/friends/${friendship.friendship_id}${action==='accept'?'/accept':''}` : '/api/chat/friends',{method:action==='remove'?'DELETE':'POST',body:friendship?undefined:JSON.stringify({chainlens_id:person.id})});
        await refresh();window.dispatchEvent(new Event('cl-social-change'));setNotice(action==='block'?'User blocked':action==='unblock'?'User unblocked':'Friend list updated');setMore(false);
      }catch(err){setError(err.message);}finally{setBusy(false);}
    };
    const share=async(native)=>{try{const url=window.ChainLensProfiles.profileLink(person.id);if(native && navigator.share)await navigator.share({title:person.display_name,url});else{await navigator.clipboard.writeText(url);setNotice('Profile link copied');}setMore(false);}catch(err){if(err.name!=='AbortError')setError('Could not share this profile');}};
    const sendReport=async(event)=>{event.preventDefault();setBusy(true);setError('');try{await request(`/api/profiles/${person.id}/report`,{method:'POST',body:JSON.stringify({reason,details})});setReport(false);setNotice('Report submitted');}catch(err){setError(err.message);}finally{setBusy(false);}};
    const f=relation?.friendship,accepted=f?.status==='accepted',incoming=f && f.status!=='accepted' && f.incoming,pending=f && f.status!=='accepted' && !f.incoming;
    const allowed=!!authToken && relation?.interactionAllowed;
    return <div className="cl-public-controls" ref={root}>
      <button type="button" className="cl-profile-more" aria-label="More profile options" aria-haspopup="menu" aria-expanded={more} onClick={()=>setMore(v=>!v)}>•••</button>
      <button type="button" className="cl-profile-message" aria-label={`Message ${person.display_name}`} disabled={!allowed || !accepted || busy} title={accepted?'Message':'Add this person as a friend to message them'} onClick={()=>onMessage({...person,friendship_id:f.friendship_id})}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M20 11.5a8.5 8.5 0 0 1-12 7.8L3 21l1.7-5A8.5 8.5 0 1 1 20 11.5Z"/></svg></button>
      <button type="button" className="cl-profile-friend" disabled={!allowed || busy} aria-label={accepted?'Remove Friend':incoming?'Accept Request':pending?'Cancel Request':'Add Friend'} onClick={()=>act(accepted||pending?'remove':incoming?'accept':'add')}>{relation?.blocked?'Blocked':relation && !relation.interactionAllowed?'Unavailable':accepted?'Friends ✓':incoming?'Accept Request':pending?'Request Sent':'Add Friend'}</button>
      {incoming && <button type="button" disabled={busy} onClick={()=>act('remove')}>Decline</button>}
      {more && <div role="menu" aria-label="More profile options" className="cl-public-more-menu"><button role="menuitem" onClick={()=>share(true)}>Share Profile</button><button role="menuitem" onClick={()=>share(false)}>Copy Profile Link</button><button role="menuitem" disabled={!authToken || !relation || busy} onClick={()=>act(relation?.blocked?'unblock':'block')}>{relation?.blocked?'Unblock':'Block'}</button><button role="menuitem" disabled={!authToken} onClick={()=>{setMore(false);setError('');setReport(true);}}>Report</button>{!authToken && <p>Sign in to block or report.</p>}</div>}
      {(error||notice) && <p className="cl-profile-action-status" role="status">{error||notice}</p>}
      {report && <window.SocialModal title={`Report ${person.display_name}`} onClose={()=>setReport(false)}><form onSubmit={sendReport} className="cl-report-form"><label>Reason<select value={reason} onChange={e=>setReason(e.target.value)}><option value="spam">Spam</option><option value="harassment">Harassment</option><option value="impersonation">Impersonation</option><option value="other">Other</option></select></label><label>Details (optional)<textarea value={details} onChange={e=>setDetails(e.target.value)} maxLength={1000} rows={4}/></label>{error && <p role="alert">{error}</p>}<button disabled={busy}>{busy?'Submitting…':'Submit report'}</button></form></window.SocialModal>}
    </div>;
  };
  window.ProfileFriendRequests=function({profileId,authToken,onView}){
    const [incoming,setIncoming]=useState([]),[loading,setLoading]=useState(true),[error,setError]=useState(''),[busy,setBusy]=useState(null),[notice,setNotice]=useState('');
    const refreshRef=useRef(null),version=useRef(0),mutating=useRef(false);
    useEffect(()=>{
      let live=true;const controller=new AbortController();
      setIncoming([]);setLoading(true);setError('');setNotice('');
      const refresh=async()=>{
        if(mutating.current || document.visibilityState==='hidden')return;
        const requestVersion=++version.current;
        try{
          const response=await fetch('/api/chat/friends',{signal:controller.signal,cache:'no-store',headers:{Authorization:`Bearer ${authToken}`}});
          const data=await response.json();if(!response.ok)throw new Error(data.error||'Friend requests are unavailable.');
          if(!Array.isArray(data.incoming))throw new Error('Friend requests are unavailable.');
          if(live && requestVersion===version.current){setIncoming(data.incoming);setError('');}
        }catch(error){if(live && requestVersion===version.current && error.name!=='AbortError')setError(error.message);}
        finally{if(live && requestVersion===version.current)setLoading(false);}
      };
      refreshRef.current=refresh;refresh();const timer=setInterval(refresh,20000);
      window.addEventListener('focus',refresh);window.addEventListener('cl-social-change',refresh);
      return()=>{live=false;controller.abort();version.current++;refreshRef.current=null;clearInterval(timer);window.removeEventListener('focus',refresh);window.removeEventListener('cl-social-change',refresh);};
    },[profileId,authToken]);
    const act=async(person,accept)=>{
      if(mutating.current)return;mutating.current=true;version.current++;setBusy(person.friendship_id);setError('');setNotice('');
      try{
        const response=await fetch(`/api/chat/friends/${encodeURIComponent(person.friendship_id)}${accept?'/accept':''}`,{method:accept?'POST':'DELETE',headers:{Authorization:`Bearer ${authToken}`}});
        const data=await response.json();if(!response.ok)throw new Error(data.error||'Could not update the friend request.');
        if(!refreshRef.current)return;
        setIncoming(rows=>rows.filter(row=>row.friendship_id!==person.friendship_id));setNotice(accept?'Friend request accepted':'Friend request declined');
        mutating.current=false;window.dispatchEvent(new Event('cl-social-change'));
      }catch(error){if(refreshRef.current)setError(error.message);}
      finally{mutating.current=false;if(refreshRef.current)setBusy(null);}
    };
    return <section className="cl-profile-requests" aria-label="Friend requests">
      <h2>Friend requests{incoming.length>0 && <span>{incoming.length}</span>}</h2>
      {loading && <p role="status">Loading friend requests…</p>}
      {error && <div role="alert"><p>{error}</p><button type="button" onClick={()=>refreshRef.current?.()}>Retry</button></div>}
      {!loading && !error && !incoming.length && <p>No pending friend requests.</p>}
      <div className="cl-profile-request-list">{incoming.map(person=><article key={person.friendship_id}>
        <button type="button" className="cl-profile-request-person" onClick={()=>onView(person.id)} aria-label={`View profile of ${person.display_name}`}><window.ProfileAvatar profile={person} size={32}/><span><strong>{person.display_name||'ChainLens user'}</strong><code>{person.id}</code></span></button>
        <div className="cl-profile-request-actions"><button type="button" disabled={busy!==null} onClick={()=>act(person,true)} aria-label={`Accept friend request from ${person.display_name}`}>{busy===person.friendship_id?'Updating…':'Accept'}</button><button type="button" disabled={busy!==null} onClick={()=>act(person,false)} aria-label={`Decline friend request from ${person.display_name}`}>Decline</button></div>
      </article>)}</div>
      {notice && <p role="status">{notice}</p>}
    </section>;
  };
})();
