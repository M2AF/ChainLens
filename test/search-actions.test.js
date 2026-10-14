const test = require('node:test');
const assert = require('node:assert/strict');
const { matchActionApps, parseActionIntent } = require('../public/search-actions');

const apps = [
  { id: 'across', name: 'Across Protocol', category: 'Bridge / Interoperability', chains: ['arbitrum', 'base', 'ethereum'], featured: false, description: 'Intents-based bridge for fast transfers.' },
  { id: 'axelar', name: 'Axelar', category: 'Bridge / Interoperability', chains: ['ethereum', 'monad', 'solana'], featured: false, description: 'Cross-chain messaging network.' },
  { id: 'wormhole', name: 'Wormhole', category: 'Bridge / Interoperability', chains: ['monad', 'solana', 'base'], featured: true, description: 'Cross-chain bridge.' },
  { id: 'jupiter', name: 'Jupiter', category: 'DEX', chains: ['solana'], featured: true, description: 'Swap aggregator for Solana.' },
  { id: 'minswap', name: 'Minswap', category: 'DEX', chains: ['cardano'], featured: false, description: 'Cardano DEX.' },
  { id: 'lifi', name: 'LiFi', category: 'Bridge / Interoperability', chains: ['base', 'cardano'], featured: false, description: 'Bridge and swap aggregator.' },
  { id: 'jito', name: 'Jito', category: 'DeFi', chains: ['solana'], featured: false, description: 'Liquid staking for SOL.' },
  { id: 'lido', name: 'Lido', category: 'DeFi', chains: ['ethereum'], featured: true, description: 'Liquid staking for ETH.' },
  { id: 'eternl', name: 'Eternl', category: 'Wallet', chains: ['cardano'], featured: false, description: 'Wallet with staking support.' },
  { id: 'aave', name: 'Aave', category: 'DeFi', chains: ['base', 'ethereum', 'hype'], featured: true, description: 'Lend and borrow crypto.' },
  { id: 'kamino', name: 'Kamino', category: 'DeFi', chains: ['solana'], featured: false, description: 'Lending and borrowing on Solana.' },
  { id: 'game', name: 'Bridge Quest', category: 'Gaming', chains: ['base'], featured: false, description: 'A game.' }
];
const ids = list => list.map(app => app.id);

test('retired and unsupported action networks do not inherit broad App Hub tags', () => {
  const catalog = [{id:'lido',name:'Lido',category:'DeFi',chains:['ethereum','solana'],description:'Liquid staking'}, {id:'thorchain',name:'THORChain',category:'Bridge / Interoperability',chains:['monad','solana','ethereum','bitcoin'],description:'Bridge and swap assets'}];
  assert.deepEqual(matchActionApps(catalog,parseActionIntent('stake SOL')),[]);
  assert.deepEqual(matchActionApps(catalog,parseActionIntent('bridge Monad to Solana')),[]);
  assert.deepEqual(ids(matchActionApps(catalog,parseActionIntent('stake on Ethereum'))),['lido']);
});

test('parses bridge direction and normalizes aliases', () => {
  assert.deepEqual(parseActionIntent('bridge Monad to Solana'), {
    action: 'bridge', fromChain: 'monad', toChain: 'solana', chain: null, asset: null,
    query: 'bridge Monad to Solana', appQuery: 'bridge monad solana'
  });
  const reversed = parseActionIntent('bridge Solana to Monad');
  assert.equal(reversed.fromChain, 'solana');
  assert.equal(reversed.toChain, 'monad');
  const withAsset = parseActionIntent('Bridge USDC from Arb to SOL');
  assert.equal(withAsset.fromChain, 'arbitrum');
  assert.equal(withAsset.toChain, 'solana');
  assert.equal(withAsset.asset, 'USDC');
  assert.equal(parseActionIntent('bridge Base -> Arbitrum One').toChain, 'arbitrum');
  assert.equal(parseActionIntent('how to bridge ETH to Base').toChain, 'base');
});

test('parses stake, lend and swap examples', () => {
  const stake = parseActionIntent('stake SOL');
  assert.equal(stake.action, 'stake');
  assert.equal(stake.asset, 'SOL');
  assert.equal(stake.chain, 'solana');
  const lend = parseActionIntent('lend USDC on Base');
  assert.deepEqual([lend.action, lend.chain, lend.asset], ['lend', 'base', 'USDC']);
  const swap = parseActionIntent('swap ADA to USDC on Cardano');
  assert.deepEqual([swap.action, swap.chain, swap.asset, swap.fromChain, swap.toChain], ['swap', 'cardano', 'ADA', null, null]);
  assert.equal(parseActionIntent('swap ADA to USDC').chain, 'cardano');
});

