const { blake2b } = require('@noble/hashes/blake2b');
const { CHAIN_MAP } = require('./public/chain-catalog');

const BITCOIN_ESPLORA = ['https://mempool.space/api', 'https://blockstream.info/api'];
const POLKADOT_RPCS = ['https://rpc.polkadot.io', 'https://polkadot-rpc.dwellir.com'];
const DOGE_API = 'https://api.blockcypher.com/v1/doge/main';
const TRON_API = 'https://api.trongrid.io';
const DOT_ACCOUNT_STORAGE_PREFIX = '26aa394eea5630e07c48ae0c9558cef7b99d880ec681799c0cf30e8886371da9';

const base58Decode = (input) => {
  const alphabet = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  let value = 0n;
  for (const char of input) {
    const digit = alphabet.indexOf(char);
    if (digit < 0) throw new Error('Invalid Base58 address');
    value = value * 58n + BigInt(digit);
  }

  let hex = value.toString(16);
  if (hex.length % 2) hex = `0${hex}`;
  const body = value === 0n ? Buffer.alloc(0) : Buffer.from(hex, 'hex');
  let leadingZeros = 0;
  while (leadingZeros < input.length && input[leadingZeros] === '1') leadingZeros += 1;
  return Buffer.concat([Buffer.alloc(leadingZeros), body]);
};

const polkadotStorageKey = (address) => {
  const decoded = base58Decode(address);
  if (decoded.length !== 35 || decoded[0] !== 0) throw new Error('Invalid Polkadot mainnet address');
  const publicKey = decoded.subarray(1, 33);
  const hash = Buffer.from(blake2b(publicKey, { dkLen: 16 })).toString('hex');
  return `0x${DOT_ACCOUNT_STORAGE_PREFIX}${hash}${publicKey.toString('hex')}`;
};

const decodeDotBalance = (storageHex) => {
  if (!storageHex || storageHex === '0x') return 0;
  const bytes = Buffer.from(storageHex.slice(2), 'hex');
  if (bytes.length < 32) return 0;
  const low = bytes.readBigUInt64LE(16);
  const high = bytes.readBigUInt64LE(24);
  return Number(low + (high << 64n)) / 1e10;
};

const tronAddressHex = (address) => {
  const decoded = base58Decode(address);
  if (decoded.length !== 25) throw new Error('Invalid Tron address');
  return decoded.subarray(0, 21).toString('hex').toLowerCase();
};

const withTimeout = (options = {}, timeoutMs = 12000) => ({
  ...options,
  signal: options.signal || AbortSignal.timeout(timeoutMs),
});

