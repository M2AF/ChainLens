const test = require('node:test');
const assert = require('node:assert/strict');
const {
  DEFAULT_CHAINS,
  EVM_CHAINS,
  ACCOUNT_CHAINS,
  UTXO_CHAINS,
  PROFILE_WALLET_TYPES,
  detectAddressChain,
  parseAddressInput,
  validateProfileWalletAddress,
  normalizeProfileWalletAddress,
} = require('../public/chain-catalog');
const { createNonEvmScanner, _internals } = require('../non-evm-scanner');

const response = (body, ok = true, status = ok ? 200 : 500) => ({
  ok,
  status,
  json: async () => body,
});

test('matches Magic Money default-mainnet chain parity', () => {
  assert.equal(DEFAULT_CHAINS.length, 23);
  assert.equal(EVM_CHAINS.length, 17);
  assert.deepEqual(ACCOUNT_CHAINS.map(chain => chain.id), ['solana', 'polkadot', 'tron']);
  assert.deepEqual(UTXO_CHAINS.map(chain => chain.id), ['cardano', 'bitcoin', 'dogecoin']);
  assert.ok(EVM_CHAINS.some(chain => chain.id === 'robinhood' && chain.alchemyNetwork === 'robinhood-mainnet'));
});

test('profile wallet types cover every scanner chain exactly once', () => {
  assert.deepEqual(PROFILE_WALLET_TYPES.map(type => type.id), [
    'evm', 'solana', 'polkadot', 'tron', 'cardano', 'bitcoin', 'dogecoin',
  ]);
  const covered = PROFILE_WALLET_TYPES.flatMap(type => type.chainIds);
  assert.equal(covered.length, DEFAULT_CHAINS.length);
  assert.deepEqual([...covered].sort(), DEFAULT_CHAINS.map(chain => chain.id).sort());
  assert.equal(new Set(covered).size, DEFAULT_CHAINS.length);
});

test('profile wallet types use transparent chain logo assets', () => {
  for (const type of PROFILE_WALLET_TYPES) {
    assert.match(type.logoUrl, /^https:\/\/raw\.githubusercontent\.com\/trustwallet\/assets\/master\/blockchains\/.+\/info\/logo\.png$/);
    assert.equal(type.icon, undefined);
    assert.equal(type.color, undefined);
  }
});

test('detects and routes comma-separated addresses by scanner family', () => {
  const solana = '3noTuHnQdHkat2w5rBx18vAACMzFUvB5LodEe5vMN98d';
  const polkadot = '16TWXXseQJd9xhYrHTLNMUukVi4AVw1EgdHAJ28geCANrQ6';
  const tron = 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t';
  const cardano = 'addr1q950qv0ks9t29mavulaa5jr3sk2s50r5jfsddydjs0pazrfh32tdpt7zttt4mhl6t9purm4c9rv555z7r5mulq78aleqcg9c9h';
  const bitcoin = 'bc1qt6cx7977r8xttn5rg42d2ulnlc7agspycd600w';
  const dogecoin = 'DEgDVFa2DoW1533dxeDVdTxQFhMzs1pMke';

  assert.equal(detectAddressChain(solana), 'solana');
  assert.equal(detectAddressChain(polkadot), 'polkadot');
  assert.equal(detectAddressChain(tron), 'tron');
  assert.equal(detectAddressChain(cardano), 'cardano');
  assert.equal(detectAddressChain(bitcoin), 'bitcoin');
  assert.equal(detectAddressChain(dogecoin), 'dogecoin');

  assert.deepEqual(
    parseAddressInput(`${solana}, ${polkadot}, ${tron}`, 'account').map(entry => entry.chainId),
    ['solana', 'polkadot', 'tron']
  );
  assert.deepEqual(
    parseAddressInput(`$handle, ${cardano}, ${bitcoin}, ${dogecoin}`, 'utxo').map(entry => entry.chainId),
    ['cardano', 'cardano', 'bitcoin', 'dogecoin']
  );
  assert.equal(parseAddressInput(bitcoin, 'account')[0].chainId, null);
  assert.equal(validateProfileWalletAddress('bitcoin', bitcoin), true);
  assert.equal(validateProfileWalletAddress('cardano', bitcoin), false);
  assert.equal(validateProfileWalletAddress('unknown', bitcoin), false);
  assert.equal(
    normalizeProfileWalletAddress('evm', '0x01faF6DFc230d755141D84d7cB980dd68f5Efe13'),
    '0x01faf6dfc230d755141d84d7cb980dd68f5efe13'
  );
});

