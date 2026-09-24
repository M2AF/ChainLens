/* ChainLens Exchange Swap: deposit-address flow, not wallet signing. */
(() => {
  const A = window.ChainLensExchangeAssets;
  const STORAGE = 'chainlens.exchange.orders.v1';
  const terminal = new Set(['finished', 'failed', 'refunded', 'expired']);
  // Same lifecycle as the wallet's ExchangeStatusCard (ChangeNOW `new` arrives as `waiting`).
  const steps = [['waiting', 'Awaiting deposit'], ['confirming', 'Confirming'], ['exchanging', 'Exchanging'], ['sending', 'Sending'], ['finished', 'Complete']];
  const stepIndex = { waiting: 0, verifying: 0, confirming: 1, exchanging: 2, sending: 3, finished: 4 };
  const card = 'rounded-2xl border border-slate-700 bg-slate-900 p-4 md:p-5';
  const field = 'w-full rounded-xl border border-slate-600 bg-slate-800 px-3 py-3 text-sm text-white outline-none focus:border-cyan-400';
  const label = 'mb-2 block text-[11px] font-bold uppercase tracking-widest text-slate-300';
  const btn = 'rounded-xl px-4 py-3 text-sm font-bold transition disabled:cursor-not-allowed disabled:opacity-40';
  const asset = key => A.find(a => a.key === key);
  const readOrders = () => {
    try {
      const value = JSON.parse(localStorage.getItem(STORAGE) || '[]');
      return Array.isArray(value) ? value.filter(o => o && o.id && o.provider).slice(0, 10) : [];
    } catch { return []; }
  };
  const readApi = async (url, options) => {
    const response = await fetch(url, options);
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || 'Exchange service is unavailable.');
    return body;
  };

  function ExchangeSwapPanel() {
    const [from, setFrom] = React.useState('sol:sol');
    const [to, setTo] = React.useState('btc:btc');
    const [amount, setAmount] = React.useState('');
    const [fixed, setFixed] = React.useState(false);
    const [destination, setDestination] = React.useState('');
    const [refund, setRefund] = React.useState('');
    const [destinationMemo, setDestinationMemo] = React.useState('');
    const [refundMemo, setRefundMemo] = React.useState('');
    const [quote, setQuote] = React.useState(null);
    const [busy, setBusy] = React.useState('');
    const [error, setError] = React.useState('');
    const [orders, setOrders] = React.useState(readOrders);
    const [selected, setSelected] = React.useState(() => readOrders()[0]?.id || '');
    const [copied, setCopied] = React.useState('');
    const [clock, setClock] = React.useState(Date.now());
    const createLock = React.useRef(false);
    const quoteRequest = React.useRef(0);

    const current = orders.find(o => o.id === selected) || null;
    const fromAsset = asset(from);
    const toAsset = asset(to);
    const invalidAmount = !/^(?:0|[1-9]\d{0,17})(?:\.\d{1,18})?$/.test(amount) || !(Number(amount) > 0);
    const quoteExpired = quote && clock >= quote.expiresAt;
    const belowMin = !!(quote && quote.min && Number(amount) < Number(quote.min));
    const aboveMax = !!(quote && quote.max && Number(amount) > Number(quote.max));
    const inRange = quote && !belowMin && !aboveMax;
    const failed = current && ['failed', 'refunded', 'expired'].includes(current.status);
    const deadline = current && current.fixed && !terminal.has(current.status) && current.validUntil ? Date.parse(current.validUntil) : NaN;
    const remaining = Number.isFinite(deadline) ? Math.max(0, Math.floor((deadline - clock) / 1000)) : null;

    React.useEffect(() => {
      try { localStorage.setItem(STORAGE, JSON.stringify(orders.slice(0, 10))); } catch { /* private mode */ }
    }, [orders]);

    React.useEffect(() => {
      if (!quote && !Number.isFinite(deadline)) return;
      const timer = setInterval(() => setClock(Date.now()), 1000);
      return () => clearInterval(timer);
    }, [quote, deadline]);

    React.useEffect(() => {
      if (!current || terminal.has(current.status)) return;
      let alive = true;
      const poll = async () => {
        try {
          const next = await readApi(`/api/exchange/status/${encodeURIComponent(current.provider)}/${encodeURIComponent(current.id)}`);
          if (alive) setOrders(prev => prev.map(o => o.id === current.id ? {
            ...o, status: next.status || o.status, amountTo: next.amountTo || o.amountTo,
            addressFrom: next.addressFrom || o.addressFrom, extraIdFrom: next.extraIdFrom || o.extraIdFrom,
          } : o));
        } catch { /* transient polling failure; original deposit instructions remain */ }
      };
      const timer = setInterval(poll, 8000);
      poll();
      return () => { alive = false; clearInterval(timer); };
    }, [current?.id, current?.provider, current?.status]);

    const invalidate = () => { quoteRequest.current++; setQuote(null); setError(''); setBusy(value => value === 'quote' ? '' : value); };
    const getQuote = async () => {
      const request = ++quoteRequest.current;
      setError(''); setQuote(null);
      if (invalidAmount || from === to) { setError('Choose two different assets and enter an amount greater than zero.'); return; }
      setBusy('quote');
      try {
        const q = new URLSearchParams({ from, to, amount, fixed: String(fixed) });
        const answer = await readApi(`/api/exchange/quote?${q}`);
        if (quoteRequest.current === request) { setClock(Date.now()); setQuote(answer); }
      } catch (e) { if (quoteRequest.current === request) setError(e.message); }
      finally { if (quoteRequest.current === request) setBusy(''); }
    };
    const create = async () => {
      if (createLock.current || !quote || quoteExpired || !inRange || !destination.trim()) return;
      createLock.current = true; setBusy('create'); setError('');
      try {
        const exchange = await readApi('/api/exchange/create', {
          method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ quoteId: quote.quoteId, addressTo: destination.trim(),
            userRefundAddress: refund.trim(), extraIdTo: destinationMemo.trim(), userRefundExtraId: refundMemo.trim() }),
        });
        const record = { ...exchange, from: quote.from, to: quote.to, fixed: quote.fixed,
          expectedAmount: quote.estimatedAmount, createdAt: Date.now() };
        setOrders(prev => [record, ...prev.filter(o => o.id !== record.id)].slice(0, 10));
        setSelected(record.id); setQuote(null);
      } catch (e) {
        setQuote(null); // a timed-out POST may have created an order; never retry same quote
        setError(e.message);
      } finally { createLock.current = false; setBusy(''); }
    };
    const copy = async (value, kind) => {
      try { await navigator.clipboard.writeText(value); setCopied(kind); setTimeout(() => setCopied(''), 1800); }
      catch { setError('Copy failed. Select and copy the value manually.'); }
    };
    const startNew = () => { setSelected(''); invalidate(); };
    const option = a => <option key={a.key} value={a.key}>{a.label} · {a.name}</option>;

    return <div data-testid="exchange-panel" className="mx-auto max-w-2xl space-y-5 text-slate-100">
      {orders.length > 0 && <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="text-slate-400">Recent exchanges</span>
        {orders.map(o => <button key={`${o.provider}:${o.id}`} type="button" onClick={() => { setSelected(o.id); setError(''); }}
          className={`rounded-lg border px-2 py-1 ${selected === o.id ? 'border-cyan-400 text-cyan-300' : 'border-slate-600 text-slate-300'}`}>
          {o.from?.label || 'Exchange'} → {o.to?.label || 'Exchange'} · {o.status}
        </button>)}
      </div>}
      {current ? <>
        <div className={card} data-testid="exchange-status">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-xl font-bold">{current.status === 'finished' ? 'Exchange complete' : terminal.has(current.status) ? `Exchange ${current.status}` : 'Exchange created'}</h2>
            <span className="rounded-full border border-cyan-500/50 px-3 py-1 text-xs text-cyan-300">{current.provider === 'changenow' ? 'ChangeNOW' : 'SimpleSwap'}</span>
          </div>
          <p className="mt-2 text-sm text-slate-300">Status: <strong className="capitalize text-white">{current.status}</strong> · ID: <span className="font-mono break-all">{current.id}</span></p>
          {!terminal.has(current.status) && <p className="mt-1 text-xs text-slate-400">Status refreshes automatically. You can leave and return to this page.</p>}
          <ol data-testid="exchange-steps" className="mt-4 grid grid-cols-5 gap-1 text-[9px] leading-tight sm:text-[11px]">
            {steps.map(([key, text], i) => {
              const at = stepIndex[current.status] ?? 0;
              const state = failed ? 'todo' : at > i || current.status === 'finished' ? 'done' : at === i ? 'active' : 'todo';
              return <li key={key} data-state={state} className="flex flex-col items-center gap-1 text-center">
                <span className={`h-2 w-full rounded-full ${state === 'done' ? 'bg-emerald-400' : state === 'active' ? 'animate-pulse bg-cyan-400' : 'bg-slate-700'}`} />
                <span className={state === 'todo' ? 'text-slate-500' : 'text-slate-200'}>{text}</span>
              </li>;
            })}
          </ol>
          {failed && <p role="alert" className="mt-3 text-sm font-bold capitalize text-red-300">Exchange {current.status}</p>}
          <div className="mt-5 rounded-xl border border-amber-500/40 bg-amber-500/10 p-4">
            <p className="text-xs font-bold uppercase tracking-wider text-amber-300">Send exactly on {current.from?.name || 'the send network'}</p>
            <p className="mt-1 text-2xl font-bold">{current.amountFrom || '—'} {current.from?.label}</p>
            <p className="mt-4 text-xs font-bold text-slate-300">Deposit address</p>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <code data-testid="exchange-deposit-address" className="min-w-0 flex-1 break-all text-sm">{current.addressFrom}</code>
              <button type="button" className={`${btn} border border-slate-600 py-2`} onClick={() => copy(current.addressFrom, 'address')}>{copied === 'address' ? 'Copied' : 'Copy'}</button>
            </div>
            {current.extraIdFrom && <div className="mt-3"><p className="text-xs font-bold text-amber-300">Required memo / tag</p><code className="break-all">{current.extraIdFrom}</code>
              <button type="button" className="ml-2 underline" onClick={() => copy(current.extraIdFrom, 'memo')}>{copied === 'memo' ? 'Copied' : 'Copy memo'}</button></div>}
            <p className="mt-4 text-xs text-amber-200">Confirm the network, address and memo before sending. ChainLens does not send funds for you.</p>
          </div>
          <div className="mt-4 text-sm text-slate-300">Estimated receive: <strong className="text-white">{current.amountTo || current.expectedAmount || '—'} {current.to?.label}</strong></div>
          <div className="mt-1 text-xs break-all text-slate-400">Destination: {current.addressTo || '—'}</div>
          {remaining != null && <p data-testid="exchange-countdown" className="mt-2 text-xs text-amber-300">Fixed rate: send within {String(Math.floor(remaining / 60)).padStart(2, '0')}:{String(remaining % 60).padStart(2, '0')} ({new Date(deadline).toLocaleTimeString()})</p>}
        </div>
        <button type="button" onClick={startNew} className={`${btn} w-full border border-slate-600 bg-slate-900 text-slate-100 hover:border-cyan-400`}>Start another exchange</button>
      </> : <>
        <div className={card}>
          <label className={label} htmlFor="exchange-from">You send</label>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_1.2fr]">
            <input id="exchange-amount" aria-label="Amount to send" inputMode="decimal" placeholder="0.0" value={amount} onChange={e => { setAmount(e.target.value); invalidate(); }} className={field} />
            <select id="exchange-from" aria-label="Send asset" value={from} onChange={e => { setFrom(e.target.value); invalidate(); }} className={field}>{A.map(option)}</select>
          </div>
        </div>
        <div className="flex justify-center"><button type="button" aria-label="Flip exchange direction" onClick={() => { setFrom(to); setTo(from); setDestination(''); setRefund(''); invalidate(); }} className={`${btn} rounded-full border border-slate-600 px-4 py-2 text-cyan-300`}>⇅</button></div>
        <div className={card}>
          <label className={label} htmlFor="exchange-to">You receive</label>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_1.2fr]">
            <div data-testid="exchange-estimate" className={`${field} flex items-center text-lg font-bold`}>{quote ? `≈ ${quote.estimatedAmount}` : '—'}</div>
            <select id="exchange-to" aria-label="Receive asset" value={to} onChange={e => { setTo(e.target.value); invalidate(); }} className={field}>{A.map(option)}</select>
          </div>
        </div>
        <div className={card}>
          <label className={label} htmlFor="exchange-destination">Destination address · {toAsset?.name} (required)</label>
          <input id="exchange-destination" value={destination} onChange={e => setDestination(e.target.value)} placeholder={`Paste a ${toAsset?.label} address on ${toAsset?.name}`} className={field} autoComplete="off" />
          <label className={`${label} mt-4`} htmlFor="exchange-dest-memo">Destination memo / tag (if required)</label>
          <input id="exchange-dest-memo" value={destinationMemo} onChange={e => setDestinationMemo(e.target.value)} placeholder="Only if your destination requires one" className={field} autoComplete="off" />
          <label className={`${label} mt-4`} htmlFor="exchange-refund">Refund address · {fromAsset?.name} (recommended)</label>
          <input id="exchange-refund" value={refund} onChange={e => setRefund(e.target.value)} placeholder={`Your ${fromAsset?.label} address on ${fromAsset?.name}`} className={field} autoComplete="off" />
          <label className={`${label} mt-4`} htmlFor="exchange-refund-memo">Refund memo / tag (if required)</label>
          <input id="exchange-refund-memo" value={refundMemo} onChange={e => setRefundMemo(e.target.value)} placeholder="Only if your refund address requires one" className={field} autoComplete="off" />
          <p className="mt-3 text-xs text-amber-300">Addresses are not autofilled: a linked or watch-only ChainLens profile does not prove control of the receiving account. Verify them before creating an order.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm"><span className="mr-2 text-slate-400">Rate type</span>
          {[false, true].map(value => <button type="button" key={String(value)} onClick={() => { setFixed(value); invalidate(); }} aria-pressed={fixed === value}
            className={`${btn} border py-2 ${fixed === value ? 'border-cyan-400 text-cyan-300' : 'border-slate-600 text-slate-300'}`}>{value ? 'Fixed' : 'Floating'}</button>)}
        </div>
        {quote && <div data-testid="exchange-quote" className={card}>
          <div className="flex justify-between gap-3 text-sm"><span className="text-slate-400">Provider</span><strong>{quote.provider === 'changenow' ? 'ChangeNOW' : 'SimpleSwap'}</strong></div>
          <div className="mt-2 flex justify-between gap-3 text-sm"><span className="text-slate-400">Estimated receive</span><strong>≈ {quote.estimatedAmount} {toAsset?.label}</strong></div>
          <div className="mt-2 flex justify-between gap-3 text-sm"><span className="text-slate-400">Send limits</span><span className={belowMin || aboveMax ? 'text-red-300' : ''}>{quote.min || '—'} – {quote.max || '—'} {fromAsset?.label}</span></div>
          <div className="mt-2 flex justify-between gap-3 text-sm"><span className="text-slate-400">Rate</span><span>{fixed ? 'Fixed until quote expiry' : 'Floating; final amount may change'}</span></div>
          <p className="mt-3 text-xs text-slate-400">Quote expires {new Date(quote.expiresAt).toLocaleTimeString()}. Estimated receive is not guaranteed for a floating rate. Sending the deposit may incur a separate network fee.</p>
          {quoteExpired && <p role="alert" className="mt-2 text-amber-300">Quote expired. Get a new quote.</p>}
        </div>}
        {error && <div role="alert" className="rounded-xl border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-200">{error}</div>}
        {quote ? <button type="button" data-testid="exchange-create" disabled={!!busy || !!quoteExpired || !inRange || !destination.trim()} onClick={create}
          className={`${btn} w-full bg-cyan-400 text-slate-950 hover:bg-cyan-300`}>{busy === 'create' ? 'Creating…' : belowMin ? `Minimum ${quote.min} ${fromAsset?.label}` : aboveMax ? `Maximum ${quote.max} ${fromAsset?.label}` : !destination.trim() ? 'Enter destination address' : 'Create exchange · get deposit address'}</button>
          : <button type="button" data-testid="exchange-get-quote" disabled={!!busy || invalidAmount || from === to} onClick={getQuote}
            className={`${btn} w-full bg-cyan-400 text-slate-950 hover:bg-cyan-300`}>{busy === 'quote' ? 'Getting quote…' : 'Get quote'}</button>}
        <p className="text-xs text-slate-400">You will send funds yourself after an exchange order is created. No wallet signature or automatic transfer occurs here.</p>
      </>}
    </div>;
  }
  window.ChainLensExchangeSwap = ExchangeSwapPanel;
})();
