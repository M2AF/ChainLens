const test = require('node:test');
const assert = require('node:assert/strict');
const { getAppMatchTags, getSearchFeaturedApps, matchApps, parseSearchIntent, rankApps } = require('../public/search-intent');

const apps = [
  { id: 'yoroi', name: 'Yoroi Wallet', category: 'Wallet', chains: ['cardano'], featured: false, description: 'A light wallet for ADA.' },
  { id: 'lace', name: 'Lace', category: 'Wallet', chains: ['cardano'], featured: true, description: 'A Cardano wallet.' },
  { id: 'phantom', name: 'Phantom', category: 'Wallet', chains: ['solana', 'ethereum'], featured: true, description: 'A multichain wallet.' },
  { id: 'minswap', name: 'Minswap', category: 'DEX', chains: ['cardano'], featured: true, description: 'Swap Cardano tokens.' },
  { id: 'jpg-store', name: 'JPG Store', category: 'NFT Marketplace', chains: ['cardano'], featured: false, description: 'Buy and sell NFTs.' },
  { id: 'vault', name: 'Vault', category: 'DeFi', chains: ['ethereum'], tags: ['hardware wallet'], featured: false, description: 'Secure DeFi.' },
];

test('combines chain and app-type intent for Cardano wallet searches', () => {
  const results = rankApps(apps, 'Cardano wallets');
  assert.deepEqual(results.map(app => app.id), ['lace', 'yoroi']);
  assert.deepEqual(getAppMatchTags(results[0], 'Cardano wallets', apps), ['Cardano', 'Wallet']);
});

test('understands plurals, synonyms, and filler words', () => {
  assert.deepEqual(rankApps(apps, 'best NFT marketplaces on Cardano').map(app => app.id), ['jpg-store']);
  assert.deepEqual(rankApps(apps, 'swap on Cardano').map(app => app.id), ['minswap']);
  assert.deepEqual(parseSearchIntent('ADA wallets', apps).chains, ['cardano']);
});

test('supports optional search tags without weakening chain filters', () => {
  assert.deepEqual(rankApps(apps, 'hardware wallet').map(app => app.id), ['vault']);
  assert.deepEqual(rankApps(apps, 'Cardano hardware wallet'), []);
});

test('returns the complete intent-matched set for App Hub filtering', () => {
  const manyWallets = Array.from({ length: 9 }, (_, index) => ({
    id: `cardano-wallet-${index}`,
    name: `Cardano Wallet ${index}`,
    category: 'Wallet',
    chains: ['cardano'],
    featured: false,
  }));
  assert.equal(matchApps(manyWallets, 'Cardano wallets').length, 9);
  assert.equal(rankApps(manyWallets, 'Cardano wallets').length, 6);
});

test('returns the curated Search page featured apps in their display order', () => {
  const catalog = [
    { id: 'pump-fun', name: 'pump.fun' },
    { id: 'uniswap', name: 'Uniswap' },
    { id: 'unrelated', name: 'Unrelated' },
    { id: 'magicmoney-wallet', name: 'MagicMoney Wallet' },
    { id: 'defillama', name: 'DefiLlama' },
    { id: 'emonad', name: 'Emonad' },
    { id: 'sappy-seals', name: 'Sappy Seals' },
  ];

  assert.deepEqual(getSearchFeaturedApps(catalog).map(app => app.id), [
    'magicmoney-wallet',
    'sappy-seals',
    'emonad',
    'defillama',
    'uniswap',
    'pump-fun',
  ]);
});

const vm = require('node:vm'), fs = require('node:fs');
const catalogContext = { window: {} };
vm.runInNewContext(fs.readFileSync(require.resolve('../app-hub-data.js'), 'utf8'), catalogContext);
const catalog = Object.values(catalogContext.window)[0];
test('every App Hub category and chain is searchable from the actual catalog', () => {
  for (const category of catalog.categories) {
    for (const query of [category.name, category.short]) {
      const found = matchApps(catalog.apps, query);
      for (const app of catalog.apps.filter(a => a.category === category.name)) assert.ok(found.includes(app), `${query}: missing ${app.name}`);
    }
  }
  for (const chain of catalog.chains) {
    const found = matchApps(catalog.apps, chain.label);
    for (const app of catalog.apps) assert.equal(found.includes(app), app.chains.includes(chain.id), `${chain.label}: ${app.name}`);
  }
});
test('every App Hub app name finds its original record despite category and chain words', () => {
  for (const app of catalog.apps) assert.ok(rankApps(catalog.apps, app.name).includes(app), app.name);
  for (const q of ['constructor', '__proto__', 'toString']) assert.doesNotThrow(() => matchApps(catalog.apps, q));
});
test('full category phrases combine with chain constraints and plurals', () => {
  for (const category of catalog.categories) for (const chain of catalog.chains) {
    const found = matchApps(catalog.apps, category.name + ' on ' + chain.label);
    const expected = catalog.apps.filter(a => a.category === category.name && a.chains.includes(chain.id));
    assert.deepEqual(found.map(a=>a.id).sort(), expected.map(a=>a.id).sort(), category.name+' '+chain.label);
  }
  assert.ok(matchApps(catalog.apps, 'NFT marketplaces').every(a=>a.category==='NFT Marketplace'));
});
test('optional tags containing category words remain searchable with chain constraints', () => {
  const tagged = [
    {id:'tagged',name:'Tagged app',category:'Social',chains:['cardano'],tags:['NFT gaming','cross chain tools','hardware wallet']},
    {id:'other',name:'Other app',category:'Gaming',chains:['solana'],tags:[]}
  ];
  for(const tag of tagged[0].tags) {
    assert.deepEqual(matchApps(tagged,tag).map(a=>a.id),['tagged']);
    assert.deepEqual(matchApps(tagged,tag+' on Cardano').map(a=>a.id),['tagged']);
    assert.deepEqual(matchApps(tagged,tag+' on Solana'),[]);
  }
});
