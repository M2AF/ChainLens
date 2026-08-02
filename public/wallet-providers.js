(function (root, factory) {
  const catalog = typeof module === 'object' && module.exports
    ? require('./chain-catalog')
    : root.ChainLensChains;
  const api = factory(catalog);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ChainLensWalletProviders = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function (catalog) {
  'use strict';

  const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));
  const isObject = value => value && (typeof value === 'object' || typeof value === 'function');
  const asArray = value => Array.isArray(value) ? value : value ? [value] : [];

  const makeEvent = (win, type, detail) => {
    const EventCtor = win.CustomEvent || globalThis.CustomEvent;
    if (typeof EventCtor === 'function') return new EventCtor(type, { detail });
    return { type, detail };
  };

  const safeWindowValues = (win) => {
    const values = [];
    for (const key of Object.getOwnPropertyNames(win || {})) {
      try { values.push([key, win[key]]); } catch { /* guarded browser getter */ }
    }
    return values;
  };

  const inferName = (provider, fallback = 'Injected Wallet') => {
    if (provider?.isMagicMoney) return 'MagicMoney Wallet';
    if (provider?.isPhantom) return 'Phantom';
    if (provider?.isBackpack) return 'Backpack';
    if (provider?.isSolflare) return 'Solflare';
    if (provider?.isMetaMask) return 'MetaMask';
    if (provider?.isCoinbaseWallet) return 'Coinbase Wallet';
    if (provider?.isBraveWallet) return 'Brave Wallet';
    if (provider?.name && typeof provider.name === 'string') return provider.name;
    return fallback;
  };

  const recordFor = ({ id, name, icon = '', provider, kind }) => ({
    id: String(id || name || kind),
    name: name || inferName(provider),
    icon: typeof icon === 'string' ? icon : '',
    provider,
    kind,
    isMagicMoney: Boolean(provider?.isMagicMoney || /magic\s*money/i.test(name || '')),
  });

  const collector = ({ dedupeNames = false } = {}) => {
    const records = [];
    const objects = new Set();
    const ids = new Set();
    const names = new Set();
    const add = record => {
      if (!record || !isObject(record.provider)) return;
      const id = String(record.id || '').toLowerCase();
      const name = String(record.name || '').toLowerCase();
      if (objects.has(record.provider) || (id && ids.has(id)) || (dedupeNames && name && names.has(name))) return;
      objects.add(record.provider);
      if (id) ids.add(id);
      if (name) names.add(name);
      records.push(record);
    };
    return { records, add };
  };

  const discoverEvmProviders = async (win = globalThis.window, delayMs = 250) => {
    const { records, add } = collector();
    const onAnnounce = event => {
      const detail = event?.detail || {};
      if (typeof detail.provider?.request !== 'function') return;
      add(recordFor({
        id: detail.info?.uuid || detail.info?.rdns || detail.info?.name,
        name: detail.info?.name || inferName(detail.provider),
        icon: detail.info?.icon,
        provider: detail.provider,
        kind: 'evm-eip6963',
      }));
    };

    win?.addEventListener?.('eip6963:announceProvider', onAnnounce);
    win?.dispatchEvent?.(makeEvent(win, 'eip6963:requestProvider'));
    await wait(delayMs);
    win?.removeEventListener?.('eip6963:announceProvider', onAnnounce);

    for (const provider of asArray(win?.ethereum?.providers)) {
      if (typeof provider?.request !== 'function') continue;
      add(recordFor({ id: `evm-${inferName(provider)}`, name: inferName(provider), provider, kind: 'evm-legacy' }));
    }
    if (typeof win?.ethereum?.request === 'function') {
      add(recordFor({ id: 'evm-window-ethereum', name: inferName(win.ethereum), provider: win.ethereum, kind: 'evm-legacy' }));
    }
    return records;
  };

  const discoverSolanaProviders = async (win = globalThis.window, delayMs = 150) => {
    // Wallet Standard is authoritative and is intentionally collected before
    // legacy globals so one wallet does not appear twice.
    const { records, add } = collector({ dedupeNames: true });
    const addStandard = wallet => {
      if (!wallet?.features?.['standard:connect'] || !wallet?.features?.['solana:signMessage']) return;
      add(recordFor({ id: `sol-standard-${wallet.name}`, name: wallet.name, icon: wallet.icon, provider: wallet, kind: 'solana-standard' }));
    };
    const onRegister = event => {
      try {
        const detail = event?.detail;
        if (typeof detail === 'function') detail(addStandard);
        else if (detail?.wallet) addStandard(detail.wallet);
      } catch { /* non-conforming wallet announcement */ }
    };

    win?.addEventListener?.('wallet-standard:register-wallet', onRegister);
    win?.dispatchEvent?.(makeEvent(win, 'wallet-standard:app-ready', { register: addStandard }));
    await wait(delayMs);
    win?.removeEventListener?.('wallet-standard:register-wallet', onRegister);

    const legacyCandidates = [];
    const pushLegacy = (provider, key) => {
      if (typeof provider?.connect === 'function' && typeof provider?.signMessage === 'function') {
        legacyCandidates.push([provider, key]);
      }
    };
    for (const provider of asArray(win?.solana?.providers)) pushLegacy(provider, 'solana');
    pushLegacy(win?.solana, 'solana');
    for (const [key, value] of safeWindowValues(win)) {
      pushLegacy(value?.solana, key);
      pushLegacy(value, key);
    }
    for (const [provider, key] of legacyCandidates) {
      add(recordFor({ id: `sol-legacy-${key}-${inferName(provider)}`, name: inferName(provider, key), icon: provider.icon, provider, kind: 'solana-legacy' }));
    }
    return records;
  };

  const discoverCardanoProviders = async (win = globalThis.window) => {
    const { records, add } = collector({ dedupeNames: true });
    for (const [key, provider] of Object.entries(win?.cardano || {})) {
      if (typeof provider?.enable !== 'function') continue;
      add(recordFor({
        id: `cardano-${key}`,
        name: provider.name || (key === 'magicmoney' ? 'MagicMoney Wallet' : key),
        icon: provider.icon,
        provider,
        kind: 'cardano-cip30',
      }));
    }
    return records;
  };

  const resolveWindowPath = (win, path) => String(path || '').split('.').reduce((value, key) => value?.[key], win);

  const discoverBitcoinProviders = async (win = globalThis.window) => {
    const { records, add } = collector({ dedupeNames: true });
    for (const descriptor of asArray(win?.btc_providers)) {
      const provider = typeof descriptor?.request === 'function'
        ? descriptor
        : resolveWindowPath(win, descriptor?.id);
      if (typeof provider?.request !== 'function') continue;
      add(recordFor({ id: descriptor.id, name: descriptor.name || inferName(provider, descriptor.id), icon: descriptor.icon || provider.icon, provider, kind: 'bitcoin-wbip' }));
    }
    if (win?.MagicMoneyProviders?.BitcoinProvider) {
      const provider = win.MagicMoneyProviders.BitcoinProvider;
      add(recordFor({ id: provider.id, name: provider.name, icon: provider.icon, provider, kind: 'bitcoin-wbip' }));
    }

    const legacyCandidates = [[win?.unisat, 'unisat']];
    for (const [key, value] of safeWindowValues(win)) {
      legacyCandidates.push([value?.bitcoin, key], [value, key]);
    }
    for (const [provider, key] of legacyCandidates) {
      if (typeof provider?.requestAccounts !== 'function' && typeof provider?.getAccounts !== 'function') continue;
      add(recordFor({ id: `bitcoin-${key}-${inferName(provider)}`, name: inferName(provider, key), icon: provider.icon, provider, kind: 'bitcoin-legacy' }));
    }
    return records;
  };

  const discoverPolkadotProviders = async (win = globalThis.window) => {
    const { records, add } = collector({ dedupeNames: true });
    for (const [key, provider] of Object.entries(win?.injectedWeb3 || {})) {
      if (typeof provider?.enable !== 'function') continue;
      add(recordFor({ id: `polkadot-${key}`, name: provider.name || (key === 'magicmoney' ? 'MagicMoney Wallet' : key), icon: provider.icon, provider, kind: 'polkadot-injected' }));
    }
    return records;
  };

  const discoverTronProviders = async (win = globalThis.window) => {
    const { records, add } = collector({ dedupeNames: true });
    const candidates = [[win?.tronLink, 'TronLink']];
    for (const [key, value] of safeWindowValues(win)) candidates.push([value?.tronLink, key]);
    for (const [provider, key] of candidates) {
      if (typeof provider?.request !== 'function') continue;
      add(recordFor({ id: `tron-${key}`, name: provider.name || key, icon: provider.icon, provider, kind: 'tron-injected' }));
    }
    return records;
  };

  const discoverDogecoinProviders = async (win = globalThis.window) => {
    const { records, add } = collector({ dedupeNames: true });
    const candidates = [[win?.dogecoin, 'Dogecoin Wallet'], [win?.doge, 'Doge Wallet']];
    for (const [key, value] of safeWindowValues(win)) candidates.push([value?.dogecoin, key]);
    for (const [provider, key] of candidates) {
      if (typeof provider?.requestAccounts !== 'function' && typeof provider?.getAccounts !== 'function') continue;
      add(recordFor({ id: `dogecoin-${key}`, name: provider.name || key, icon: provider.icon, provider, kind: 'dogecoin-injected' }));
    }
    return records;
  };

  const discoverWalletProviders = (walletType, win = globalThis.window) => {
    switch (walletType) {
      case 'evm': return discoverEvmProviders(win);
      case 'solana': return discoverSolanaProviders(win);
      case 'cardano': return discoverCardanoProviders(win);
      case 'bitcoin': return discoverBitcoinProviders(win);
      case 'polkadot': return discoverPolkadotProviders(win);
      case 'tron': return discoverTronProviders(win);
      case 'dogecoin': return discoverDogecoinProviders(win);
      default: return Promise.resolve([]);
    }
  };

  const extractAddress = (value, walletType, depth = 0) => {
    if (depth > 5 || value == null) return null;
    if (typeof value === 'string') return catalog.validateProfileWalletAddress(walletType, value) ? value : null;
    if (Array.isArray(value)) {
      for (const item of value) {
        const address = extractAddress(item, walletType, depth + 1);
        if (address) return address;
      }
      return null;
    }
    if (typeof value === 'object') {
      for (const key of ['address', 'accounts', 'addresses', 'result', 'payment', 'paymentAddress']) {
        const address = extractAddress(value[key], walletType, depth + 1);
        if (address) return address;
      }
    }
    return null;
  };

  const requestLinkedAddress = async (walletType, record, win = globalThis.window) => {
    const provider = record?.provider;
    if (!provider) throw new Error('Wallet provider is unavailable');
    let result;
    if (walletType === 'bitcoin') {
      if (record.kind === 'bitcoin-wbip') result = await provider.request('getAddresses', { purposes: ['payment', 'ordinals'] });
      else if (typeof provider.requestAccounts === 'function') result = await provider.requestAccounts();
      else result = await provider.getAccounts();
    } else if (walletType === 'polkadot') {
      const extension = await provider.enable(win?.location?.origin || 'ChainLens');
      result = await extension?.accounts?.get?.();
    } else if (walletType === 'tron') {
      result = await provider.request({ method: 'tron_requestAccounts' });
      result = extractAddress(result, walletType) || win?.tronWeb?.defaultAddress?.base58 || win?.tronLink?.tronWeb?.defaultAddress?.base58;
    } else if (walletType === 'dogecoin') {
      result = typeof provider.requestAccounts === 'function' ? await provider.requestAccounts() : await provider.getAccounts();
    } else {
      throw new Error(`Provider linking is not supported for ${walletType}`);
    }
    const address = extractAddress(result, walletType);
    if (!address) throw new Error(`The wallet did not return a valid ${walletType} address`);
    return address;
  };

  return {
    discoverEvmProviders,
    discoverSolanaProviders,
    discoverCardanoProviders,
    discoverBitcoinProviders,
    discoverPolkadotProviders,
    discoverTronProviders,
    discoverDogecoinProviders,
    discoverWalletProviders,
    requestLinkedAddress,
    extractAddress,
  };
}));
