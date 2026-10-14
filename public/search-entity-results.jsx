(function () {
  const { useState, useEffect, useMemo } = React;
  const { parseEntityIntent, explorerUrl, isIdentity } = window.ChainLensEntities;
  const { DEFAULT_CHAINS } = window.ChainLensChains;
  window.SearchEntityResults = function (props) {
    const intent = parseEntityIntent(props.query);
    if (intent?.kind === 'transaction') return <EntityResultSection {...props} kind="transaction" />;
    return <><EntityResultSection {...props} kind="token" /><EntityResultSection {...props} kind="collection" /></>;
  };
  function EntityResultSection({ query, darkMode, collectionAssets = [], kind }) {
    const intent = useMemo(() => parseEntityIntent(query), [query]);
    const [chain, setChain] = useState(intent?.chain || '');
    const [data, setData] = useState(null), [error, setError] = useState(''), [loading, setLoading] = useState(false), [retry, setRetry] = useState(0);
    const [copied, setCopied] = useState(''), [notice, setNotice] = useState('');
    const term = intent?.query || query;
    const needsChain = kind === 'transaction' || /^0x[a-f0-9]{40}$/i.test(term) || /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(term);
    const networks = DEFAULT_CHAINS.filter(c => kind === 'token' || c.family === 'evm' || c.id === 'solana' || c.id === 'cardano' || (kind === 'transaction' && c.id === 'bitcoin'));
    const localCollections = useMemo(() => {
      if (kind !== 'collection') return [];
      const map = new Map();
      for (const asset of collectionAssets) {
        if (asset.isToken) continue;
        const id = asset.policyId || asset.contractAddress || asset.collectionId;
        const name = asset.collectionName || (typeof asset.collection === 'string' ? asset.collection : asset.collection?.name);
        if (!id || typeof name !== 'string' || !isIdentity(asset.chain, id) || (chain && asset.chain !== chain)) continue;
        if (!name.toLowerCase().includes(term.toLowerCase()) && (asset.chain === 'solana' ? id !== term : id.toLowerCase() !== term.toLowerCase())) continue;
        const key = `${asset.chain}:${asset.chain === 'solana' ? id : id.toLowerCase()}`;
        map.set(key, { kind: asset.chain === 'cardano' ? 'policy' : 'collection', chain: asset.chain, address: id, name, source: 'Your loaded collections', key });
      }
      return [...map.values()].slice(0, 20);
    }, [collectionAssets, kind, term, chain]);
    useEffect(() => {
      setData(null); setError('');
      if (!kind || (needsChain && !chain)) { setLoading(false); return; }
      const controller = new AbortController(); let live = true;
      setLoading(true);
      const params = new URLSearchParams(kind === 'transaction' ? { chain, hash: term } : { chain, q: term, kind });
      fetch(`/api/search/${kind === 'transaction' ? 'transaction' : 'assets'}?${params}`, { signal: controller.signal })
        .then(async response => { const body = await response.json(); if (!response.ok) throw new Error(body.error || 'Lookup is unavailable.'); return body; })
        .then(body => { if (live) setData(body); })
        .catch(err => { if (live && err.name !== 'AbortError') setError(err.message); })
        .finally(() => { if (live) setLoading(false); });
      return () => { live = false; controller.abort(); };
    }, [term, kind, chain, needsChain, retry]);
    const copy = async (value, key) => {
      try { await navigator.clipboard.writeText(value); setCopied(key); setNotice(''); }
      catch { setNotice('Could not copy. Select the address or hash to copy manually.'); }
    };
    const assets = [...new Map([...localCollections, ...(data?.assets || [])].map(a => [a.key, a])).values()];
    const surface = darkMode ? 'border-slate-800 bg-slate-900/40' : 'border-slate-200 bg-white';
    const tx = data?.kind === 'transaction' ? data : null;
    return <section data-testid="entity-search-results" data-result-kind={kind} className={`rounded-[2rem] border p-5 md:p-8 ${surface}`}>
      <h2 className="font-heading text-xl font-extrabold mb-3">{kind === 'transaction' ? 'Transaction' : kind === 'token' ? 'Tokens' : 'NFTs & collections'}</h2>
      <div className="flex flex-wrap items-center gap-3 mb-4">
        {kind && <label className="text-xs">Network<select aria-label="Search network" className="block mt-1 rounded-lg border border-slate-500/30 bg-transparent p-2" value={chain} onChange={e => setChain(e.target.value)}><option value="">{needsChain ? 'Choose network' : 'All networks'}</option>{networks.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}</select></label>}
      </div>
      {kind && needsChain && !chain && <p role="status" className="text-sm opacity-70">Choose a network. An address or hash alone does not identify its blockchain.</p>}
      {loading && <p role="status">Looking up {kind === 'transaction' ? 'transaction' : 'assets'}…</p>}
      {error && <div role="status"><p>{error}</p><button type="button" className="text-cyan-500 text-xs mt-2" onClick={() => setRetry(v => v + 1)}>Retry lookup</button></div>}
      {notice && <p role="status">{notice}</p>}
      {data?.partial && <p className="text-xs opacity-70 mb-3">Some sources are unavailable. These are the results returned so far.</p>}
      {data?.coverage && <p className="text-xs opacity-60 mb-3">{data.coverage}</p>}
      {assets.map(asset => <article key={asset.key} className="border-t border-slate-500/20 py-4 min-w-0">
        <div className="flex flex-wrap justify-between gap-2"><strong>{asset.name}{asset.symbol && ` (${asset.symbol})`}</strong><span className="text-xs opacity-70">{asset.chain} · {asset.kind}</span></div>
        {asset.isNative ? <p className="text-xs mt-2">Native asset · no contract address</p> : <div className="flex items-start gap-3 mt-2"><code className="flex-1 min-w-0 break-all text-xs">{asset.address}</code><button type="button" className="shrink-0 text-xs text-cyan-500" aria-label={`Copy ${asset.name} identity`} onClick={() => copy(asset.address, asset.key)}>{copied === asset.key ? 'Copied ✓' : 'Copy'}</button></div>}
        <p className="text-xs opacity-60 mt-2">{asset.source}{asset.standard && ` · ${asset.standard}`}</p>
        {asset.sampleAssets && <p className="text-xs mt-2">Sample assets: {asset.sampleAssets.map(a => a.name).join(', ')}. This is not the full policy inventory.</p>}
        {asset.collectionAddress && <p className="text-xs break-all mt-2">Collection: {asset.collectionAddress}</p>}
        {!asset.isNative && explorerUrl(asset.chain, asset.kind, asset.address) && <a className="text-xs text-cyan-500 inline-block mt-2" href={explorerUrl(asset.chain, asset.kind, asset.address)} target="_blank" rel="noopener noreferrer">Inspect on explorer ↗</a>}
      </article>)}
      {data && !tx && !assets.length && <p className="text-sm">No matching {kind === 'token' ? 'tokens' : 'NFTs or collections'} found. Try a network or exact {kind === 'token' ? 'token address' : 'contract, mint or policy ID'}.</p>}
      {tx && <article className="border-t border-slate-500/20 pt-4 min-w-0">
        <p className="font-bold">{tx.chain} · {({ 'not-found': 'Not found on this network', pending: 'Pending', successful: 'Included successfully', failed: 'Failed' })[tx.state] || 'Unknown'}</p>
        <div className="flex items-start gap-3 my-3"><code className="flex-1 min-w-0 break-all text-xs">{tx.hash}</code><button className="shrink-0 text-xs text-cyan-500" aria-label="Copy transaction hash" onClick={() => copy(tx.hash, tx.hash)}>{copied === tx.hash ? 'Copied ✓' : 'Copy'}</button></div>
        {tx.from && <p className="text-xs break-all mb-2">From: {tx.from}</p>}{tx.to && <p className="text-xs break-all mb-2">To: {tx.to}</p>}
        {tx.value != null && <p className="text-sm">Native value: {tx.value} {tx.symbol}</p>}{tx.fee != null && <p className="text-sm">Fee: {tx.fee} {tx.symbol}</p>}{tx.block && <p className="text-xs opacity-70 mt-2">Block / slot: {tx.block}</p>}
        {!!tx.transfers?.length && <details className="mt-3"><summary className="cursor-pointer text-sm">Transfer / output summary · {tx.transfers.length}</summary><p className="text-xs opacity-60 my-2">Raw quantities are shown without assuming token decimals. Up to 20 detected transfers or outputs.</p>{tx.transfers.map((t, i) => <div key={i} className="text-xs border-t border-slate-500/20 py-2 break-all"><strong>{t.type}{t.tokenId != null && ` #${t.tokenId}`}</strong><p>{t.from && `From ${t.from}`}{t.to && ` → ${t.to}`}</p><p>Quantity: {t.amountRaw}{t.contract && ` · ${t.contract}`}</p>{t.assets?.map((a,j)=><p key={j}>Asset {a.policy}{a.name} · {a.quantity}</p>)}</div>)}</details>}
        <p className="text-xs opacity-60 mt-3">Source: {tx.source}</p>
        {explorerUrl(tx.chain, 'transaction', tx.hash) && <a className="text-xs text-cyan-500 inline-block mt-2" href={explorerUrl(tx.chain, 'transaction', tx.hash)} target="_blank" rel="noopener noreferrer">View transaction on explorer ↗</a>}
      </article>}
    </section>;
  }
})();
