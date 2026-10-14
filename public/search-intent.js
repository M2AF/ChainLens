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
    var remaining = normalized;
    var categories = [];
    var tags = [];
    // Match catalog phrases before individual aliases (World, NFT, portfolio).
    var phrases = Array.from(new Set((apps || []).map(function (app) { return normalize(app.category); }).filter(Boolean))).sort(function (a, b) { return b.length - a.length; });
    var tagPhrases = Array.from(new Set((apps || []).flatMap(function (app) { return (app.tags || []).map(normalize); }).filter(Boolean))).sort(function (a, b) { return b.length - a.length; });
    tagPhrases.forEach(function (tag) {
      if ((' ' + remaining + ' ').includes(' ' + tag + ' ')) {
        tags.push(tag);
        remaining = (' ' + remaining + ' ').replace(' ' + tag + ' ', ' ').trim();
      }
    });
    phrases.forEach(function (category) {
      var pattern = new RegExp('(^| )' + category.split(' ').map(function (word) { return word.endsWith('s') ? word : word + 's?'; }).join(' ') + '(?= |$)', 'g');
      if (pattern.test(remaining)) {
        categories.push(category);
        remaining = remaining.replace(pattern, ' ');
      }
    });
    var tokens = remaining ? remaining.trim().split(' ').filter(Boolean) : [];
    var knownChains = new Set();
    (apps || []).forEach(function (app) {
      (Array.isArray(app.chains) ? app.chains : []).forEach(function (chain) { knownChains.add(normalize(chain)); });
    });
    var chains = [];
    var terms = [];
    tokens.forEach(function (token) {
      var chain = Object.hasOwn(CHAIN_ALIASES, token) ? CHAIN_ALIASES[token] : token;
      if (knownChains.has(chain)) {
        if (chains.indexOf(chain) === -1) chains.push(chain);
        return;
      }
      if (Object.hasOwn(CATEGORY_ALIASES, token)) {
        CATEGORY_ALIASES[token].forEach(function (category) {
          category = normalize(category);
          if (categories.indexOf(category) === -1) categories.push(category);
        });
        return;
      }
      if (!STOP_WORDS.has(token)) terms.push(token);
    });
    return { normalized: normalized, chains: chains, categories: categories, tags: tags, terms: terms };
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
    // A complete app name is authoritative even if it contains category/chain words.
    if (record.name === intent.normalized) return 200;
    if (intent.tags?.length && !intent.tags.every(function (tag) { return record.tags.includes(tag); })) return 0;
    if (intent.chains.length && !intent.chains.every(function (chain) { return record.chains.indexOf(chain) !== -1; })) return 0;
    if (intent.categories.length && !intent.categories.some(function (category) {
      return record.category === category || record.tags.some(function (tag) { return tag.indexOf(category) !== -1; });
    })) return 0;
    if (intent.terms.length && !intent.terms.every(function (term) { return record.text.indexOf(term) !== -1; })) return 0;

    var score = 0;
    if (record.name === intent.normalized) score += 200;
    else if (record.name.startsWith(intent.normalized)) score += 120;
    else if (record.name.indexOf(intent.normalized) !== -1) score += 90;
    score += (intent.tags || []).length * 60;
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

  var isExactAppName = function (apps, query) { return (apps || []).some(function (app) { return normalize(app.name) === normalize(query); }); };

  var isAppCatalogQuery = function (apps, query) {
    var normalized = normalize(query);
    return isExactAppName(apps, query) || (apps || []).some(function (app) {
      return [app.category].concat(app.tags || []).some(function (value) {
        var phrase = normalize(value);
        return phrase && (normalized === phrase || normalized.startsWith(phrase + ' on '));
      });
    });
  };

  return { isAppCatalogQuery: isAppCatalogQuery, isExactAppName: isExactAppName, getAppMatchTags: getAppMatchTags, getSearchFeaturedApps: getSearchFeaturedApps, matchApps: matchApps, parseSearchIntent: parseSearchIntent, rankApps: rankApps, scoreApp: scoreApp };
}));
