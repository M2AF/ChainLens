(function (root, factory) {
  const catalog = factory();
  if (typeof module === 'object' && module.exports) module.exports = catalog;
  else root.ChainLensChains = catalog;
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  // Magic Money's default-mainnet registry, adapted to ChainLens scan groups.
  // Keep this as the single source of truth for both the browser and backend.
  const DEFAULT_CHAINS = [
    { id: 'ethereum',  label: 'Ethereum',        family: 'evm',     native: 'ETH',  coingeckoId: 'ethereum',                alchemyNetwork: 'eth-mainnet',        background: '#627EEA', hex: '627EEA' },
    { id: 'arbitrum',  label: 'Arbitrum One',    family: 'evm',     native: 'ETH',  coingeckoId: 'ethereum',                alchemyNetwork: 'arb-mainnet',        background: '#28A0F0', hex: '28A0F0' },
    { id: 'optimism',  label: 'Optimism',        family: 'evm',     native: 'ETH',  coingeckoId: 'ethereum',                alchemyNetwork: 'opt-mainnet',        background: '#FF0420', hex: 'FF0420' },
    { id: 'base',      label: 'Base',            family: 'evm',     native: 'ETH',  coingeckoId: 'ethereum',                alchemyNetwork: 'base-mainnet',       background: '#0052FF', hex: '0052FF' },
    { id: 'polygon',   label: 'Polygon',         family: 'evm',     native: 'POL',  coingeckoId: 'polygon-ecosystem-token', alchemyNetwork: 'polygon-mainnet',    background: '#8247E5', hex: '8247E5' },
    { id: 'avalanche', label: 'Avalanche',       family: 'evm',     native: 'AVAX', coingeckoId: 'avalanche-2',             alchemyNetwork: 'avax-mainnet',       background: '#E84142', hex: 'E84142' },
    { id: 'blast',     label: 'Blast',           family: 'evm',     native: 'ETH',  coingeckoId: 'ethereum',                alchemyNetwork: 'blast-mainnet',      background: '#FCFC03', hex: 'FCFC03', foreground: '#020617' },
    { id: 'gnosis',    label: 'Gnosis',          family: 'evm',     native: 'xDAI', coingeckoId: 'xdai',                    alchemyNetwork: 'gnosis-mainnet',     background: '#04795B', hex: '04795B' },
    { id: 'monad',     label: 'Monad',           family: 'evm',     native: 'MON',  coingeckoId: 'monad',                   background: '#836EF9', hex: '836EF9', customBackend: true },
    { id: 'abstract',  label: 'Abstract',        family: 'evm',     native: 'ETH',  coingeckoId: 'ethereum',                alchemyNetwork: 'abstract-mainnet',   background: 'linear-gradient(135deg, #00D4FF, #00FF85)', hex: '00D4FF', foreground: '#020617' },
    { id: 'apechain',  label: 'ApeChain',        family: 'evm',     native: 'APE',  coingeckoId: 'apecoin',                 alchemyNetwork: 'apechain-mainnet',   background: '#0144D0', hex: '0144D0' },
    { id: 'robinhood', label: 'Robinhood Chain', family: 'evm',     native: 'ETH',  coingeckoId: 'ethereum',                alchemyNetwork: 'robinhood-mainnet',  background: '#00C805', hex: '00C805', foreground: '#020617' },
    { id: 'ronin',     label: 'Ronin',           family: 'evm',     native: 'RON',  coingeckoId: 'ronin',                   alchemyNetwork: 'ronin-mainnet',      background: '#1273EA', hex: '1273EA' },
    { id: 'soneium',   label: 'Soneium',         family: 'evm',     native: 'ETH',  coingeckoId: 'ethereum',                alchemyNetwork: 'soneium-mainnet',    background: '#5B5EA6', hex: '5B5EA6' },
    { id: 'worldchain',label: 'WorldChain',      family: 'evm',     native: 'WLD',  coingeckoId: 'worldcoin-wld',           alchemyNetwork: 'worldchain-mainnet', background: 'linear-gradient(135deg, #3B82F6, #22C55E)', hex: '3D4EFF' },
    { id: 'zora',      label: 'Zora',            family: 'evm',     native: 'ETH',  coingeckoId: 'ethereum',                alchemyNetwork: 'zora-mainnet',       background: 'linear-gradient(135deg, #A855F7, #EC4899)', hex: '2B5DF0' },
    { id: 'hyperevm',  label: 'HyperEVM',        family: 'evm',     native: 'HYPE', coingeckoId: 'hyperliquid',             alchemyNetwork: 'hyperevm-mainnet',   background: '#00BF7D', hex: '00BF7D' },
    { id: 'solana',    label: 'Solana',          family: 'account', native: 'SOL',  coingeckoId: 'solana',                  background: 'linear-gradient(135deg, #9945FF, #14F195)', hex: '14F195' },
    { id: 'polkadot',  label: 'Polkadot',        family: 'account', native: 'DOT',  coingeckoId: 'polkadot',                background: '#E6007A', hex: 'E6007A' },
    { id: 'tron',      label: 'Tron',            family: 'account', native: 'TRX',  coingeckoId: 'tron',                    background: '#EB0029', hex: 'EB0029' },
    { id: 'cardano',   label: 'Cardano',         family: 'utxo',    native: 'ADA',  coingeckoId: 'cardano',                 background: '#0033AD', hex: '0033AD' },
    { id: 'bitcoin',   label: 'Bitcoin',         family: 'utxo',    native: 'BTC',  coingeckoId: 'bitcoin',                 background: '#F7931A', hex: 'F7931A' },
    { id: 'dogecoin',  label: 'Dogecoin',        family: 'utxo',    native: 'DOGE', coingeckoId: 'dogecoin',                background: '#C2A633', hex: 'C2A633', foreground: '#020617' },
  ];

  const CHAIN_MAP = Object.fromEntries(DEFAULT_CHAINS.map(chain => [chain.id, chain]));
  const EVM_CHAINS = DEFAULT_CHAINS.filter(chain => chain.family === 'evm');
  const ACCOUNT_CHAINS = DEFAULT_CHAINS.filter(chain => chain.family === 'account');
  const UTXO_CHAINS = DEFAULT_CHAINS.filter(chain => chain.family === 'utxo');

  const BASE58 = '[1-9A-HJ-NP-Za-km-z]';
  const ADDRESS_PATTERNS = {
    evm: new RegExp('^0x[0-9a-fA-F]{40}$'),
    cardano: /^addr1[0-9a-z]{20,}$/,
    bitcoin: new RegExp('^(?:bc1[ac-hj-np-z02-9]{11,71}|[13]' + BASE58 + '{25,34})$', 'i'),
    dogecoin: new RegExp('^D' + BASE58 + '{25,34}$'),
    tron: new RegExp('^T' + BASE58 + '{33}$'),
    polkadot: new RegExp('^1' + BASE58 + '{46,47}$'),
    solana: new RegExp('^' + BASE58 + '{32,44}$'),
  };

  const detectAddressChain = (rawAddress) => {
    const address = String(rawAddress || '').trim();
    if (!address) return null;
    // Run the more specific Base58 families before Solana's broad 32–44 range.
    for (const id of ['evm', 'cardano', 'bitcoin', 'dogecoin', 'tron', 'polkadot', 'solana']) {
      if (ADDRESS_PATTERNS[id].test(address)) return id === 'evm' ? 'evm' : id;
    }
    return null;
  };

  const parseAddressInput = (rawInput, family) => {
    const seen = new Set();
    return String(rawInput || '')
      .split(',')
      .map(value => value.trim())
      .filter(Boolean)
      .filter(value => {
        const key = value.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .map(value => {
        if (family === 'evm') {
          if (ADDRESS_PATTERNS.evm.test(value)) return { input: value, chainId: 'evm', resolution: null };
          if (value.includes('.')) return { input: value, chainId: 'evm', resolution: 'evm-domain' };
          return { input: value, chainId: null, resolution: null };
        }

        if (family === 'account' && value.toLowerCase().endsWith('.sol')) {
          return { input: value, chainId: 'solana', resolution: 'sol-domain' };
        }

        const detected = detectAddressChain(value);
        const chain = detected && CHAIN_MAP[detected];
        if (chain?.family === family) return { input: value, chainId: detected, resolution: null };
        if (family === 'utxo' && (value.startsWith('$') || /^[a-z0-9_-]{1,64}$/i.test(value) && value === value.toLowerCase())) {
          return { input: value, chainId: 'cardano', resolution: 'ada-handle' };
        }
        return { input: value, chainId: null, resolution: null };
      });
  };

  return {
    DEFAULT_CHAINS,
    CHAIN_MAP,
    EVM_CHAINS,
    ACCOUNT_CHAINS,
    UTXO_CHAINS,
    ADDRESS_PATTERNS,
    detectAddressChain,
    parseAddressInput,
  };
}));
