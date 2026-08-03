(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.ChainLensSearchIntent = api;
}(typeof window !== 'undefined' ? window : globalThis, function () {
  var STOP_WORDS = new Set(['a', 'an', 'and', 'app', 'apps', 'best', 'crypto', 'dapp', 'dapps', 'find', 'for', 'in', 'of', 'on', 'the', 'to', 'top', 'web3']);
  var CHAIN_ALIASES = {
    ada: 'cardano', arb: 'arbitrum', avax: 'avalanche', btc: 'bitcoin',
    eth: 'ethereum', hyperliquid: 'hype', matic: 'polygon', op: 'optimism',
    sol: 'solana', world: 'worldchain'
  };
  var CATEGORY_ALIASES = {
    ai: ['ai'], bridge: ['bridge / interoperability'], bridges: ['bridge / interoperability'],
    crosschain: ['bridge / interoperability'], defi: ['defi'], dex: ['dex'],
    exchange: ['dex'], exchanges: ['dex'], game: ['gaming'], games: ['gaming'], gaming: ['gaming'],
    identity: ['identity'], launchpad: ['launchpad'], launchpads: ['launchpad'],
    marketplace: ['nft marketplace'], marketplaces: ['nft marketplace'], mint: ['minting services'],
    minting: ['minting services'], nft: ['nft marketplace'], nfts: ['nft marketplace'],
    payment: ['payments'], payments: ['payments'], perps: ['perps & prediction markets'],
    portfolio: ['portfolio & analytics'], prediction: ['perps & prediction markets'],
    rwa: ['real world assets'], social: ['social'], stablecoin: ['stablecoins'],
    stablecoins: ['stablecoins'], swap: ['dex'], swaps: ['dex'], wallet: ['wallet'], wallets: ['wallet']
  };
  var SEARCH_FEATURED_APP_IDS = [
    'magicmoney-wallet',
    'sappy-seals',
    'emonad',
    'defillama',
    'uniswap',
    'pump-fun'
  ];

  var normalize = function (value) {
    return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
  };
  var titleCase = function (value) {
    return String(value || '').replace(/(^|[-\s])\S/g, function (letter) { return letter.toUpperCase(); });
  };

  var parseSearchIntent = function (rawQuery, apps) {
    var normalized = normalize(rawQuery);
    var tokens = normalized ? normalized.split(' ') : [];
    var knownChains = new Set();
    (apps || []).forEach(function (app) {
      (Array.isArray(app.chains) ? app.chains : []).forEach(function (chain) { knownChains.add(normalize(chain)); });
    });
    var chains = [];
    var categories = [];
    var terms = [];
    tokens.forEach(function (token) {
      var chain = CHAIN_ALIASES[token] || token;
      if (knownChains.has(chain)) {
        if (chains.indexOf(chain) === -1) chains.push(chain);
        return;
      }
      if (CATEGORY_ALIASES[token]) {
        CATEGORY_ALIASES[token].forEach(function (category) {
          if (categories.indexOf(category) === -1) categories.push(category);
        });
        return;
      }
      if (!STOP_WORDS.has(token)) terms.push(token);
    });
    return { normalized: normalized, chains: chains, categories: categories, terms: terms };
  };

  var appSearchRecord = function (app) {
    var name = normalize(app.name);
    var category = normalize(app.category);
    var description = normalize(app.description || (app.categoryMeta && app.categoryMeta.description));
    var tags = (Array.isArray(app.tags) ? app.tags : []).map(normalize).filter(Boolean);
    var chains = (Array.isArray(app.chains) ? app.chains : []).map(normalize);
    return { name: name, category: category, description: description, tags: tags, chains: chains,
      text: [name, category, description].concat(tags, chains).join(' ') };
  };

  var scoreApp = function (app, intent) {
    var record = appSearchRecord(app);
    if (intent.chains.length && !intent.chains.every(function (chain) { return record.chains.indexOf(chain) !== -1; })) return 0;
    if (intent.categories.length && !intent.categories.some(function (category) {
      return record.category === category || record.tags.some(function (tag) { return tag.indexOf(category) !== -1; });
    })) return 0;
    if (intent.terms.length && !intent.terms.every(function (term) { return record.text.indexOf(term) !== -1; })) return 0;

    var score = 0;
    if (record.name === intent.normalized) score += 200;
    else if (record.name.startsWith(intent.normalized)) score += 120;
    else if (record.name.indexOf(intent.normalized) !== -1) score += 90;
    score += intent.chains.length * 55;
    score += intent.categories.length * 50;
    score += intent.terms.reduce(function (total, term) {
      if (record.name.indexOf(term) !== -1) return total + 35;
      if (record.tags.some(function (tag) { return tag.indexOf(term) !== -1; })) return total + 25;
      if (record.category.indexOf(term) !== -1) return total + 20;
      return total + 10;
    }, 0);
    if (app.featured) score += 2;
    return score;
  };

  var matchApps = function (apps, rawQuery) {
    var list = apps || [];
    var intent = parseSearchIntent(rawQuery, list);
    if (!intent.normalized) {
      return list.filter(function (app) { return app.featured; })
        .concat(list.filter(function (app) { return !app.featured; }));
    }
    return list.map(function (app) { return { app: app, score: scoreApp(app, intent) }; })
      .filter(function (entry) { return entry.score > 0; })
      .sort(function (a, b) { return b.score - a.score || a.app.name.localeCompare(b.app.name); })
      .map(function (entry) { return entry.app; });
  };

  var rankApps = function (apps, rawQuery) {
    return matchApps(apps, rawQuery).slice(0, 6);
  };

  var getSearchFeaturedApps = function (apps) {
    var appsById = new Map((apps || []).map(function (app) { return [app.id, app]; }));
    return SEARCH_FEATURED_APP_IDS.map(function (id) { return appsById.get(id); }).filter(Boolean);
  };

  var getAppMatchTags = function (app, rawQuery, apps) {
    var intent = parseSearchIntent(rawQuery, apps || [app]);
    var tags = [];
    intent.chains.forEach(function (chain) {
      if ((app.chains || []).map(normalize).indexOf(chain) !== -1) tags.push(titleCase(chain));
    });
    if (intent.categories.length) tags.push(app.category);
    return tags.slice(0, 2);
  };

  return { getAppMatchTags: getAppMatchTags, getSearchFeaturedApps: getSearchFeaturedApps, matchApps: matchApps, parseSearchIntent: parseSearchIntent, rankApps: rankApps, scoreApp: scoreApp };
}));
