const test = require('node:test');
const assert = require('node:assert/strict');
const { getAppMatchTags, matchApps, parseSearchIntent, rankApps } = require('../public/search-intent');

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
