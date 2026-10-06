// Session-owned data, independent of scanner selections and tab mounting.
(function () {
  const { useState, useEffect, useMemo, useRef } = React;
  window.NftArtwork = function ({ asset, preview = true, className }) {
    const candidates = window.nftImage.sources(asset, preview);
    const signature = JSON.stringify(candidates);
    const [failed, setFailed] = useState({signature,index:0});
    const index = failed.signature === signature ? failed.index : 0;
    return <img className={className} src={candidates[index] || '/profile-art-fallback.svg'} alt={asset.name || 'NFT'} decoding="async" onError={() => { if (index < candidates.length) setFailed({signature,index:index+1}); }} />;
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
    const previews = useRef({ owner: null, images: new Map(), queue: [], active: 0 });
    useEffect(() => {
      if (previews.current.owner !== owner) {
        for (const image of previews.current.images.values()) if (image) { clearTimeout(image.previewTimer); image.onload = image.onerror = null; image.src = ''; }
        previews.current = { owner, images: new Map(), queue: [], active: 0 };
      }
      const cache = previews.current;
      for (const asset of state.owner === owner ? state.assets : []) {
        const candidates = window.nftImage.sources(asset), url = candidates[0];
        if (url && !cache.images.has(url)) { cache.images.set(url, null); cache.queue.push({url,candidates}); }
      }
      const drain = () => {
        while (cache.active < 6 && cache.queue.length && previews.current === cache) {
          const {url,candidates} = cache.queue.shift(), image = new Image(); cache.images.set(url, image); cache.active++;
          let done = false, index = 0;
          const finish = () => { if (done) return; done = true; clearTimeout(image.previewTimer); cache.active--; drain(); };
          const next = () => {
            clearTimeout(image.previewTimer);
            if (done || previews.current !== cache) return;
            if (index >= candidates.length) { finish(); return; }
            image.previewTimer = setTimeout(next, 5000); image.src = candidates[index++];
          };
          image.onload = finish; image.onerror = next; next();
        }
      };
      drain();
    }, [owner, state.assets]);
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
        group.favorite = group.assets.some(a => favorites.has(window.nftFavoriteKey(a)));
        group.floorPriceUsd = group.assets.map(window.nftFloor.usd).filter(n => n !== null).sort((a,b) => b-a)[0] ?? null;
      }
      return groups.sort((a,b) => Number(b.favorite) - Number(a.favorite) || window.nftFloor.compare(a,b));
    }, [assets, favorites]);
    const tiles = tab !== 'Overview' ? assets.map(a => ({ id: window.nftFavoriteKey(a), name: a.name || 'Untitled NFT', floorPriceUsd: window.nftFloor.usd(a), assets: [a] })) : groups;
    return <section className="profile-gallery" aria-label="Profile NFT portfolio">
      <div className="profile-tabs">{['Overview', 'Holdings', 'Favorites', 'Spam'].map(t => <button key={t} aria-pressed={tab === t} onClick={() => setTab(t)}>{t === 'Spam' ? `Spam (${spamCount})` : t}</button>)}<span>{portfolio.assets.length} NFTs · {new Set(portfolio.assets.map(a => a.chain)).size} chains</span></div>
      <div className="profile-gallery-tools"><input aria-label="Search profile NFTs" placeholder="Search your collection…" value={search} onChange={e => setSearch(e.target.value)} /><select aria-label="Filter profile chain" value={chain} onChange={e => setChain(e.target.value)}><option value="all">All chains</option>{[...new Set(portfolio.assets.map(a => a.chain))].map(c => <option key={c}>{c}</option>)}</select></div>
      <div className="profile-categories">{['All', ...new Set(portfolio.assets.map(category))].map(c => <button key={c} aria-pressed={filter === c} onClick={() => setFilter(c)}>{c}</button>)}</div>
      <p className="profile-load-status">Highest floor first · USD · favorites pinned</p>
      {portfolio.loading && <p role="status" className="profile-load-status">Loading linked wallets… {portfolio.assets.length} NFTs ready</p>}
      {!!portfolio.issues.length && <details className="profile-load-status"><summary>{portfolio.issues.length} sources unavailable · loaded NFTs retained</summary>{portfolio.issues.map((issue,i) => <p key={i}>{issue}</p>)}</details>}
      {!tiles.length && <div className="profile-empty">{portfolio.loading ? 'Your collection is taking shape…' : search || filter !== 'All' || tab === 'Favorites' || tab === 'Spam' ? 'No NFTs match this view.' : 'Your linked-wallet NFTs will appear here.'}</div>}
      <div className="profile-mosaic">{tiles.map((tile,index) => <article key={tile.id} className={`profile-tile ${index % 7 === 4 ? 'profile-tile-tall' : ''}`}>
        <div className={`profile-tile-media ${tile.assets.length > 1 ? 'profile-quilt' : ''}`}>{tile.assets.slice(0,4).map(asset => {
          const key = window.nftFavoriteKey(asset);
          return <div className="profile-art" key={key}><button className="profile-art-open" aria-label={`View ${asset.name || 'NFT'}`} onClick={() => onSelect(asset)}><window.NftArtwork asset={asset} /></button><button className="profile-star" aria-label={`${favorites.has(key) ? 'Unfavorite' : 'Favorite'} ${asset.name || 'NFT'}`} aria-pressed={favorites.has(key)} onClick={() => toggleFavorite(asset)}>{favorites.has(key) ? '★' : '☆'}</button><button className="profile-spam" title={isSpam(asset) ? 'Not spam' : 'Mark as spam'} aria-label={`${isSpam(asset) ? 'Not spam' : 'Mark as spam'} ${asset.name || 'NFT'}`} onClick={e => toggleSpam(e, asset)}>{isSpam(asset) ? '↩' : '🚫'}</button></div>;
        })}</div><div className="profile-tile-caption"><strong>{tile.name}</strong><span>{window.nftFloor.label(tile)}</span><span>{tile.assets[0].chain} · {tile.assets.length > 1 ? `${tile.assets.length} items` : category(tile.assets[0])}</span></div>
      </article>)}</div>
    </section>;
  };
})();
