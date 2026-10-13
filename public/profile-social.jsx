(function () {
  const { useState, useEffect, useRef } = React;
  const { profileLink } = window.ChainLensProfiles;
  window.ProfileActions = function ({ person, userProfile, authToken, onView, onMessage, onChange }) {
    const [open, setOpen] = useState(false);
    const [relations, setRelations] = useState(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [notice, setNotice] = useState('');
    const root = useRef(null);
    const menu = useRef(null);
    const [position, setPosition] = useState({ left: 16, top: 16 });
    const own = person.id === userProfile?.id;
    const request = async (url, options = {}) => {
      const res = await fetch(url, { ...options, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` } });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not update friendship');
      return data;
    };
    useEffect(() => {
      if (!open) return;
      const close = event => { if (!root.current?.contains(event.target) && !menu.current?.contains(event.target)) setOpen(false); };
      const key = event => {
        if (event.key === 'Escape') { setOpen(false); root.current?.querySelector('button')?.focus(); }
        if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key) && menu.current?.contains(document.activeElement)) {
          event.preventDefault();
          const items = [...menu.current.querySelectorAll('button:not(:disabled)')];
          const i = items.indexOf(document.activeElement);
          const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : (i + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
          items[next]?.focus();
        }
      };
      document.addEventListener('pointerdown', close); document.addEventListener('keydown', key);
      return () => { document.removeEventListener('pointerdown', close); document.removeEventListener('keydown', key); };
    }, [open]);
    useEffect(() => {
      if (!open || !authToken || own) return;
      let cancelled = false;
      setRelations(null); setError('');
      request('/api/chat/friends').then(data => { if (!cancelled) setRelations(data); }).catch(err => { if (!cancelled) setError(err.message); });
      return () => { cancelled = true; };
    }, [open, authToken, person.id]);
    const friend = relations?.friends?.find(row => row.id === person.id);
    const incoming = relations?.incoming?.find(row => row.id === person.id);
    const outgoing = relations?.outgoing?.find(row => row.id === person.id);
    const act = async (action, row) => {
      setBusy(true); setError('');
      try {
        await request(row ? `/api/chat/friends/${row.friendship_id}${action === 'accept' ? '/accept' : ''}` : '/api/chat/friends', {
          method: action === 'remove' ? 'DELETE' : 'POST', body: row ? undefined : JSON.stringify({ chainlens_id: person.id }),
        });
        onChange?.(); setRelations(await request('/api/chat/friends')); setNotice('Friend list updated');
      } catch (err) { setError(err.message); } finally { setBusy(false); }
    };
    const copy = async text => { try { await navigator.clipboard.writeText(text); setNotice('Copied'); } catch { setError('Could not copy. Try your browser’s copy command.'); } };
    const toggle = () => {
      const rect = root.current.getBoundingClientRect();
      setPosition({ left: Math.max(12, Math.min(rect.left, window.innerWidth - 232)), top: Math.max(12, rect.bottom + 340 > window.innerHeight ? rect.top - 340 : rect.bottom + 5) });
      setOpen(value => !value); setNotice('');
    };
    return <div className="cl-person-actions" ref={root}>
      <button type="button" aria-expanded={open} aria-haspopup="menu" onClick={toggle} onKeyDown={event => { if (event.key === 'ArrowDown') { event.preventDefault(); if (!open) toggle(); requestAnimationFrame(() => menu.current?.querySelector('button')?.focus()); } }} className="cl-person-name">{person.display_name || 'ChainLens user'} <span aria-hidden="true">⌄</span></button>
      {open && ReactDOM.createPortal(<div ref={menu} className="cl-person-menu" role="menu" style={{ ...position, position: 'fixed', width: 220, maxHeight: Math.min(340, window.innerHeight - 24), overflowY: 'auto' }} aria-label={`${person.display_name || 'User'} options`}>
        <button role="menuitem" onClick={() => { setOpen(false); onView(person.id); }}>View Profile</button>
        {!own && authToken && relations && <>
          {friend && <button role="menuitem" onClick={() => { setOpen(false); onMessage(friend); }}>Message</button>}
          {friend ? <button role="menuitem" disabled={busy} onClick={() => act('remove', friend)}>Remove Friend</button>
            : incoming ? <><button role="menuitem" disabled={busy} onClick={() => act('accept', incoming)}>Accept Request</button><button role="menuitem" disabled={busy} onClick={() => act('remove', incoming)}>Decline Request</button></>
            : outgoing ? <button role="menuitem" disabled={busy} onClick={() => act('remove', outgoing)}>Cancel Request</button>
            : <button role="menuitem" disabled={busy} onClick={() => act('add')}>Add Friend</button>}
        </>}
        {!own && authToken && !relations && !error && <p>Loading friendship…</p>}
        {!own && !authToken && <p>Sign in to add friends.</p>}
        <button role="menuitem" onClick={() => copy(person.id)}>Copy ID</button>
        <button role="menuitem" onClick={() => copy(profileLink(person.id))}>Copy Profile Link</button>
        {(error || notice) && <p role="status">{error || notice}</p>}
      </div>, document.body)}
    </div>;
  };
  window.PublicProfile = function ({ id, userProfile, authToken, onView, onMessage }) {
    const [state, setState] = useState({ loading: true });
    useEffect(() => {
      const controller = new AbortController(); setState({ loading: true });
      fetch(`/api/profiles/${encodeURIComponent(id)}`, { signal: controller.signal }).then(async res => {
        const data = await res.json(); if (!res.ok) throw new Error(data.error || 'Profile unavailable'); return data;
      }).then(profile => setState({ profile })).catch(error => { if (error.name !== 'AbortError') setState({ error: error.message }); });
      return () => controller.abort();
    }, [id]);
    return <section className="cl-public-profile cl-art-panel" aria-label="Public profile">
      {state.loading ? <p role="status">Loading profile…</p> : state.error ? <p role="alert">{state.error}</p> : <>
        <div className="cl-public-banner" style={state.profile.banner_url ? { backgroundImage: `url(${JSON.stringify(state.profile.banner_url)})` } : undefined} />
        <div className="cl-public-identity">
          <window.ProfileAvatar profile={state.profile} size={100} />
          <small>CHAINLENS PROFILE</small><h1>{state.profile.display_name}</h1>
          <window.PublicProfileControls person={state.profile} authToken={authToken} onMessage={onMessage} />
          <PublicProfileId id={state.profile.id} />
          {state.profile.public_wallets !== false && <details className="cl-public-wallets"><summary>Linked wallets · {(state.profile.wallets || []).length}</summary>{(state.profile.wallets || []).map((wallet,index)=><PublicWalletAddress key={`${wallet.chain}:${wallet.address}:${index}`} wallet={wallet} />)}{!(state.profile.wallets || []).length && <p>No linked wallets.</p>}</details>}
        </div>
        <window.PublicFavoriteGallery key={id} id={id} visible={state.profile.public_favorites !== false} />
      </>}
    </section>;
  };
  function PublicWalletAddress({wallet}) {
    const [copied,setCopied]=useState(false),[error,setError]=useState('');
    const timer=useRef(null);
    useEffect(()=>()=>clearTimeout(timer.current),[]);
    const copy=async()=>{
      setError('');
      try {
        await navigator.clipboard.writeText(wallet.address);
        setCopied(true);clearTimeout(timer.current);timer.current=setTimeout(()=>setCopied(false),1800);
      } catch {setCopied(false);setError('Could not copy address. Try your browser’s copy command.');}
    };
    return <div><strong>{wallet.label || wallet.chain}{wallet.watch_only?' · Watch-only':''}</strong>
      <button type="button" className="cl-wallet-copy" aria-label={`Copy ${wallet.label || wallet.chain} address`} onClick={copy}><code>{wallet.address}</code><span aria-live="polite">{copied?'Copied ✓':'Copy'}</span></button>
      {error && <p role="status">{error}</p>}
    </div>;
  }
  function PublicProfileId({id}) {
    const [copied,setCopied]=useState(false),[error,setError]=useState('');
    return <><button type="button" className="profile-banner-id cl-public-id" aria-label="Copy ChainLens ID" onClick={async()=>{try{await navigator.clipboard.writeText(id);setCopied(true);setTimeout(()=>setCopied(false),1800);}catch{setError('Could not copy ID');}}}><span className="profile-id-label">ChainLens ID</span><span>{id}</span><b>{copied?'Copied ✓':'Copy'}</b></button>{error && <p role="status">{error}</p>}</>;
  }
})();
