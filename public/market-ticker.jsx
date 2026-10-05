function MarketTickerIcon({ row }) {
  const sources = [...new Set([
    row.chain !== 'Global' ? `https://dd.dexscreener.com/ds-data/chains/${encodeURIComponent(row.chain)}.png` : '',
    typeof row.image === 'string' && row.image.startsWith('https://') ? row.image : '',
  ].filter(Boolean))];
  const [index, setIndex] = React.useState(0);
  React.useEffect(() => setIndex(0), [row.chain, row.image]);
  return <span className="cl-ticker-icon" aria-hidden="true">
    {sources[index]
      ? <img src={sources[index]} alt="" width="18" height="18" loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => setIndex(value => value + 1)} />
      : String(row.chain === 'Global' ? row.symbol || '?' : row.chain || '?').slice(0, 1).toUpperCase()}
  </span>;
}

function MarketTicker({ darkMode }) {
  const [feed, setFeed] = React.useState(null);
  const [failed, setFailed] = React.useState(false);
  const [paused, setPaused] = React.useState(false);
  React.useEffect(() => {
    let active = true;
    let controller;
    const refresh = async () => {
      if (document.hidden) return;
      controller?.abort();
      controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 20000);
      try {
        const response = await fetch('/api/market/ticker', { signal: controller.signal });
        if (!response.ok) throw new Error('Ticker unavailable');
        const data = await response.json();
        if (!Array.isArray(data.rows)) throw new Error('Invalid ticker response');
        if (active) { setFeed(data); setFailed(false); }
      } catch { if (active) setFailed(true); }
      finally { clearTimeout(timeout); }
    };
    refresh();
    const interval = setInterval(refresh, 60000);
    document.addEventListener('visibilitychange', refresh);
    return () => { active = false; controller?.abort(); clearInterval(interval); document.removeEventListener('visibilitychange', refresh); };
  }, []);
  const rows = (feed?.rows || []).filter(row => Number.isFinite(row.price) && row.price > 0);
  const now = Date.now();
  const stale = failed || rows.some(row => !row.updatedAt || now - row.updatedAt > 10 * 60000);
  const price = value => new Intl.NumberFormat('en-US', {
    style: 'currency', currency: 'USD', maximumSignificantDigits: value < 1 ? 4 : undefined,
    maximumFractionDigits: value >= 1 ? 2 : undefined,
  }).format(value);
  const renderRow = (row, duplicate) => {
    const change = Number.isFinite(row.change) ? row.change : null;
    const old = !row.updatedAt || now - row.updatedAt > 10 * 60000;
    const contents = <><MarketTickerIcon row={row} /><strong>{String(row.symbol || '?').toUpperCase()}</strong><span className="cl-ticker-chain">{row.chain}</span><span>{price(row.price)}</span><span className={change === null || old ? 'cl-ticker-neutral' : change >= 0 ? 'cl-ticker-up' : 'cl-ticker-down'}>{old ? 'Stale' : change === null ? '24h —' : `${change >= 0 ? '+' : ''}${change.toFixed(2)}%`}</span></>;
    const title = `${row.name} · ${row.chain}${row.address ? ` · ${row.address}` : ''} · ${row.source} · ${row.updatedAt ? new Date(row.updatedAt).toLocaleString() : 'Unknown update time'} · 24h change`;
    return row.url?.startsWith('https://dexscreener.com/')
      ? <a key={row.id} className="cl-ticker-coin" href={row.url} target="_blank" rel="noopener noreferrer" tabIndex={duplicate ? -1 : 0} title={title}>{contents}</a>
      : <span key={row.id} className="cl-ticker-coin" title={title}>{contents}</span>;
  };
  return <section aria-label="Cross-chain price ticker" className={`cl-ticker ${darkMode ? 'cl-ticker-dark' : 'cl-ticker-light'} ${paused ? 'cl-ticker-paused' : ''}`}>
    <div className="cl-ticker-label" title={feed?.coverage || 'Global market leaders and cross-chain DEX tokens'}>Markets <small>USD · 24h{stale ? ' · Stale' : ''}</small></div>
    <div className="cl-ticker-window" tabIndex="0" aria-label="Prices; hover or focus to pause scrolling">
      {rows.length ? <div className="cl-ticker-track" style={{ '--ticker-duration': `${Math.max(45, rows.length * 5)}s` }}>
        <div className="cl-ticker-group">{rows.map(row => renderRow(row, false))}</div>
        <div className="cl-ticker-group" aria-hidden="true">{rows.map(row => renderRow(row, true))}</div>
      </div> : <span className="cl-ticker-empty" role="status">{failed || feed ? 'Prices temporarily unavailable' : 'Loading cross-chain prices…'}</span>}
    </div>
    <button type="button" className="cl-ticker-control" onClick={() => setPaused(value => !value)} aria-label={paused ? 'Resume price ticker' : 'Pause price ticker'} aria-pressed={paused}>{paused ? '▶' : 'Ⅱ'}</button>
  </section>;
}