const createNonEvmScanner = ({
  fetchImpl = globalThis.fetch,
  getNativePrice = async () => 0,
  getTokenImage = async () => '',
  subscanApiKey = '',
} = {}) => {
  if (typeof fetchImpl !== 'function') throw new Error('A fetch implementation is required');

  const fetchJson = async (url, options, timeoutMs) => {
    const response = await fetchImpl(url, withTimeout(options, timeoutMs));
    const json = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(`Upstream ${response.status}`);
    return json;
  };

  const nativeAsset = async (chainId, balance, decimals = 8) => {
    if (!(balance > 0)) return [];
    const chain = CHAIN_MAP[chainId];
    const [usdPrice, image] = await Promise.all([
      getNativePrice(chain.native),
      getTokenImage(chain.native),
    ]);
    return [{
      id: 'native',
      name: chain.label,
      symbol: chain.native,
      balance: balance.toFixed(decimals),
      usdPrice,
      nativePrice: balance.toFixed(decimals),
      totalValue: (balance * usdPrice).toFixed(2),
      image,
      chain: chainId,
      isToken: true,
    }];
  };

  const bitcoinBalance = async (address) => {
    let lastError;
    for (const base of BITCOIN_ESPLORA) {
      try {
        const data = await fetchJson(`${base}/address/${encodeURIComponent(address)}`);
        const confirmed = data.chain_stats.funded_txo_sum - data.chain_stats.spent_txo_sum;
        const pending = data.mempool_stats.funded_txo_sum - data.mempool_stats.spent_txo_sum;
        return (confirmed + pending) / 1e8;
      } catch (error) { lastError = error; }
    }
    throw lastError || new Error('Bitcoin providers unavailable');
  };

  const bitcoinTransactions = async (address) => {
    const rows = await fetchJson(`${BITCOIN_ESPLORA[0]}/address/${encodeURIComponent(address)}/txs`);
    return rows.slice(0, 25).map(tx => {
      const inputAddresses = (tx.vin || []).map(input => input.prevout?.scriptpubkey_address).filter(Boolean);
      const sent = inputAddresses.includes(address);
      const relevantOutputs = (tx.vout || []).filter(output => sent
        ? output.scriptpubkey_address !== address
        : output.scriptpubkey_address === address);
      const satoshis = relevantOutputs.reduce((sum, output) => sum + (output.value || 0), 0);
      return {
        hash: tx.txid,
        type: sent ? 'sent' : 'received',
        from: sent ? address : inputAddresses[0] || '',
        to: sent ? relevantOutputs[0]?.scriptpubkey_address || '' : address,
        value: satoshis / 1e8,
        asset: 'BTC',
        category: 'transaction',
        timestamp: (tx.status?.block_time || Math.floor(Date.now() / 1000)) * 1000,
        chain: 'bitcoin',
      };
    }).filter(tx => tx.value > 0);
  };

  const dogecoinBalance = async (address) => {
    try {
      const data = await fetchJson(`${DOGE_API}/addrs/${encodeURIComponent(address)}/balance`);
      return Number(data.final_balance || 0) / 1e8;
    } catch {
      const data = await fetchJson(`https://dogechain.info/api/v1/address/balance/${encodeURIComponent(address)}`);
      return Number(data.balance || 0);
    }
  };

  const dogecoinTransactions = async (address) => {
    const data = await fetchJson(`${DOGE_API}/addrs/${encodeURIComponent(address)}?limit=100`);
    const byHash = new Map();
    for (const ref of data.txrefs || []) {
      const record = byHash.get(ref.tx_hash) || { net: 0, timestamp: 0 };
      const value = Number(ref.value || 0);
      record.net += ref.tx_input_n >= 0 ? -value : value;
      record.timestamp = Math.max(record.timestamp, Date.parse(ref.confirmed || '') || 0);
      byHash.set(ref.tx_hash, record);
    }
    return Array.from(byHash.entries()).slice(0, 25).map(([hash, record]) => ({
      hash,
      type: record.net < 0 ? 'sent' : record.net > 0 ? 'received' : 'self',
      from: record.net < 0 ? address : '',
      to: record.net > 0 ? address : '',
      value: Math.abs(record.net) / 1e8,
      asset: 'DOGE',
      category: 'transaction',
      timestamp: record.timestamp || Date.now(),
      chain: 'dogecoin',
    })).filter(tx => tx.value > 0);
  };

  const polkadotBalance = async (address) => {
    const storageKey = polkadotStorageKey(address);
    let lastError;
    for (const rpc of POLKADOT_RPCS) {
      try {
        const data = await fetchJson(rpc, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'state_getStorage', params: [storageKey] }),
        });
        if (data.error) throw new Error(data.error.message || 'Polkadot RPC error');
        return decodeDotBalance(data.result);
      } catch (error) { lastError = error; }
    }
    throw lastError || new Error('Polkadot providers unavailable');
  };

  const polkadotTransactions = async (address) => {
    // Relay-chain RPCs do not index history by account. Subscan is optional and
    // authenticated; balances continue to work through public RPC without it.
    if (!subscanApiKey) return [];
    const data = await fetchJson('https://polkadot.api.subscan.io/api/v2/scan/transfers', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': subscanApiKey },
      body: JSON.stringify({ address, row: 25, page: 0, order: 'desc' }),
    });
    return (data.data?.transfers || []).map(tx => ({
      hash: tx.extrinsic_hash,
      type: tx.from === address && tx.to === address ? 'self' : tx.from === address ? 'sent' : 'received',
      from: tx.from || '',
      to: tx.to || '',
      value: Number(tx.amount || 0),
      asset: tx.asset_symbol || 'DOT',
      category: 'transaction',
      timestamp: Number(tx.block_timestamp || 0) * 1000,
      chain: 'polkadot',
    })).filter(tx => tx.hash && tx.value > 0);
  };

  const tronBalance = async (address) => {
    const data = await fetchJson(`${TRON_API}/wallet/getaccount`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ address, visible: true }),
    });
    return Number(data.balance || 0) / 1e6;
  };

  const tronTransactions = async (address) => {
    const addressHex = tronAddressHex(address);
    const data = await fetchJson(`${TRON_API}/v1/accounts/${encodeURIComponent(address)}/transactions?only_confirmed=true&limit=50&order_by=block_timestamp,desc`);
    return (data.data || []).map(tx => {
      const contract = tx.raw_data?.contract?.find(item => item.type === 'TransferContract');
      if (!contract) return null;
      const transfer = contract.parameter?.value || {};
      const from = String(transfer.owner_address || '').replace(/^0x/, '').toLowerCase();
      const to = String(transfer.to_address || '').replace(/^0x/, '').toLowerCase();
      const type = from === addressHex && to === addressHex ? 'self' : from === addressHex ? 'sent' : to === addressHex ? 'received' : null;
      if (!type) return null;
      return {
        hash: tx.txID,
        type,
        from: type === 'received' ? '' : address,
        to: type === 'sent' ? '' : address,
        value: Number(transfer.amount || 0) / 1e6,
        asset: 'TRX',
        category: 'transaction',
        timestamp: Number(tx.block_timestamp || 0),
        chain: 'tron',
        fee: Number(tx.ret?.[0]?.fee || 0) / 1e6,
      };
    }).filter(tx => tx && tx.value > 0);
  };

  const scanTokens = async (chainId, address) => {
    switch (chainId) {
      case 'bitcoin': return nativeAsset(chainId, await bitcoinBalance(address), 8);
      case 'dogecoin': return nativeAsset(chainId, await dogecoinBalance(address), 8);
      case 'polkadot': return nativeAsset(chainId, await polkadotBalance(address), 4);
      case 'tron': return nativeAsset(chainId, await tronBalance(address), 6);
      default: throw new Error(`Unsupported non-EVM chain: ${chainId}`);
    }
  };

  const scanTransactions = async (chainId, address) => {
    switch (chainId) {
      case 'bitcoin': return bitcoinTransactions(address);
      case 'dogecoin': return dogecoinTransactions(address);
      case 'polkadot': return polkadotTransactions(address);
      case 'tron': return tronTransactions(address);
      default: throw new Error(`Unsupported non-EVM chain: ${chainId}`);
    }
  };

  return { scanTokens, scanTransactions };
};

module.exports = {
  createNonEvmScanner,
  _internals: { base58Decode, polkadotStorageKey, decodeDotBalance, tronAddressHex },
};