test('normalizes Bitcoin balance and history into ChainLens assets', async () => {
  const address = 'bc1qt6cx7977r8xttn5rg42d2ulnlc7agspycd600w';
  const scanner = createNonEvmScanner({
    getNativePrice: async symbol => symbol === 'BTC' ? 60000 : 0,
    getTokenImage: async () => 'https://example.test/btc.png',
    fetchImpl: async url => {
      if (url.endsWith(`/address/${address}`)) {
        return response({
          chain_stats: { funded_txo_sum: 300000000, spent_txo_sum: 100000000 },
          mempool_stats: { funded_txo_sum: 10000000, spent_txo_sum: 0 },
        });
      }
      if (url.endsWith(`/address/${address}/txs`)) {
        return response([{
          txid: 'btc-hash',
          vin: [{ prevout: { scriptpubkey_address: 'sender', value: 50000000 } }],
          vout: [{ scriptpubkey_address: address, value: 50000000 }],
          status: { block_time: 1234 },
        }]);
      }
      throw new Error(`Unexpected URL ${url}`);
    },
  });

  const assets = await scanner.scanTokens('bitcoin', address);
  assert.equal(assets[0].balance, '2.10000000');
  assert.equal(assets[0].totalValue, '126000.00');
  assert.equal(assets[0].chain, 'bitcoin');

  const transactions = await scanner.scanTransactions('bitcoin', address);
  assert.deepEqual(transactions[0], {
    hash: 'btc-hash', type: 'received', from: 'sender', to: address,
    value: 0.5, asset: 'BTC', category: 'transaction', timestamp: 1234000, chain: 'bitcoin',
  });
});

test('decodes Polkadot AccountInfo balances and Tron addresses', () => {
  const accountInfo = Buffer.alloc(32);
  accountInfo.writeBigUInt64LE(123450000000n, 16);
  assert.equal(_internals.decodeDotBalance(`0x${accountInfo.toString('hex')}`), 12.345);
  assert.equal(
    _internals.tronAddressHex('TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t'),
    '41a614f803b6fd780986a42c78ec9c7f77e6ded13c'
  );
  assert.match(
    _internals.polkadotStorageKey('16TWXXseQJd9xhYrHTLNMUukVi4AVw1EgdHAJ28geCANrQ6'),
    /^0x[0-9a-f]{160}$/
  );
});

test('normalizes native Tron balances and transfers', async () => {
  const address = 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t';
  const addressHex = '41a614f803b6fd780986a42c78ec9c7f77e6ded13c';
  const scanner = createNonEvmScanner({
    getNativePrice: async () => 0.25,
    getTokenImage: async () => '',
    fetchImpl: async (url) => {
      if (url.endsWith('/wallet/getaccount')) return response({ balance: 2500000 });
      if (url.includes(`/v1/accounts/${address}/transactions`)) {
        return response({ data: [{
          txID: 'trx-hash', block_timestamp: 9876, ret: [{ fee: 100000 }],
          raw_data: { contract: [{
            type: 'TransferContract',
            parameter: { value: { owner_address: addressHex, to_address: `41${'11'.repeat(20)}`, amount: 1500000 } },
          }] },
        }] });
      }
      throw new Error(`Unexpected URL ${url}`);
    },
  });

  const assets = await scanner.scanTokens('tron', address);
  assert.equal(assets[0].balance, '2.500000');
  assert.equal(assets[0].totalValue, '0.63');

  const transactions = await scanner.scanTransactions('tron', address);
  assert.equal(transactions[0].type, 'sent');
  assert.equal(transactions[0].value, 1.5);
  assert.equal(transactions[0].fee, 0.1);
});