test('never infers a chain from a stablecoin or ambiguous ticker', () => {
  assert.equal(parseActionIntent('lend USDC').chain, null);
  assert.equal(parseActionIntent('stake ETH').chain, null);
  assert.equal(parseActionIntent('swap SOL to ADA').chain, null);
  assert.equal(parseActionIntent('lend 0x0000000000000000000000000000000000000001').asset, '0x0000000000000000000000000000000000000001');
});

test('handles contradictory, same and unknown chains without inventing routes', () => {
  const same = parseActionIntent('bridge Monad to Monad');
  assert.deepEqual([same.fromChain, same.toChain, same.chain], [null, null, null]);
  const conflict = parseActionIntent('bridge USDC from Base and Solana to Monad');
  assert.equal(conflict.fromChain, null);
  assert.equal(conflict.toChain, 'monad');
  const unknown = parseActionIntent('bridge USDC from Frobnicate to Solana');
  assert.deepEqual([unknown.fromChain, unknown.toChain, unknown.asset], [null, 'solana', 'USDC']);
  const onlyOn = parseActionIntent('bridge USDC on Base');
  assert.deepEqual([onlyOn.chain, onlyOn.fromChain, onlyOn.toChain], ['base', null, null]);
  assert.equal(parseActionIntent('bridge USDC on Base to Solana').fromChain, 'base');
  const bare = parseActionIntent('bridge');
  assert.deepEqual([bare.action, bare.chain, bare.asset, bare.appQuery], ['bridge', null, null, 'bridge']);
});

test('returns null for unsupported or non-action text', () => {
  ['mint NFT on Base', 'best bridges', 'Solana', 'trade ETH', '', '   ', 'x'.repeat(300)].forEach(query => {
    assert.equal(parseActionIntent(query), null, query);
  });
  assert.equal(parseActionIntent(null), null);
  assert.equal(parseActionIntent({ toString: () => 'bridge' }), null);
});

test('matches bridges that support both chains and ranks them', () => {
  const intent = parseActionIntent('bridge Monad to Solana');
  assert.deepEqual(ids(matchActionApps(apps, intent)), ['wormhole', 'axelar']);
  assert.deepEqual(ids(matchActionApps(apps, parseActionIntent('bridge'))).slice(0, 3), ['wormhole', 'across', 'lifi']);
  assert.ok(ids(matchActionApps(apps, parseActionIntent('bridge'))).includes('game'));
  assert.deepEqual(matchActionApps(apps, parseActionIntent('bridge Cardano to Monad')), []);
});

test('filters stake, lend and swap by evidence and chain', () => {
  assert.deepEqual(ids(matchActionApps(apps, parseActionIntent('stake SOL'))), ['jito']);
  assert.deepEqual(ids(matchActionApps(apps, parseActionIntent('stake ADA'))), ['eternl']);
  assert.deepEqual(ids(matchActionApps(apps, parseActionIntent('lend USDC on Base'))), ['aave']);
  assert.deepEqual(ids(matchActionApps(apps, parseActionIntent('lend USDC on Solana'))), ['kamino']);
  assert.deepEqual(ids(matchActionApps(apps, parseActionIntent('swap ADA to USDC on Cardano'))), ['minswap', 'lifi']);
  assert.deepEqual(ids(matchActionApps(apps, parseActionIntent('swap on Solana'))), ['jupiter']);
});

test('maps HyperEVM to the App Hub hype id', () => {
  const intent = parseActionIntent('lend USDC on HyperEVM');
  assert.equal(intent.chain, 'hyperevm');
  assert.match(intent.appQuery, /hype/);
  assert.deepEqual(ids(matchActionApps(apps, intent)), ['aave']);
});

test('does not mutate app data, intent or return unrelated apps', () => {
  const snapshot = JSON.stringify(apps);
  const intent = parseActionIntent('bridge Monad to Solana');
  const frozenIntent = JSON.stringify(intent);
  const frozen = apps.map(app => Object.freeze({ ...app, chains: Object.freeze([...app.chains]) }));
  const result = matchActionApps(frozen, intent);
  assert.equal(JSON.stringify(apps), snapshot);
  assert.equal(JSON.stringify(intent), frozenIntent);
  assert.ok(result.every(app => frozen.includes(app)));
  assert.deepEqual(matchActionApps(null, intent), []);
  assert.deepEqual(matchActionApps(apps, null), []);
  assert.deepEqual(matchActionApps(apps, { action: 'mint' }), []);
  assert.deepEqual(matchActionApps([null, 3, {}], intent), []);
});
