(function () {
  const { useState, useEffect } = React;
  window.SearchPeopleResults = function ({ query, domainAddress, authToken, darkMode, onOpenProfile }) {
    const [data, setData] = useState(null), [error, setError] = useState(''), [loading, setLoading] = useState(false), [retry, setRetry] = useState(0);
    useEffect(() => {
      const controller = new AbortController(); let live = true;
      setData(null); setError(''); setLoading(true);
      const lookup = async () => {
        const wallet = window.ChainLensChains.detectScannerIntent(query);
        const params = new URLSearchParams();
        if (wallet) {
          let address = wallet.value;
          if (/\.nad$/i.test(query)) {
            if (!domainAddress) return null;
            address = domainAddress;
          } else if (/\.(eth|sol)$/i.test(query) || (wallet.chain === 'evm' && query.includes('.')) || query.startsWith('$')) {
            const endpoint = wallet.chain === 'solana' ? 'sns' : wallet.chain === 'cardano' ? 'handle' : /\.eth$/i.test(query) ? 'ens' : 'unstoppable';
            const value = endpoint === 'sns' ? query.replace(/\.sol$/i, '') : query;
            const response = await fetch(`/api/resolve/${endpoint}/${encodeURIComponent(value)}`, { signal: controller.signal });
            const body = await response.json(); if (!response.ok || !body.address) throw new Error('Could not resolve this name to find public profiles.');
            address = body.address;
          }
          params.set('address', address); params.set('chain', wallet.chain);
        } else {
          const value = query.replace(/^(?:people|person|profile|user|username|handle)\s+/i, '').replace(/^@/, '').trim();
          if (value.length < 2 || value.length > 64) return null;
          params.set('q', value);
        }
        const response = await fetch(`/api/search/people?${params}`, { signal: controller.signal, headers: authToken ? { Authorization: `Bearer ${authToken}` } : {} });
        const body = await response.json(); if (!response.ok) throw new Error(body.error || 'Public profile search is unavailable.'); return body;
      };
      lookup().then(body => { if (live) setData(body); }).catch(err => { if (live && err.name !== 'AbortError') setError(err.message); }).finally(() => { if (live) setLoading(false); });
      return () => { live = false; controller.abort(); };
    }, [query, domainAddress, authToken, retry]);
    if (!loading && !error && !data) return null;
    return <section data-testid="people-search-results" className={`rounded-[2rem] border p-5 md:p-8 ${darkMode ? 'border-slate-800 bg-slate-900/40' : 'border-slate-200 bg-white'}`}>
      <h2 className="font-heading text-xl font-extrabold mb-4">Public profiles</h2>
      {loading && <p role="status">Finding public profiles…</p>}
      {error && <div role="status"><p>{error}</p><button className="text-xs text-cyan-500 mt-2" onClick={() => setRetry(v => v + 1)}>Retry profile search</button></div>}
      {data?.people?.map(person => <button key={person.id} type="button" onClick={() => onOpenProfile(person.id)} className="w-full flex items-center gap-3 text-left border-t border-slate-500/20 py-4 hover:bg-cyan-500/5">
        <window.ProfileAvatar profile={person} size={44} />
        <span className="flex-1 min-w-0"><strong className="block break-words">{person.display_name}</strong><span className="block text-sm text-cyan-500">{person.username && `@${person.username}`}</span><code className="block break-all text-xs opacity-60">{person.id}</code><span className="block text-xs opacity-60 mt-1">{person.match === 'public-wallet' ? 'Publicly linked wallet match' : person.match === 'username' ? 'Username match' : 'Display name match'}</span></span><span className="shrink-0 text-xs text-cyan-500">Profile →</span>
      </button>)}
      {data && !data.people?.length && <p className="text-sm opacity-70">No matching public profiles.</p>}
      {data?.truncated && <p className="text-xs opacity-60 mt-3">More profiles match. Refine the name to narrow your search.</p>}
    </section>;
  };
})();
