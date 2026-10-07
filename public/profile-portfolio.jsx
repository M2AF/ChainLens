// Session-owned data, independent of scanner selections and tab mounting.
(function () {
  const { useState, useEffect, useMemo, useRef } = React;
  const artworkLoader = window.nftImage.createLoader();
  window.NftArtwork = function ({ asset, preview = true, className }) {
    const identity = window.nftFavoriteKey(asset);
    const [retryEpoch,setRetryEpoch] = useState(0);
    const [repairedArt, setRepairedArt] = useState(null);
    const candidates = window.nftImage.sources(repairedArt?.identity === identity ? {...asset,...repairedArt.artwork} : asset, preview);
    const signature = JSON.stringify(candidates);
    const element = useRef(null);
    const [active, setActive] = useState(!preview);
    const [result, setResult] = useState({signature:'',url:'',status:'loading'});
    useEffect(() => {
      if (active || !element.current) return;
      const observer = new IntersectionObserver(entries => {
        if (entries.some(entry => entry.isIntersecting)) { setActive(true); observer.disconnect(); }
      }, {rootMargin:'200px'});
      observer.observe(element.current);
      return () => observer.disconnect();
    }, [active]);
    useEffect(() => {
      if (!active) return;
      if (result.identity !== identity && element.current) element.current.src = '/profile-art-fallback.svg';
      return artworkLoader.load(candidates, value => setResult(previous => ({...value,signature,identity,url:value.url || (previous.identity === identity ? previous.url : '')})), element.current);
    }, [active, signature, retryEpoch, identity]);
    useEffect(() => {
      const retry = event => {
        if (event.detail !== identity) return;
        artworkLoader.forget(candidates); setRetryEpoch(n => n+1);
      };
      window.addEventListener('nft-art-retry',retry);
      return () => window.removeEventListener('nft-art-retry',retry);
    }, [identity,signature]);
    useEffect(() => {
      if (!active || !(asset.artRepairPending || retryEpoch || result.status === 'failed') || !(asset.chain === 'solana' && /^[1-9A-HJ-NP-Za-km-z]{32,64}$/.test(asset.id || '') || /^0x[0-9a-f]{40}$/i.test(asset.contractAddress || '') && /^\d{1,78}$/.test(String(asset.tokenId)))) return;
      let cancelled = false, timer, attempts = 0;
      const check = async () => {
        try {
          const data = await window.nftImage.readRepair(asset,(retryEpoch > 0 || result.status === 'failed') && attempts === 0);
          if (cancelled) return;
          if (data.artwork) setRepairedArt({identity,artwork:data.artwork});
          if (data.pending && ++attempts < 60) timer = setTimeout(check,5000);
        } catch {}
      };
      check();
      return () => { cancelled = true; clearTimeout(timer); };
    }, [active, asset.chain, asset.contractAddress, asset.tokenId, asset.artRepairPending, retryEpoch, result.status]);
    const current = result.identity === identity ? result : {url:'',status:'loading'};
    // The loader owns src on this displayed node. A constant React src avoids
    // reassigning a just-decoded URL and refetching gateways with no-store.
    return <img ref={element} className={className} src="/profile-art-fallback.svg" alt={asset.name || 'NFT'} title={asset.media?.status === 'missing-metadata' ? 'No artwork URI published by this token; Retry artwork can check again.' : undefined} decoding="async" data-art-status={current.status} />;
  };
  window.ProfileBanner = function ({ profile, identity, profileId, authFetch, onSave }) {
    const [busy, setBusy] = useState(false), [error, setError] = useState('');
    const input = React.useRef(null);
    const save = async value => {
      setBusy(true); setError('');
      try {
        const response = await authFetch('/api/profile', { method: 'PATCH', body: JSON.stringify({ banner_url: value }) });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Could not save banner');
        onSave(profile.id, data.banner_url ?? value);
      } catch(e) { setError(e.message); } finally { setBusy(false); }
    };
    const upload = async event => {
      const file = event.target.files?.[0]; event.target.value = '';
      if (!file) return;
      if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 10 * 1024 * 1024) { setError('Choose a JPG, PNG or WebP under 10 MB.'); return; }
      setBusy(true); setError('');
      const url = URL.createObjectURL(file);
      try {
        const image = new Image(); image.src = url; await image.decode();
        const canvas = document.createElement('canvas'); canvas.width = 1500; canvas.height = 500;
        const width = Math.min(image.width, image.height * 3), height = width / 3;
        canvas.getContext('2d').drawImage(image, (image.width-width)/2, (image.height-height)/2, width, height, 0, 0, 1500, 500);
        await save(canvas.toDataURL('image/jpeg', .86));
      } catch(e) { setError('Could not read this image.'); setBusy(false); } finally { URL.revokeObjectURL(url); }
    };
    return <><div className="profile-banner">{profile.banner_url && <img src={profile.banner_url} alt="Profile banner" />}<div className="profile-banner-caption">{identity}</div><div className="profile-banner-tools"><button disabled={busy} onClick={() => input.current.click()}>{busy ? 'Saving…' : 'Edit banner · 3:1'}</button>{profile.banner_url && <button disabled={busy} onClick={() => save('')}>Remove</button>}</div><input ref={input} type="file" aria-label="Upload profile banner" hidden accept="image/png,image/jpeg,image/webp" onChange={upload}/></div>{profileId}{error && <p role="alert" className="profile-banner-error">{error}</p>}</>;
  };
  window.useProfilePortfolio = function (profile, token, active = false) {
    const [state, setState] = useState({ owner: null, assets: [], loading: false, issues: [] });
    let subject;
    try { subject = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).sub; } catch {}
    const owner = profile?.id && token && subject === profile.id ? profile.id : null;
    const wallets = profile?.cl_wallets || [];
    const session = useRef(null);
    if (!session.current || session.current.owner !== owner) {
      session.current?.cache.clear();
      session.current = { owner, cache: window.NftSession.create({
        key: window.nftFavoriteKey,
        maxAgeMs: 5 * 60 * 1000,
        normalize: nft => ({ ...nft, metadata: { ...nft.metadata, traits: window.nftMetadata.traits(nft.metadata?.traits) } })
      }) };
    }
    const cache = session.current.cache;
    const [refreshEpoch, setRefreshEpoch] = useState(0);
    useEffect(() => {
      if (!active) return;
      const refresh = () => { if (document.visibilityState === 'visible') setRefreshEpoch(n => n + 1); };
      window.addEventListener('focus', refresh);
      document.addEventListener('visibilitychange', refresh);
      const timer = setInterval(refresh, 5 * 60 * 1000);
      return () => { window.removeEventListener('focus', refresh); document.removeEventListener('visibilitychange', refresh); clearInterval(timer); };
    }, [active]);
    useEffect(() => { artworkLoader.clear(); }, [owner]);
    const signature = JSON.stringify(wallets.map(w => [w.chain, w.address]).sort());
    useEffect(() => {
      if (!owner || !token) { setState({ owner: null, assets: [], loading: false, issues: [] }); return; }
      let cancelled = false;
      const targets = new Map();
      for (const wallet of wallets) {
        const chains = wallet.chain === 'evm' ? window.ChainLensChains.EVM_CHAINS : window.ChainLensChains.DEFAULT_CHAINS.filter(c => c.id === wallet.chain);
        for (const chain of chains) targets.set(`${chain.id}:${wallet.chain === 'evm' ? wallet.address.toLowerCase() : wallet.address}`, { chain: chain.id, address: wallet.address });
      }
      setState(s => ({ owner, assets: s.owner === owner ? s.assets : [], loading: targets.size > 0, issues: [] }));
      const queue = [...targets.values()];
      const found = new Map();
      const issues = [];
      const publish = loading => {
        if (cancelled) return;
        setState(s => {
          const retained = new Map((s.owner === owner ? s.assets : []).map(a => [window.nftFavoriteKey(a), a]));
          for (const [key, asset] of found) retained.set(key, asset);
          return { owner, assets: [...retained.values()], loading, issues: [...issues] };
        });
      };
      async function worker() {
        while (queue.length && !cancelled) {
          const { chain, address } = queue.shift();
          try {
            await cache.load(chain, address, assets => {
              if (cancelled) return;
              for (const nft of assets) found.set(window.nftFavoriteKey(nft), nft);
              publish(true);
            });
          } catch (e) { if (!cancelled) { issues.push(`${chain} · ${address.slice(0, 8)}…: ${e.message}`); publish(true); } }
        }
      }
      Promise.all(Array.from({ length: Math.min(6, queue.length) }, worker)).then(() => publish(false));
      return () => { cancelled = true; };
    }, [owner, token, signature, active, refreshEpoch]);
    return { ...(owner && state.owner === owner && token ? state : { assets: [], loading: false, issues: [] }), cache };
  };
  const category = asset => {
    const tag = window.nftMetadata.traits(asset.metadata?.traits).find(t => /^(category|type)$/i.test(t.trait_type))?.value;
    const raw = String(asset.category || asset.collection?.category || tag || '').toLowerCase();
    if (/pfp|profile/.test(raw)) return 'PFPs';
    if (/gam(e|ing)/.test(raw)) return 'Gaming';
    if (/music/.test(raw)) return 'Music';
    if (/member|utility/.test(raw)) return 'Memberships';
    if (/art/.test(raw)) return 'Art';
    return 'Collectibles';
  };
  window.ProfilePortfolio = function ({ portfolio, favorites, toggleFavorite, onSelect, resolveImg, darkMode, filterEntries, toggleSpam }) {
    const [tab, setTab] = useState('Overview'), [filter, setFilter] = useState('All'), [search, setSearch] = useState(''), [chain, setChain] = useState('all');
    const isSpam = a => window.nftSpam.isSpam(a, filterEntries[window.nftFavoriteKey(a)]);
    const spamCount = portfolio.assets.filter(isSpam).length;
    const assets = useMemo(() => portfolio.assets.filter(a => (tab === 'Spam' ? isSpam(a) : !isSpam(a)) && (tab !== 'Favorites' || favorites.has(window.nftFavoriteKey(a))) && (filter === 'All' || category(a) === filter) && (chain === 'all' || chain === a.chain) && `${a.name || ''} ${a.collectionName || (typeof a.collection === 'string' ? a.collection : a.collection?.name) || ''}`.toLowerCase().includes(search.toLowerCase())).sort((a,b) => Number(favorites.has(window.nftFavoriteKey(b))) - Number(favorites.has(window.nftFavoriteKey(a))) || window.nftFloor.compare(a,b)), [portfolio.assets, filterEntries, favorites, tab, filter, search, chain]);
    const groups = useMemo(() => {
      const map = new Map();
      for (const asset of assets) {
        const name = asset.collectionName || (typeof asset.collection === 'string' ? asset.collection : asset.collection?.name) || asset.name || 'Untitled NFT';
        const contract = asset.contractAddress || (asset.chain === 'solana' ? asset.collectionId : asset.chain === 'cardano' ? String(asset.id || '').slice(0,56) : null);
        const id = `${asset.chain}:${contract || name}`;
        if (!map.has(id)) map.set(id, { id, name, assets: [] });
        map.get(id).assets.push(asset);
      }
      const groups = [...map.values()];
      for (const group of groups) {
        const stem = group.assets[0].name?.replace(/\s*#\d+.*$/,'');
        if (group.assets.length>1 && group.name===group.assets[0].name && stem && group.assets.every(a=>a.name?.replace(/\s*#\d+.*$/,'')===stem)) group.name=stem;
        group.favorite = group.assets.some(a => favorites.has(window.nftFavoriteKey(a)));
        group.floorPriceUsd = group.assets.map(window.nftFloor.usd).filter(n => n !== null).sort((a,b) => b-a)[0] ?? null;
      }
      return groups.sort((a,b) => Number(b.favorite) - Number(a.favorite) || window.nftFloor.compare(a,b));
    }, [assets, favorites]);
    const tiles = tab !== 'Overview' ? assets.map(a => ({ id: window.nftFavoriteKey(a), name: a.name || 'Untitled NFT', floorPriceUsd: window.nftFloor.usd(a), assets: [a] })) : groups.flatMap(group => {
      const chunks = [];
      for (let offset=0; offset<group.assets.length; offset+=4) chunks.push({...group,id:`${group.id}:${offset}`,assets:group.assets.slice(offset,offset+4),total:group.assets.length,offset});
      return chunks;
    });
    const viewerAssets = tiles.flatMap(tile => tile.assets);
    return <section className="profile-gallery" aria-label="Profile NFT portfolio">
      <div className="profile-tabs">{['Overview', 'Holdings', 'Favorites', 'Spam'].map(t => <button key={t} aria-pressed={tab === t} onClick={() => setTab(t)}>{t === 'Spam' ? `Spam (${spamCount})` : t}</button>)}<span>{portfolio.assets.length} NFTs · {new Set(portfolio.assets.map(a => a.chain)).size} chains</span></div>
      <div className="profile-gallery-tools"><input aria-label="Search profile NFTs" placeholder="Search your collection…" value={search} onChange={e => setSearch(e.target.value)} /><select aria-label="Filter profile chain" value={chain} onChange={e => setChain(e.target.value)}><option value="all">All chains</option>{[...new Set(portfolio.assets.map(a => a.chain))].map(c => <option key={c}>{c}</option>)}</select></div>
      <div className="profile-categories">{['All', ...new Set(portfolio.assets.map(category))].map(c => <button key={c} aria-pressed={filter === c} onClick={() => setFilter(c)}>{c}</button>)}</div>
      <p className="profile-load-status">Highest floor first · USD · favorites pinned</p>
      {portfolio.loading && <p role="status" className="profile-load-status">Loading linked wallets… {portfolio.assets.length} NFTs ready</p>}
      {!!portfolio.issues.length && <details className="profile-load-status"><summary>{portfolio.issues.length} sources unavailable · loaded NFTs retained</summary>{portfolio.issues.map((issue,i) => <p key={i}>{issue}</p>)}</details>}
      {!tiles.length && <div className="profile-empty">{portfolio.loading ? 'Your collection is taking shape…' : search || filter !== 'All' || tab === 'Favorites' || tab === 'Spam' ? 'No NFTs match this view.' : 'Your linked-wallet NFTs will appear here.'}</div>}
      <div className="profile-mosaic">{tiles.map((tile,index) => <article key={tile.id} className={`profile-tile ${tile.assets.length === 2 ? 'profile-tile-pair' : ''} ${index % 7 === 4 ? 'profile-tile-tall' : ''}`}>
        <div className={`profile-tile-media ${tile.assets.length > 1 ? `profile-quilt profile-quilt-${tile.assets.length}` : ''}`}>{tile.assets.map(asset => {
          const key = window.nftFavoriteKey(asset);
          return <div className="profile-art" key={key}><button className="profile-art-open" aria-label={`View ${asset.name || 'NFT'}`} onClick={() => onSelect(asset,viewerAssets)}><window.NftArtwork asset={asset} /></button><button className="profile-star" aria-label={`${favorites.has(key) ? 'Unfavorite' : 'Favorite'} ${asset.name || 'NFT'}`} aria-pressed={favorites.has(key)} onClick={() => toggleFavorite(asset)}>{favorites.has(key) ? '★' : '☆'}</button><button className="profile-spam" title={isSpam(asset) ? 'Not spam' : 'Mark as spam'} aria-label={`${isSpam(asset) ? 'Not spam' : 'Mark as spam'} ${asset.name || 'NFT'}`} onClick={e => toggleSpam(e, asset)}>{isSpam(asset) ? '↩' : '🚫'}</button></div>;
        })}</div><div className="profile-tile-caption"><strong>{tile.name}</strong><span>{window.nftFloor.label(tile)}</span><span>{tile.assets[0].chain} · {tile.total > 4 ? `${tile.offset+1}–${tile.offset+tile.assets.length} of ${tile.total} items` : tile.assets.length > 1 ? `${tile.assets.length} items` : category(tile.assets[0])}</span></div>
      </article>)}</div>
    </section>;
  };

  window.AssetViewer = function ({asset, assets, onChange, onClose, darkMode, chainStyles, resolveImg, fallback, download}) {
    const dialog = useRef(null);
    const index = assets.findIndex(a => window.nftFavoriteKey(a) === window.nftFavoriteKey(asset));
    const previous = index > 0, next = index >= 0 && index < assets.length-1;
    const move = direction => { const target = assets[index+direction]; if (target) onChange(target); };
    useEffect(() => {
      const focus = document.activeElement, overflow = document.body.style.overflow;
      document.body.style.overflow='hidden'; dialog.current?.querySelector('[aria-label="Close asset viewer"]')?.focus();
      return () => { document.body.style.overflow=overflow; if (focus?.isConnected) focus.focus(); };
    }, []);
    useEffect(() => {
      const keydown = event => {
        if (event.key==='Escape') { event.preventDefault(); onClose(); }
        if (/^(INPUT|TEXTAREA|SELECT)$/.test(event.target.tagName)) return;
        if (event.key==='ArrowLeft' || event.key==='ArrowRight') { event.preventDefault(); move(event.key==='ArrowLeft'?-1:1); }
        if (event.key==='Tab') {
          const controls = [...dialog.current.querySelectorAll('button:not(:disabled),a[href]')].filter(el=>el.getClientRects().length);
          const first=controls[0], last=controls[controls.length-1];
          if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}
          else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}
        }
      };
      document.addEventListener('keydown',keydown);return ()=>document.removeEventListener('keydown',keydown);
    }, [index,assets,onClose]);
    const collection = asset.collectionName || (typeof asset.collection==='string' ? asset.collection : asset.collection?.name) || (asset.isToken ? asset.symbol : asset.name?.replace(/\s*#\d+.*$/,'')) || 'Your collection';
    const traits = window.nftMetadata.traits(asset.metadata?.traits);
    return <div className="asset-viewer-backdrop modal-enter" onClick={event=>{if(event.target===event.currentTarget)onClose();}}>
      <div ref={dialog} className={`asset-viewer ${darkMode?'asset-viewer-dark':''}`} role="dialog" aria-modal="true" aria-labelledby="asset-viewer-title">
        <header className="asset-viewer-header"><span>{collection}</span><span className="asset-viewer-position" aria-live="polite">{index>=0?`${index+1} / ${assets.length}`:'Asset details'}</span><button aria-label="Close asset viewer" onClick={onClose}>✕</button></header>
        <div className="asset-viewer-body"><div className="asset-viewer-stage">
          {asset.isToken ? <img src={resolveImg(asset.image,asset.symbol)} alt={asset.name} className="w-full" onError={event=>{event.currentTarget.onerror=null;event.currentTarget.src=fallback(asset.symbol,asset.chain);}}/> : <window.NftArtwork key={window.nftFavoriteKey(asset)} asset={asset} preview={false} className="w-full"/>}
          {assets.length>1 && <><button className="asset-viewer-arrow asset-viewer-prev" aria-label="Previous asset" disabled={!previous} onClick={()=>move(-1)}>‹</button><button className="asset-viewer-arrow asset-viewer-next" aria-label="Next asset" disabled={!next} onClick={()=>move(1)}>›</button></>}
        </div><div className="asset-viewer-info">
          <span className="asset-viewer-chain" style={{background:chainStyles[asset.chain]?.background||'#64748b',color:chainStyles[asset.chain]?.foreground||'#fff'}}>{chainStyles[asset.chain]?.label||asset.chain}</span>
          <h1 id="asset-viewer-title">{asset.name || 'Untitled NFT'}</h1>
          {!asset.isToken && <p className="asset-viewer-floor">{window.nftFloor.label(asset)}</p>}
          {asset.metadata?.description && <p className="asset-viewer-description">{asset.metadata.description}</p>}
          {asset.isToken && <div className="asset-viewer-values"><div><small>Quantity</small><strong>{asset.balance}</strong></div><div><small>Value USD</small><strong>${asset.totalValue}</strong></div></div>}
          <h3>Attributes</h3><div className="asset-viewer-traits">{traits.length?traits.map((t,i)=><div key={i}><small>{t.trait_type}</small><strong>{t.value}</strong></div>):<p>No metadata found.</p>}</div>
          {asset.media?.status==='missing-metadata' && <p className="asset-viewer-description">This token has not published an artwork URI. You can retry to check for an update.</p>}
          <div className="asset-viewer-actions">{!asset.isToken && <><button className="asset-viewer-download" onClick={()=>download(dialog.current?.querySelector('img[data-art-status="loaded"]')?.currentSrc || window.nftImage.sources(asset,false)[0],asset.name)}>↓ Download Image</button><button onClick={()=>window.dispatchEvent(new CustomEvent('nft-art-retry',{detail:window.nftFavoriteKey(asset)}))}>Retry artwork</button></>}<button onClick={onClose}>Back to Gallery</button></div>
        </div></div>
      </div>
    </div>;
  };
})();
