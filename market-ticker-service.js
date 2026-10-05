'use strict';

const TTL = 5 * 60 * 1000;
const number = value => value == null || value === '' || !Number.isFinite(Number(value)) ? null : Number(value);

function marketRows(coins, timestamp) {
  return (coins || []).filter(c => number(c.current_price) > 0).map(c => ({
    id: `market:${c.id}`, name: c.name, symbol: c.symbol, chain: 'Global',
    image: c.image || '',
    price: number(c.current_price), change: number(c.price_change_percentage_24h),
    source: c.source || 'CoinGecko', updatedAt: Date.parse(c.last_updated) || timestamp,
  }));
}

function dexRows(pairs, timestamp) {
  const best = new Map();
  for (const p of pairs) {
    if (!p.chainId || !p.baseToken?.address || !p.baseToken.symbol || !(number(p.priceUsd) > 0)) continue;
    if (!(number(p.liquidity?.usd) >= 10000)) continue;
    // Addresses are case-sensitive on non-EVM chains (notably Solana).
    const address = /^0x/i.test(p.baseToken.address) ? p.baseToken.address.toLowerCase() : p.baseToken.address;
    const id = `dex:${p.chainId}:${address}`;
    if ((best.get(id)?.liquidity || 0) >= number(p.liquidity.usd)) continue;
    best.set(id, { id, name: p.baseToken.name, symbol: p.baseToken.symbol,
      chain: p.chainId, address: p.baseToken.address, price: number(p.priceUsd),
      image: p.info?.imageUrl || '',
      change: number(p.priceChange?.h24), source: 'DEX Screener', updatedAt: timestamp,
      liquidity: number(p.liquidity.usd),
      url: `https://dexscreener.com/${encodeURIComponent(p.chainId)}/${encodeURIComponent(p.pairAddress)}` });
  }
  // Round-robin chains so one busy ecosystem cannot occupy the entire strip.
  const chains = new Map();
  for (const row of [...best.values()].sort((a, b) => b.liquidity - a.liquidity)) {
    if (!chains.has(row.chain)) chains.set(row.chain, []);
    chains.get(row.chain).push(row);
  }
  const rows = [];
  while (rows.length < 60 && [...chains.values()].some(list => list.length)) {
    for (const list of chains.values()) if (list.length && rows.length < 60) rows.push(list.shift());
  }
  return rows;
}

function createTickerService(fetch) {
  let cached = { rows: [], updatedAt: 0 };
  let pending;
  let lastAttempt = 0;
  const get = async path => {
    const response = await fetch(`https://api.dexscreener.com/${path}`, { signal: AbortSignal.timeout(6000) });
    if (!response.ok) throw new Error(`DEX Screener HTTP ${response.status}`);
    const data = await response.json();
    if (!Array.isArray(data)) throw new Error('Invalid DEX response');
    return data;
  };
  async function refresh() {
    const discovery = await Promise.allSettled([
      get('token-profiles/latest/v1'),
      ...['ETH', 'SOL', 'ADA', 'SUI', 'BNB', 'AVAX'].map(async symbol => {
        const response = await fetch(`https://api.dexscreener.com/latest/dex/search?q=${symbol}`, { signal: AbortSignal.timeout(6000) });
        if (!response.ok) throw new Error(`DEX search HTTP ${response.status}`);
        const data = await response.json();
        if (!Array.isArray(data.pairs)) throw new Error('Invalid DEX search');
        return data.pairs;
      }),
    ]);
    const profiles = discovery[0].status === 'fulfilled' ? discovery[0].value : [];
    const groups = new Map();
    for (const p of profiles.slice(0, 60)) {
      if (!p.chainId || !p.tokenAddress) continue;
      if (!groups.has(p.chainId)) groups.set(p.chainId, new Set());
      groups.get(p.chainId).add(p.tokenAddress);
    }
    const batches = await Promise.allSettled([...groups].slice(0, 12).flatMap(([chain, addresses]) => {
      const list = [...addresses];
      return Array.from({ length: Math.ceil(list.length / 30) }, (_, i) =>
        get(`tokens/v1/${encodeURIComponent(chain)}/${list.slice(i * 30, i * 30 + 30).map(encodeURIComponent).join(',')}`));
    }));
    const pairs = [...discovery.slice(1), ...batches].flatMap(result => result.status === 'fulfilled' ? result.value : []);
    const updatedAt = Date.now();
    const rows = dexRows(pairs, updatedAt);
    if (rows.length) cached = { rows, updatedAt };
    return cached;
  }
  return {
    async snapshot(coins, timestamp) {
      if (Date.now() - cached.updatedAt >= TTL) {
        if (!pending && Date.now() - lastAttempt >= 60000) {
          lastAttempt = Date.now();
          pending = refresh().finally(() => { pending = null; });
        }
        if (pending) await pending;
      }
      const global = marketRows(coins, timestamp);
      const rows = [];
      for (let i = 0; i < Math.max(global.length, cached.rows.length); i++) {
        if (global[i]) rows.push(global[i]);
        if (cached.rows[i]) rows.push(cached.rows[i]);
      }
      return { rows,
        coverage: 'Global market leaders + cross-chain DEX search and latest profiles; not every token. DEX pools require $10k liquidity.',
        refreshSeconds: 300 };
    },
  };
}

module.exports = { createTickerService, marketRows, dexRows };
