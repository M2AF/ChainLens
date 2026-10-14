(function (root, factory) {
  const api = factory(typeof module === 'object' && module.exports ? require('./chain-catalog') : root.ChainLensChains);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.ChainLensEntities = api;
}(typeof window !== 'undefined' ? window : globalThis, function ({ DEFAULT_CHAINS }) {
  const explorers = {
    ethereum: 'https://etherscan.io', base: 'https://basescan.org', arbitrum: 'https://arbiscan.io', optimism: 'https://optimistic.etherscan.io', polygon: 'https://polygonscan.com',
    avalanche: 'https://snowtrace.io', blast: 'https://blastscan.io', gnosis: 'https://gnosisscan.io', monad: 'https://monadscan.com', abstract: 'https://abscan.org', apechain: 'https://apescan.io',
    robinhood: 'https://explorer.robinhood.com', arc: 'https://arcscan.app', ronin: 'https://app.roninchain.com', soneium: 'https://soneium.blockscout.com', worldchain: 'https://worldscan.org', zora: 'https://explorer.zora.energy', hyperevm: 'https://hyperevmscan.io',
    solana: 'https://solscan.io', cardano: 'https://cardanoscan.io', bitcoin: 'https://mempool.space',
  };
  const aliases = { eth: 'ethereum', sol: 'solana', ada: 'cardano', btc: 'bitcoin', arb: 'arbitrum', op: 'optimism', avax: 'avalanche', matic: 'polygon', hype: 'hyperevm' };
  const chainId = value => {
    const id = aliases[String(value || '').toLowerCase()] || String(value || '').toLowerCase();
    return DEFAULT_CHAINS.some(c => c.id === id) ? id : null;
  };
  const isHash = (chain, value) => chain === 'solana' ? /^[1-9A-HJ-NP-Za-km-z]{64,90}$/.test(value) : /^(?:0x)?[a-f0-9]{64}$/i.test(value);
  const isIdentity = (chain, value) => chain === 'cardano' ? /^[a-f0-9]{56}(?:[a-f0-9]{2}){0,32}$/i.test(value) : chain === 'solana' ? /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(value) : /^0x[a-f0-9]{40}$/i.test(value);
  const explorerUrl = (chain, kind, identity) => {
    if (!Object.hasOwn(explorers, chain)) return null;
    const path = kind === 'transaction' ? (chain === 'cardano' ? 'transaction' : 'tx') : chain === 'cardano' ? kind === 'token' ? 'token' : 'tokenPolicy' : chain === 'solana' ? 'token' : 'address';
    return `${explorers[chain]}/${path}/${encodeURIComponent(identity)}`;
  };
  const parseEntityIntent = raw => {
    const text = String(raw || '').trim();
    if (!text || text.length > 200) return null;
    if (/^https:\/\//i.test(text)) {
      try {
        const url = new URL(text);
        if (url.username || url.password || url.port || url.hash || (url.searchParams.has('cluster') && url.searchParams.get('cluster') !== 'mainnet-beta')) return null;
        const chain = Object.keys(explorers).find(id => new URL(explorers[id]).hostname === url.hostname);
        const match = url.pathname.match(/^\/(?:tx|transaction)\/([^/]+)\/?$/);
        if (chain && match && isHash(chain, match[1])) return { kind: 'transaction', query: match[1], chain, needsChain: false };
      } catch {}
      return null;
    }
    let query = text, chain = null;
    const network = query.match(/\s+on\s+([a-z]+)(?:\s+(?:blockchain|network|chain))?$/i);
    if (network) { chain = chainId(network[1]); if (!chain) return null; query = query.slice(0, network.index).trim(); }
    const prefix = query.match(/^(tokens?|collections?|nfts?|policy|tx|transaction)\s+(.+)$/i);
    let kind = prefix ? /^(tx|transaction)$/i.test(prefix[1]) ? 'transaction' : /^(tokens?)$/i.test(prefix[1]) ? 'token' : 'collection' : null;
    if (prefix) query = prefix[2].trim();
    if (!kind && /^(?:0x)?[a-f0-9]{64}$/i.test(query)) kind = 'transaction';
    if (!kind && /^[a-f0-9]{56}$/i.test(query)) { kind = 'collection'; chain = 'cardano'; }
    if (!kind && /^0x[a-f0-9]{40}$/i.test(query)) kind = 'address';
    if (!kind && !chain) return null;
    if (kind === 'collection' && !chain && /^[a-f0-9]{56}$/i.test(query)) chain = 'cardano';
    const needsChain = !chain && (kind === 'transaction' || kind === 'address' || /^0x[a-f0-9]{40}$/i.test(query));
    return { kind, query, chain, needsChain };
  };
  return { parseEntityIntent, chainId, isHash, isIdentity, explorerUrl, explorers };
}));
