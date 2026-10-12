(function(){
  const {useState,useEffect,useRef}=React;
  window.useFavoriteArtworkSnapshots=function(profileId,authToken,favorites,assets){
    const sent=useRef(new Map());
    const signature=JSON.stringify(assets.filter(a=>!a.isToken && favorites.has(window.nftFavoriteKey(a))).map(a=>[window.nftFavoriteKey(a),a.name,a.image,a.imageSources]));
    useEffect(()=>{
      if(!profileId || !authToken)return;
      let subject;try{subject=JSON.parse(atob(authToken.split('.')[1].replace(/-/g,'+').replace(/_/g,'/'))).sub;}catch{return;}
      if(subject!==profileId)return;
      let cancelled=false,busy=false;
      const publish=async()=>{
        if(cancelled||busy||document.visibilityState!=='visible')return;busy=true;
        const rows=[...new Map(assets.filter(a=>!a.isToken && favorites.has(window.nftFavoriteKey(a))).map(a=>[window.nftFavoriteKey(a),{key:window.nftFavoriteKey(a),id:a.id,name:a.name,collection:a.collection,image:a.image,imageSources:a.imageSources}])).values()];
        for(let offset=0;offset<rows.length && !cancelled;offset+=100){
          const batch=rows.slice(offset,offset+100).filter(a=>sent.current.get(profileId+':'+a.key)!==JSON.stringify(a));
          if(!batch.length)continue;
          try{const res=await fetch('/api/profile/favorite-artwork',{method:'PUT',headers:{'Content-Type':'application/json',Authorization:`Bearer ${authToken}`},body:JSON.stringify({assets:batch})});
            const data=await res.json();if(res.ok && data.saved===batch.length && !cancelled)for(const a of batch)sent.current.set(profileId+':'+a.key,JSON.stringify(a));
          }catch{}
        }
        busy=false;
      };
      const timer=setTimeout(publish,1500),retry=setInterval(publish,30000);window.addEventListener('focus',publish);
      return()=>{cancelled=true;clearTimeout(timer);clearInterval(retry);window.removeEventListener('focus',publish);};
    },[profileId,authToken,signature]);
  };
  window.PublicProfileSettings=function({profile,authToken,onSave}){
    const [busy,setBusy]=useState(null),[notice,setNotice]=useState('');
    const [values,setValues]=useState({public_wallets:profile.public_wallets!==false,public_favorites:profile.public_favorites!==false});
    useEffect(()=>setValues({public_wallets:profile.public_wallets!==false,public_favorites:profile.public_favorites!==false}),[profile.id,profile.public_wallets,profile.public_favorites]);
    const save=async(key,value)=>{
      setBusy(key);setNotice('');setValues(current=>({...current,[key]:value}));
      try{const res=await fetch('/api/profile',{method:'PATCH',headers:{'Content-Type':'application/json',Authorization:`Bearer ${authToken}`},body:JSON.stringify({[key]:value})});const data=await res.json();if(!res.ok)throw new Error(data.error || 'Could not save visibility');onSave({[key]:value},profile.id);setNotice('Public profile updated');}
      catch(error){setValues(current=>({...current,[key]:profile[key]!==false}));setNotice(error.message);}finally{setBusy(null);}
    };
    return <section className="cl-public-settings" aria-label="Public profile visibility"><h2>Public profile</h2>
      <p>Choose what people see on your profile link.</p>
      <label><input type="checkbox" checked={values.public_favorites} disabled={!!busy} onChange={e=>save('public_favorites',e.target.checked)}/> Display favorited NFTs <small>Uses favorites synced with Magic Money.</small></label>
      <label><input type="checkbox" checked={values.public_wallets} disabled={!!busy} onChange={e=>save('public_wallets',e.target.checked)}/> Display linked wallets</label>
      <a href={`/${profile.id}`} target="_blank" rel="noopener noreferrer">Your profile link ↗</a>{notice && <p role="status">{notice}</p>}
    </section>;
  };
  window.PublicFavoriteGallery=function({id,visible}){
    const [state,setState]=useState({assets:[],loading:true,nextOffset:null}),[selected,setSelected]=useState(null),[epoch,setEpoch]=useState(0);
    useEffect(()=>{
      if(!visible){setState({assets:[],hidden:true,loading:false});return;}
      const controller=new AbortController();
      const load=async()=>{
        try{const res=await fetch(`/api/profiles/${id}/favorites`,{signal:controller.signal,cache:'no-store'});const body=await res.json();if(!res.ok || !Array.isArray(body.assets))throw new Error(body.error || 'Favorite NFTs are unavailable');setState({...body,loading:false});}
        catch(error){if(error.name!=='AbortError')setState(s=>({...s,error:error.message,loading:false}));}
      };
      load();const refresh=()=>{if(document.visibilityState==='visible')load();};const timer=setInterval(refresh,30000);window.addEventListener('focus',refresh);
      return()=>{controller.abort();clearInterval(timer);window.removeEventListener('focus',refresh);};
    },[id,visible,epoch]);
    const more=async()=>{
      setState(s=>({...s,loadingMore:true}));
      try{const res=await fetch(`/api/profiles/${id}/favorites?offset=${state.nextOffset}`);const body=await res.json();if(!res.ok)throw new Error(body.error);setState(s=>({...body,assets:[...s.assets,...body.assets],loading:false}));}
      catch(error){setState(s=>({...s,error:error.message,loadingMore:false}));}
    };
    return <section className="cl-public-gallery" aria-label="Favorited NFTs"><div className="cl-gallery-heading"><h2>Favorited NFTs {state.total ? <span>· {state.total}</span> : null}</h2><button type="button" onClick={()=>setEpoch(v=>v+1)}>Refresh</button></div>
      {state.hidden ? <p>This gallery is private.</p> : state.loading ? <p role="status">Loading favorite NFTs…</p> : state.error ? <p role="alert">{state.error}</p> : state.assets.length===0 ? <p>No favorited NFTs yet.</p> : <div className="cl-favorite-grid">{state.assets.map(asset=><button type="button" key={asset.key} onClick={()=>setSelected(asset)} aria-label={`View ${asset.name}`}><div className="cl-favorite-art"><window.NftArtwork asset={asset} className="w-full h-full object-contain"/></div><strong>{asset.name}</strong><small>{asset.collection || asset.chain}</small>{asset.metadataStatus==='unavailable' && <small>Artwork unavailable · refresh to retry</small>}</button>)}</div>}
      {state.nextOffset!==null && state.nextOffset!==undefined && <button className="cl-load-more" disabled={state.loadingMore} onClick={more}>{state.loadingMore?'Loading…':'Load more'}</button>}
      {selected && <window.SocialModal title={selected.name} onClose={()=>setSelected(null)}><div className="cl-favorite-detail"><window.NftArtwork asset={selected} preview={false} className="w-full h-full object-contain"/><p>{selected.collection} · {selected.chain}</p><code>{selected.key}</code></div></window.SocialModal>}
    </section>;
  };
})();
