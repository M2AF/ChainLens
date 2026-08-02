const test = require('node:test');
const assert = require('node:assert/strict');
const {
  discoverEvmProviders,
  discoverSolanaProviders,
  discoverCardanoProviders,
  discoverBitcoinProviders,
  discoverPolkadotProviders,
  requestLinkedAddress,
} = require('../public/wallet-providers');

class FakeCustomEvent {
  constructor(type, options = {}) {
    this.type = type;
    this.detail = options.detail;
  }
}

class FakeWindow {
  constructor() {
    this.CustomEvent = FakeCustomEvent;
    this.location = { origin: 'https://chainlens.example' };
    this._listeners = new Map();
  }

  addEventListener(type, listener) {
    const listeners = this._listeners.get(type) || [];
    listeners.push(listener);
    this._listeners.set(type, listeners);
  }

  removeEventListener(type, listener) {
    this._listeners.set(type, (this._listeners.get(type) || []).filter(item => item !== listener));
  }

  dispatchEvent(event) {
    for (const listener of this._listeners.get(event.type) || []) listener(event);
    return true;
  }
}

test('discovers every EIP-6963 EVM wallet and keeps Magic Money identifiable', async () => {
  const win = new FakeWindow();
  const magicMoney = { isMagicMoney: true, request: async () => [] };
  const metamask = { isMetaMask: true, request: async () => [] };
  win.ethereum = { providers: [metamask] };
  win.addEventListener('eip6963:requestProvider', () => {
    win.dispatchEvent(new FakeCustomEvent('eip6963:announceProvider', {
      detail: {
        info: { uuid: 'magic-money', name: 'MagicMoney Wallet', icon: 'data:image/svg+xml,magic' },
        provider: magicMoney,
      },
    }));
  });

  const providers = await discoverEvmProviders(win, 0);
  assert.deepEqual(providers.map(provider => provider.name), ['MagicMoney Wallet', 'MetaMask']);
  assert.equal(providers[0].isMagicMoney, true);
});

test('uses Solana Wallet Standard and generically discovers legacy providers', async () => {
  const win = new FakeWindow();
  const magicMoney = {
    name: 'MagicMoney Wallet',
    icon: 'data:image/svg+xml,magic',
    features: {
      'standard:connect': { connect: async () => ({ accounts: [] }) },
      'solana:signMessage': { signMessage: async () => [] },
    },
  };
  win.addEventListener('wallet-standard:app-ready', event => event.detail.register(magicMoney));
  win.phantom = { solana: { isPhantom: true, connect: async () => ({}), signMessage: async () => ({}) } };

  const providers = await discoverSolanaProviders(win, 0);
  assert.deepEqual(providers.map(provider => provider.name), ['MagicMoney Wallet', 'Phantom']);
  assert.equal(providers[0].kind, 'solana-standard');
});

test('enumerates CIP-30 wallets without duplicating provider aliases', async () => {
  const win = new FakeWindow();
  const magicMoney = { name: 'MagicMoney Wallet', icon: 'magic', enable: async () => ({}) };
  win.cardano = {
    magicmoney: magicMoney,
    vespr: magicMoney,
    eternl: { name: 'Eternl', enable: async () => ({}) },
  };

  const providers = await discoverCardanoProviders(win);
  assert.deepEqual(providers.map(provider => provider.name), ['MagicMoney Wallet', 'Eternl']);
});

test('discovers and requests Magic Money Bitcoin and Polkadot accounts', async () => {
  const win = new FakeWindow();
  const bitcoin = 'bc1qt6cx7977r8xttn5rg42d2ulnlc7agspycd600w';
  const polkadot = '16TWXXseQJd9xhYrHTLNMUukVi4AVw1EgdHAJ28geCANrQ6';
  const bitcoinProvider = {
    id: 'MagicMoneyProviders.BitcoinProvider',
    name: 'MagicMoney Wallet',
    isMagicMoney: true,
    request: async () => ({ status: 'success', result: { addresses: [{ address: bitcoin }] } }),
  };
  win.MagicMoneyProviders = { BitcoinProvider: bitcoinProvider };
  win.btc_providers = [{ id: bitcoinProvider.id, name: bitcoinProvider.name }];
  win.injectedWeb3 = {
    magicmoney: {
      name: 'MagicMoney Wallet',
      enable: async () => ({ accounts: { get: async () => [{ address: polkadot }] } }),
    },
  };

  const bitcoinProviders = await discoverBitcoinProviders(win);
  const polkadotProviders = await discoverPolkadotProviders(win);
  assert.equal(bitcoinProviders.length, 1);
  assert.equal(polkadotProviders.length, 1);
  assert.equal(await requestLinkedAddress('bitcoin', bitcoinProviders[0], win), bitcoin);
  assert.equal(await requestLinkedAddress('polkadot', polkadotProviders[0], win), polkadot);
});
