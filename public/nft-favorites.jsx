// Same profile preferences document as Magic Money; JWT stays with the website.
(function () {
  const { useState, useRef, useEffect, useMemo, useCallback } = React;
  const prefix = 'favorite:mainnet:';
  const favoriteKey = asset => window.assetFilterKey.keyFor(asset);
  window.nftFavoriteKey = favoriteKey;
  const read = key => {
    try { return window.assetFilterKey.sanitizeEntries(JSON.parse(localStorage.getItem(key) || '{}')); } catch { return {}; }
  };
  window.useProfileNftFavorites = function (profileId, authToken) {
    // Bind the cached profile to the current JWT subject, even while a new
    // /api/profile response is still loading after an account switch.
    let subject = null;
    try { subject = JSON.parse(atob(authToken.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).sub; } catch {}
    if (authToken && subject !== profileId) profileId = null;
    const key = profileId ? `cl_nft_favorites_v1_${profileId}` : authToken ? 'cl_nft_favorites_waiting' : 'cl_nft_favorites_guest';
    const initial = useMemo(() => read(key), [key]);
    const [state, setState] = useState({ key, entries: initial });
    const entries = state.key === key ? state.entries : initial;
    const ref = useRef({ key, entries }); ref.current = { key, entries };
    const [revision, setRevision] = useState(0);
    const apply = useCallback(remote => {
      if (ref.current.key !== key) return;
      const scoped = Object.fromEntries(Object.entries(window.assetFilterKey.sanitizeEntries(remote)).filter(([id, e]) => id.startsWith(prefix) && ['f', 'u'].includes(e.s)));
      const merged = window.assetFilterKey.mergeEntries(ref.current.entries, scoped);
      ref.current = { key, entries: merged };
      try { localStorage.setItem(key, JSON.stringify(merged)); } catch {}
      setState({ key, entries: merged }); return merged;
    }, [key]);
    useEffect(() => {
      if (!profileId || !authToken) return;
      let cancelled = false, busy = false;
      const controller = new AbortController();
      const sync = async () => {
        if (busy || cancelled) return;
        busy = true;
        const headers = { Authorization: `Bearer ${authToken}`, 'Content-Type': 'application/json' };
        try {
          const response = await fetch('/api/profile/filters', { headers, signal: controller.signal });
          if (!response.ok || cancelled || ref.current.key !== key) return;
          const body = await response.json();
          if (cancelled || !body.entries) return;
          const merged = apply(body.entries);
          if (!merged || !Object.entries(merged).some(([id, e]) => body.entries[id]?.s !== e.s || body.entries[id]?.t !== e.t)) return;
          const pushed = await fetch('/api/profile/filters', { method: 'PUT', headers, signal: controller.signal, body: JSON.stringify({ entries: ref.current.entries }) });
          if (!pushed.ok || cancelled) return;
          const result = await pushed.json(); if (result.entries) apply(result.entries);
        } catch {} finally { busy = false; }
      };
      const timer = setTimeout(sync, 800), poll = setInterval(sync, 30000);
      window.addEventListener('focus', sync); window.addEventListener('online', sync);
      return () => { cancelled = true; controller.abort(); clearTimeout(timer); clearInterval(poll); window.removeEventListener('focus', sync); window.removeEventListener('online', sync); };
    }, [profileId, authToken, key, apply, revision]);
    useEffect(() => {
      const listener = event => { if (event.key === key || event.key === null) apply(read(key)); };
      window.addEventListener('storage', listener); return () => window.removeEventListener('storage', listener);
    }, [key, apply]);
    const favorites = useMemo(() => new Set(Object.keys(entries).filter(id => id.startsWith(prefix) && entries[id].s === 'f').map(id => id.slice(prefix.length))), [entries]);
    const toggleFavorite = useCallback(asset => {
      if (authToken && !profileId) return; // Wait for authenticated identity; never mix profiles.
      const id = prefix + favoriteKey(asset), held = ref.current.entries;
      apply({ [id]: { s: held[id]?.s === 'f' ? 'u' : 'f', t: Math.max(Date.now(), (held[id]?.t || 0) + 1) } });
      setRevision(n => n + 1);
    }, [authToken, profileId, apply]);
    return { favorites, toggleFavorite };
  };
})();
