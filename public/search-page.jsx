(function () {
  const { useEffect, useMemo, useRef, useState } = React;
  const { getAppMatchTags, getSearchFeaturedApps, rankApps } = window.ChainLensSearchIntent;
  const { detectScannerIntent } = window.ChainLensChains;

  const EXAMPLES = ['Uniswap', 'Cardano wallets', 'NFT marketplaces'];
  const WEB_SEARCH_API = 'https://chainlens-search.guildfordking.workers.dev/api/search/web';

  const initials = (name) => String(name || '')
    .split(/\s+/)
    .map(part => part[0])
    .join('')
    .replace(/[^A-Za-z0-9]/g, '')
    .slice(0, 2)
    .toUpperCase();

  // Deep link: /search?q=… (Magic Money's address bar sends non-URL input here).
  // Read once at load; later searches keep the address in sync via replaceState.
  const readUrlQuery = () => {
    try {
      return String(new URLSearchParams(window.location.search).get('q') || '').replace(/\s+/g, ' ').trim().slice(0, 200);
    } catch {
      return '';
    }
  };
  const INITIAL_URL_QUERY = readUrlQuery();
  let initialQueryConsumed = false;

  const writeUrlQuery = (value) => {
    try {
      window.history.replaceState(window.history.state, '', value ? `/search?q=${encodeURIComponent(value)}` : '/');
    } catch { /* history unavailable */ }
  };

  const SearchPage = ({ darkMode, apps = [], onOpenScanner, onOpenAppHub, onOpenProfile, collectionAssets = [], authToken }) => {
    const [query, setQuery] = useState('');
    const [submittedQuery, setSubmittedQuery] = useState('');
    const [webResults, setWebResults] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [profileResult, setProfileResult] = useState(null);
    const [profileError, setProfileError] = useState('');
    const [nadResult, setNadResult] = useState(null);
    const [nadError, setNadError] = useState('');
    const [nadLoading, setNadLoading] = useState(false);
    const [nadCopied, setNadCopied] = useState(false);
    const requestRef = useRef(null);

    useEffect(() => () => requestRef.current?.abort(), []);

    const scannerIntent = useMemo(() => detectScannerIntent(submittedQuery), [submittedQuery]);
    const actionIntent = useMemo(() => /^@[a-z0-9_]{3,24}$/i.test(submittedQuery) || /^(?:username|handle)\s+/i.test(submittedQuery) || window.ChainLensSearchIntent.isAppCatalogQuery(apps, submittedQuery) ? null : window.ChainLensSearchActions.parseActionIntent(submittedQuery), [apps, submittedQuery]);
    const entityIntent = useMemo(() => window.ChainLensEntities.parseEntityIntent(submittedQuery), [submittedQuery]);
    const appResults = useMemo(
      () => actionIntent ? window.ChainLensSearchActions.matchActionApps(apps, actionIntent).slice(0, 6) : submittedQuery ? rankApps(apps, submittedQuery) : getSearchFeaturedApps(apps),
      [apps, submittedQuery, actionIntent, entityIntent]
    );

    const submitSearch = async (event, nextQuery) => {
      event?.preventDefault();
      const value = String(nextQuery ?? query).replace(/\s+/g, ' ').trim();
      if (!value) return;
      setQuery(value);
      setSubmittedQuery(value);
      writeUrlQuery(value);
      setWebResults([]);
      setError('');
      setProfileResult(null);
      setProfileError('');
      setNadResult(null); setNadError(''); setNadCopied(false);
      const isNad = detectScannerIntent(value)?.label === 'Monad .nad domain';
      setNadLoading(isNad);
      requestRef.current?.abort();
      const controller = new AbortController();
      requestRef.current = controller;
      setLoading(true);
      try {
        const profileId = window.ChainLensProfiles.parseId(value);
        if (profileId) {
          const response = await fetch(`/api/profiles/${profileId}`, { signal: controller.signal });
          const payload = await response.json().catch(() => ({}));
          if (!response.ok) {
            if (requestRef.current === controller) setProfileError(payload.error || 'Profile search is unavailable.');
          } else if (requestRef.current === controller) setProfileResult(payload);
          return;
        }
        if (isNad) {
          try {
            const response = await fetch(`/api/resolve/nad/${encodeURIComponent(value)}`, { signal: controller.signal });
            const payload = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(payload.error || 'Could not resolve this .nad name.');
            if (!/^0x[0-9a-f]{40}$/i.test(payload.address) || /^0x0{40}$/i.test(payload.address)) throw new Error('This .nad name has no resolved wallet address.');
            if (requestRef.current === controller) setNadResult(payload);
          } catch (err) {
            if (err.name === 'AbortError') throw err;
            if (requestRef.current === controller) setNadError(err.message);
          } finally { if (requestRef.current === controller) setNadLoading(false); }
        }
        const response = await fetch(`${WEB_SEARCH_API}?q=${encodeURIComponent(value)}`, { signal: controller.signal });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.error || 'Web search is temporarily unavailable.');
        if (requestRef.current === controller) setWebResults(Array.isArray(payload.results) ? payload.results : []);
      } catch (requestError) {
        if (requestError.name !== 'AbortError' && requestRef.current === controller) setError(requestError.message || 'Web search is temporarily unavailable.');
      } finally {
        if (requestRef.current === controller) setLoading(false);
      }
    };

    // Run a deep-linked query once per page load; leaving the Search tab drops
    // ?q so the address never names a search the page is no longer showing.
    useEffect(() => {
      if (INITIAL_URL_QUERY && !initialQueryConsumed) {
        initialQueryConsumed = true;
        submitSearch(null, INITIAL_URL_QUERY);
      }
      return () => {
        if (new URLSearchParams(window.location.search).has('q')) writeUrlQuery('');
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const surface = darkMode
      ? 'bg-slate-900/55 border-slate-800'
      : 'bg-white/90 border-slate-100 shadow-xl';
    const muted = darkMode ? 'text-slate-400' : 'text-slate-500';

    return (
      <main className="cl-search-page max-w-6xl mx-auto pb-24">
        <section className="cl-art-panel cl-search-hero relative overflow-hidden rounded-[2.25rem] md:rounded-[3.5rem] border border-cyan-400/20 bg-gradient-to-br from-slate-950 via-slate-900 to-cyan-950 px-5 py-10 md:px-14 md:py-16 text-white shadow-2xl">
          <div className="absolute -top-24 -right-20 h-72 w-72 rounded-full bg-cyan-400/15 blur-3xl" aria-hidden="true"></div>
          <div className="absolute -bottom-32 -left-20 h-72 w-72 rounded-full bg-blue-500/15 blur-3xl" aria-hidden="true"></div>
          <div className="relative z-10 max-w-4xl mx-auto text-center">
            <h1 className="font-heading text-4xl md:text-7xl font-extrabold uppercase leading-[0.95] tracking-tight">
              Search<br/><span className="text-cyan-300">Web 3</span>
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-sm md:text-lg leading-7 text-slate-300">
              Search the open web, discover trusted crypto apps, or send a wallet straight to the ChainLens scanner.
            </p>

            <form onSubmit={submitSearch} className="cl-search-form mt-8 md:mt-10" role="search">
              <div className="cl-search-field flex flex-col sm:flex-row gap-3 rounded-[1.75rem] border border-white/15 bg-white/10 p-2.5 backdrop-blur-xl shadow-2xl">
                <label htmlFor="chainlens-search" className="sr-only">Search the web and ChainLens</label>
                <div className="flex flex-1 items-center gap-3 px-3">
                  <svg aria-hidden="true" className="h-5 w-5 shrink-0 text-cyan-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
                  <input
                    id="chainlens-search"
                    value={query}
                    onChange={event => setQuery(event.target.value)}
                    maxLength="200"
                    autoComplete="off"
                    placeholder="Search an app, wallet, or ChainLens ID..."
                    className="w-full bg-transparent py-3 text-base text-white placeholder:text-slate-500 outline-none md:text-lg"
                  />
                </div>
                <button type="submit" disabled={!query.trim() || loading} className="rounded-2xl bg-cyan-300 px-7 py-4 text-xs font-extrabold uppercase tracking-widest text-slate-950 transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-50">
                  {loading ? 'Searching' : 'Search'}
                </button>
              </div>
            </form>

            <div className="mt-4 flex flex-wrap justify-center gap-2">
              {EXAMPLES.map(example => (
                <button key={example} onClick={event => submitSearch(event, example)} className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-slate-400 transition hover:border-cyan-300/40 hover:text-cyan-200">
                  {example}
                </button>
              ))}
            </div>
          </div>
        </section>

        <div className="mt-7 space-y-7" aria-live="polite">
          {window.ChainLensProfiles.parseId(submittedQuery) && <section data-testid="profile-search-result" className={`rounded-[2rem] border p-5 md:p-8 ${surface}`}>
            <h2 className="font-heading text-2xl font-extrabold mb-4">ChainLens profile</h2>
            {loading ? <p>Finding profile…</p> : profileError ? <p role="status">{profileError}</p> : profileResult && <button type="button" onClick={() => onOpenProfile(profileResult.id)} className="flex w-full items-center gap-4 text-left rounded-xl p-3 hover:bg-cyan-500/10">
              <window.ProfileAvatar profile={profileResult} size={56} />
              <span className="min-w-0 flex-1"><strong className="block">{profileResult.display_name}</strong>{profileResult.username && <span className="block text-sm text-cyan-500">@{profileResult.username}</span>}<span className={`block break-all text-xs font-mono ${muted}`}>{profileResult.id}</span></span><span className="text-cyan-500 text-xs font-bold">View Profile →</span>
            </button>}
          </section>}
          {(!submittedQuery || window.ChainLensProfiles.parseId(submittedQuery)) && (
            <section data-testid="app-search-results" className={`rounded-[2rem] border p-5 md:p-8 ${surface}`}>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between mb-6">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-cyan-500 mb-2">Start here</p>
                  <h2 className="font-heading text-2xl md:text-3xl font-extrabold uppercase">Featured apps</h2>
                </div>
                <button onClick={() => onOpenAppHub('')} className="text-xs font-bold uppercase tracking-widest text-cyan-500 hover:text-cyan-400">Browse App Hub →</button>
              </div>
              <AppGrid apps={getSearchFeaturedApps(apps)} darkMode={darkMode} allApps={apps} />
            </section>
          )}

          {submittedQuery && scannerIntent && (
            <section data-testid="scanner-search-result" className="rounded-[2rem] border border-cyan-400/25 bg-gradient-to-r from-cyan-500/10 to-blue-500/10 p-5 md:p-7">
              <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
                <div className="min-w-0">
                  <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-cyan-500 mb-2">ChainLens recognized this</p>
                  <h2 className="font-heading text-xl md:text-2xl font-extrabold uppercase">{scannerIntent.label}</h2>
                  <p className={`mt-2 truncate text-sm ${muted}`}>{scannerIntent.value}</p>
                  {scannerIntent.label === 'Monad .nad domain' && <div className="mt-3 text-sm">
                    {nadLoading ? <p>Resolving on Monad…</p> : nadError && !nadResult ? <p role="status">{nadError}</p> : nadResult && <>
                      <p className={`text-xs mb-2 ${muted}`}>Nad Name Service · Monad mainnet · EVM address</p>
                      <div className="flex items-start gap-3"><code className="min-w-0 break-all text-xs">{nadResult.address}</code><button type="button" aria-label="Copy resolved wallet address" className="shrink-0 text-xs font-bold text-cyan-500" onClick={async () => {
                        try { await navigator.clipboard.writeText(nadResult.address); setNadCopied(true); }
                        catch { setNadError('Could not copy address. Select it to copy manually.'); }
                      }}>{nadCopied ? 'Copied ✓' : 'Copy'}</button></div>
                      {nadError && <p role="status">{nadError}</p>}
                    </>}
                  </div>}
                </div>
                <button disabled={scannerIntent.label === 'Monad .nad domain' && !nadResult} onClick={() => onOpenScanner(nadResult ? { ...scannerIntent, value: nadResult.address } : scannerIntent)} className="shrink-0 rounded-2xl bg-cyan-400 px-6 py-4 text-xs font-extrabold uppercase tracking-widest text-slate-950 transition hover:bg-cyan-300 disabled:opacity-50">
                  Scan in ChainLens →
                </button>
              </div>
            </section>
          )}

          {submittedQuery && !window.ChainLensProfiles.parseId(submittedQuery) && (!actionIntent || /^[a-z0-9_]{3,24}$/i.test(submittedQuery)) && (!entityIntent?.kind || entityIntent.kind === 'address') && (scannerIntent || submittedQuery.length <= 64) && <window.SearchPeopleResults key={`people:${submittedQuery}`} query={submittedQuery} domainAddress={nadResult?.address} authToken={authToken} darkMode={darkMode} onOpenProfile={onOpenProfile} />}

          {actionIntent && <section data-testid="action-search-results" className={`rounded-[2rem] border p-5 md:p-8 ${surface}`}>
            <h2 className="font-heading text-xl font-extrabold mb-3">{({ bridge: 'Bridge', swap: 'Swap', stake: 'Staking', lend: 'Lending' })[actionIntent.action]} tools</h2>
            <p className={`text-sm mb-3 ${muted}`}>{actionIntent.fromChain || actionIntent.toChain ? `${actionIntent.fromChain || 'Source network unspecified'} → ${actionIntent.toChain || 'Destination network unspecified'}` : actionIntent.chain ? `On ${actionIntent.chain}` : 'Across supported networks'}{actionIntent.asset ? ` · ${actionIntent.asset}` : ''}</p>
            <p className={`text-xs mb-4 ${muted}`}>Matching tools from App Hub. Open a tool to check its current assets and routes.</p>
            {appResults.length ? <AppGrid apps={appResults} darkMode={darkMode} query={submittedQuery} allApps={apps} /> : <p className="text-sm">No indexed tools match these networks. Try fewer constraints.</p>}
            <button type="button" onClick={() => onOpenAppHub(submittedQuery)} className="text-xs font-bold text-cyan-500 mt-4">Explore in App Hub →</button>
          </section>}

          {submittedQuery && !actionIntent && !window.ChainLensProfiles.parseId(submittedQuery) && appResults.length > 0 && (
            <section data-testid="app-search-results" className={`rounded-[2rem] border p-5 md:p-8 ${surface}`}>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between mb-6">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-emerald-500 mb-2">From App Hub</p>
                  <h2 className="font-heading text-2xl md:text-3xl font-extrabold uppercase break-words">Apps matching “{submittedQuery}”</h2>
                </div>
                <button onClick={() => onOpenAppHub(submittedQuery)} className="text-xs font-bold uppercase tracking-widest text-cyan-500 hover:text-cyan-400">View in App Hub →</button>
              </div>
              <AppGrid apps={appResults} darkMode={darkMode} query={submittedQuery} allApps={apps} />
            </section>
          )}

          {submittedQuery && !actionIntent && !window.ChainLensProfiles.parseId(submittedQuery) && !/\.(nad|eth|sol)$/i.test(submittedQuery) && <window.SearchEntityResults key={`entities:${submittedQuery}`} query={submittedQuery} darkMode={darkMode} collectionAssets={collectionAssets} />}

          {submittedQuery && !window.ChainLensProfiles.parseId(submittedQuery) && (
            <section className={`rounded-[2rem] border p-5 md:p-8 ${surface}`}>
              <div className="mb-6">
                <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-blue-500 mb-2">Across the web</p>
                <h2 className="font-heading text-2xl md:text-3xl font-extrabold uppercase">Web results</h2>
              </div>

              {loading && (
                <div className={`rounded-2xl border p-6 ${darkMode ? 'border-slate-800 bg-slate-950/50' : 'border-slate-100 bg-slate-50'}`}>
                  <div className="flex items-center gap-3 font-bold"><span className="h-4 w-4 animate-spin rounded-full border-2 border-cyan-500 border-t-transparent"></span>Searching with ChainLens Search…</div>
                  <p className={`mt-2 text-sm ${muted}`}>On the free tier, the first search after inactivity can take up to a minute while the service wakes up.</p>
                </div>
              )}

              {!loading && error && (
                <div className="rounded-2xl border border-amber-400/30 bg-amber-400/10 p-6">
                  <p className="font-bold text-amber-500">Web results are unavailable right now.</p>
                  <p className={`mt-2 text-sm ${muted}`}>{error}</p>
                  <button onClick={event => submitSearch(event, submittedQuery)} className="mt-4 text-xs font-bold uppercase tracking-widest text-amber-500 hover:underline">Try again</button>
                </div>
              )}

              {!loading && !error && webResults.length > 0 && (
                <div className="divide-y divide-slate-200/10">
                  {webResults.map(result => (
                    <article key={result.id || result.url} className="py-5 first:pt-0 last:pb-0">
                      <a href={result.url} target="_blank" rel="noopener noreferrer" className="group block">
                        <p className="mb-1 truncate text-xs font-medium text-emerald-500">{result.source}</p>
                        <h3 className={`text-lg md:text-xl font-bold transition group-hover:text-cyan-500 ${darkMode ? 'text-white' : 'text-slate-900'}`}>{result.title}</h3>
                        {result.snippet && <p className={`mt-2 text-sm leading-6 ${muted}`}>{result.snippet}</p>}
                      </a>
                    </article>
                  ))}
                </div>
              )}

              {!loading && !error && webResults.length === 0 && (
                <p className={`text-sm ${muted}`}>No web pages matched this search.</p>
              )}
            </section>
          )}

        </div>
      </main>
    );
  };

  const AppGrid = ({ apps, darkMode, query = '', allApps = apps }) => (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
      {apps.map(app => (
        <a key={app.id} href={app.website} target="_blank" rel="noopener noreferrer" className={`group flex items-center gap-4 rounded-2xl border p-4 transition hover:-translate-y-0.5 hover:border-cyan-400 ${darkMode ? 'border-slate-800 bg-slate-950/45' : 'border-slate-100 bg-slate-50'}`}>
          <div className={`app-hub-icon shrink-0 overflow-hidden ${darkMode ? 'bg-slate-800 text-cyan-300' : 'bg-white text-cyan-600 shadow-sm'}`}>
            {app.favicon ? <img src={app.favicon} alt="" className="h-7 w-7 rounded-lg" loading="lazy" onError={event => { event.currentTarget.style.display = 'none'; }} /> : initials(app.name)}
          </div>
          <div className="min-w-0">
            <h3 className="truncate font-bold group-hover:text-cyan-500">{app.name}</h3>
            <p className="mt-1 truncate text-[10px] font-bold uppercase tracking-wider text-slate-500">
              {getAppMatchTags(app, query, allApps).join(' • ') || app.category}
            </p>
          </div>
          <span className="ml-auto text-slate-500 transition group-hover:translate-x-0.5 group-hover:text-cyan-500">↗</span>
        </a>
      ))}
    </div>
  );

  window.ChainLensSearchPage = SearchPage;
  window.ChainLensSearchUtils = { detectScannerIntent, rankApps };
}());
