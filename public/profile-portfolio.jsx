// Session-owned data, independent of scanner selections and tab mounting.
(function () {
  const { useState, useEffect, useMemo, useRef } = React;
  window.ProfileBanner = function ({ profile, authFetch, onSave }) {
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
    return <><div className="profile-banner">{profile.banner_url && <img src={profile.banner_url} alt="Profile banner" />}<div className="profile-banner-caption"><small>Your multichain collection</small><h1>{profile.display_name}'s gallery</h1></div><div className="profile-banner-tools"><button disabled={busy} onClick={() => input.current.click()}>{busy ? 'Saving…' : 'Edit banner · 3:1'}</button>{profile.banner_url && <button disabled={busy} onClick={() => save('')}>Remove</button>}</div><input ref={input} type="file" aria-label="Upload profile banner" hidden accept="image/png,image/jpeg,image/webp" onChange={upload}/></div>{error && <p role="alert" className="profile-banner-error">{error}</p>}</>;
  };
  window.useProfilePortfolio = function (profile, token) {
    const [state, setState] = useState({ owner: null, assets: [], loading: false, issues: [] });
    let subject;
    try { subject = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).sub; } catch {}
    const owner = profile?.id && token && subject === profile.id ? profile.id : null;
    const wallets = profile?.cl_wallets || [];
    const previews = useRef({ owner: null, images: new Map(), queue: [], active: 0 });
    useEffect(() => {
      if (previews.current.owner !== owner) {
        for (const image of previews.current.images.values()) if (image) { clearTimeout(image.previewTimer); image.onload = image.onerror = null; image.src = ''; }
        previews.current = { owner, images: new Map(), queue: [], active: 0 };
      }
      const cache = previews.current;
      for (const asset of state.owner === owner ? state.assets : []) {
        const url = asset.thumbnailUrl || asset.image;
        if (url && !cache.images.has(url)) { cache.images.set(url, null); cache.queue.push(url); }
      }
      const drain = () => {
        while (cache.active < 6 && cache.queue.length && previews.current === cache) {
          const url = cache.queue.shift(), image = new Image(); cache.images.set(url, image); cache.active++;
          let done = false;
          const finish = () => { if (done) return; done = true; clearTimeout(timer); cache.active--; drain(); };
          const timer = setTimeout(finish, 15000); image.previewTimer = timer; image.onload = finish; image.onerror = finish; image.src = url;
        }
      };
      drain();
    }, [owner, state.assets]);
    const signature = JSON.stringify(wallets.map(w => [w.chain, w.address]).sort());
    useEffect(() => {
      if (!owner || !token) { setState({ owner: null, assets: [], loading: false, issues: [] }); return; }
      let cancelled = false;
      const controller = new AbortController();
      const request = async url => {
        const child = new AbortController();
        const cancel = () => child.abort();
        controller.signal.addEventListener('abort', cancel, { once: true });
        const timer = setTimeout(cancel, 30000);
        try {
          const response = await fetch(url, { signal: child.signal });
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          return await response.json();
        } finally { clearTimeout(timer); controller.signal.removeEventListener('abort', cancel); }
      };
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
            let cursor = '', seen = new Set();
            do {
            const body = await request(`/api/nfts/${chain}/${encodeURIComponent(address)}${cursor ? `?pageKey=${encodeURIComponent(cursor)}` : ''}`);
            if (body.error) throw new Error(body.error);
            for (const asset of body.nfts || []) {
              const nft = { ...asset, chain: asset.chain || chain, isToken: false,
                metadata: { ...asset.metadata, traits: window.nftMetadata.traits(asset.metadata?.traits) } };
              found.set(window.nftFavoriteKey(nft), nft);
            }
            publish(true);
            cursor = body.nextPageKey ? String(body.nextPageKey) : '';
            if (cursor && seen.has(cursor)) throw new Error('Provider repeated a pagination cursor');
            seen.add(cursor);
            } while (cursor && !cancelled);
          } catch (e) { if (!cancelled) { issues.push(`${chain} · ${address.slice(0, 8)}…: ${e.message}`); publish(true); } }
        }
      }
      Promise.all(Array.from({ length: Math.min(6, queue.length) }, worker)).then(() => publish(false));
      return () => { cancelled = true; controller.abort(); };
    }, [owner, token, signature]);
    return owner && state.owner === owner && token ? state : { assets: [], loading: false, issues: [] };
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
  window.ProfilePortfolio = function ({ portfolio, favorites, toggleFavorite, onSelect, resolveImg, darkMode, hidden }) {
    const [tab, setTab] = useState('Overview'), [filter, setFilter] = useState('All'), [search, setSearch] = useState(''), [chain, setChain] = useState('all');
    const assets = useMemo(() => portfolio.assets.filter(a => !hidden.has(window.nftFavoriteKey(a)) && (tab !== 'Favorites' || favorites.has(window.nftFavoriteKey(a))) && (filter === 'All' || category(a) === filter) && (chain === 'all' || chain === a.chain) && `${a.name || ''} ${a.collectionName || (typeof a.collection === 'string' ? a.collection : a.collection?.name) || ''}`.toLowerCase().includes(search.toLowerCase())).sort((a,b) => Number(favorites.has(window.nftFavoriteKey(b))) - Number(favorites.has(window.nftFavoriteKey(a))) || window.nftFloor.compare(a,b)), [portfolio.assets, hidden, favorites, tab, filter, search, chain]);
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
        group.favorite = group.assets.some(a => favorites.has(window.nftFavoriteKey(a)));
        group.floorPriceUsd = group.assets.map(window.nftFloor.usd).filter(n => n !== null).sort((a,b) => b-a)[0] ?? null;
      }
      return groups.sort((a,b) => Number(b.favorite) - Number(a.favorite) || window.nftFloor.compare(a,b));
    }, [assets, favorites]);
    const tiles = tab === 'Holdings' || tab === 'Favorites' ? assets.map(a => ({ id: window.nftFavoriteKey(a), name: a.name || 'Untitled NFT', floorPriceUsd: window.nftFloor.usd(a), assets: [a] })) : groups;
    return <section className="profile-gallery" aria-label="Profile NFT portfolio">
      <div className="profile-tabs">{['Overview', 'Holdings', 'Favorites'].map(t => <button key={t} aria-pressed={tab === t} onClick={() => setTab(t)}>{t}</button>)}<span>{portfolio.assets.length} NFTs · {new Set(portfolio.assets.map(a => a.chain)).size} chains</span></div>
      <div className="profile-gallery-tools"><input aria-label="Search profile NFTs" placeholder="Search your collection…" value={search} onChange={e => setSearch(e.target.value)} /><select aria-label="Filter profile chain" value={chain} onChange={e => setChain(e.target.value)}><option value="all">All chains</option>{[...new Set(portfolio.assets.map(a => a.chain))].map(c => <option key={c}>{c}</option>)}</select></div>
      <div className="profile-categories">{['All', ...new Set(portfolio.assets.map(category))].map(c => <button key={c} aria-pressed={filter === c} onClick={() => setFilter(c)}>{c}</button>)}</div>
      <p className="profile-load-status">Highest floor first · USD · favorites pinned</p>
      {portfolio.loading && <p role="status" className="profile-load-status">Loading linked wallets… {portfolio.assets.length} NFTs ready</p>}
      {!!portfolio.issues.length && <details className="profile-load-status"><summary>{portfolio.issues.length} sources unavailable · loaded NFTs retained</summary>{portfolio.issues.map((issue,i) => <p key={i}>{issue}</p>)}</details>}
      {!tiles.length && <div className="profile-empty">{portfolio.loading ? 'Your collection is taking shape…' : search || filter !== 'All' || tab === 'Favorites' ? 'No NFTs match this view.' : 'Your linked-wallet NFTs will appear here.'}</div>}
      <div className="profile-mosaic">{tiles.map((tile,index) => <article key={tile.id} className={`profile-tile ${index % 7 === 4 ? 'profile-tile-tall' : ''}`}>
        <div className={`profile-tile-media ${tile.assets.length > 1 ? 'profile-quilt' : ''}`}>{tile.assets.slice(0,4).map(asset => {
          const key = window.nftFavoriteKey(asset);
          return <div className="profile-art" key={key}><button className="profile-art-open" aria-label={`View ${asset.name || 'NFT'}`} onClick={() => onSelect(asset)}><img src={resolveImg(asset.thumbnailUrl || asset.image || '', asset.symbol) || '/profile-art-fallback.svg'} alt={asset.name || 'NFT'} decoding="async" onError={e => { e.currentTarget.onerror = null; e.currentTarget.src = '/profile-art-fallback.svg'; }} /></button><button className="profile-star" aria-label={`${favorites.has(key) ? 'Unfavorite' : 'Favorite'} ${asset.name || 'NFT'}`} aria-pressed={favorites.has(key)} onClick={() => toggleFavorite(asset)}>{favorites.has(key) ? '★' : '☆'}</button></div>;
        })}</div><div className="profile-tile-caption"><strong>{tile.name}</strong><span>{window.nftFloor.label(tile)}</span><span>{tile.assets[0].chain} · {tile.assets.length > 1 ? `${tile.assets.length} items` : category(tile.assets[0])}</span></div>
      </article>)}</div>
    </section>;
  };
})();
