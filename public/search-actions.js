// Action-intent parsing for the search box ("bridge Monad to Solana", "stake SOL").
// This module only classifies text and ranks existing App Hub records. It never
// builds a route, quote, rate or contract; the caller decides what is executable.
(function (root, factory) {
  var catalog = (typeof module === 'object' && module.exports)
    ? require('./chain-catalog')
    : (root && root.ChainLensChains) || { DEFAULT_CHAINS: [] };
  var api = factory(catalog);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.ChainLensSearchActions = api;
}(typeof window !== 'undefined' ? window : globalThis, function (catalog) {
  'use strict';

  var MAX_QUERY_LENGTH = 200;
  var MAX_ASSET_LENGTH = 120;

  var ACTION_WORDS = {
    bridge: 'bridge', bridging: 'bridge',
    stake: 'stake', staking: 'stake',
    lend: 'lend', lending: 'lend',
    swap: 'swap', swapping: 'swap'
  };
  var LEADING_FILLER = new Set(['i', 'want', 'wanna', 'to', 'need', 'like', 'would', 'please', 'help', 'me', 'can', 'you', 'how', 'do', 'lets', 'let', 'us', 'ill', 'im']);
  var BODY_FILLER = new Set(['a', 'an', 'the', 'my', 'some', 'token', 'tokens', 'coin', 'coins', 'asset', 'assets', 'funds', 'crypto', 'please', 'now']);
  var PREPOSITIONS = {
    from: 'from', to: 'to', into: 'to', onto: 'to', towards: 'to', for: 'for',
    on: 'on', in: 'on', at: 'on', within: 'on',
    via: 'via', with: 'via', using: 'via', through: 'via'
  };
  // Stablecoin tickers are the native gas token of some chains (USDC on Arc),
  // but a user typing them means the asset, never "the Arc chain".
  var NON_INFERRING_TICKERS = new Set(['usdc', 'usdt', 'dai']);
  var EXTRA_HARD_ALIASES = { 'world chain': 'worldchain', 'hyper evm': 'hyperevm', hyperliquid: 'hyperevm' };
  var SOFT_ALIASES = { arb: 'arbitrum', eth: 'ethereum', hype: 'hyperevm', matic: 'polygon', op: 'optimism', world: 'worldchain' };
  // The App Hub still keys HyperEVM/Hyperliquid apps as "hype".
  var HUB_CHAIN_IDS = { hyperevm: 'hype' };

  var normalize = function (value) {
    return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
  };

  var buildChainIndex = function () {
    var chains = Array.isArray(catalog && catalog.DEFAULT_CHAINS) ? catalog.DEFAULT_CHAINS : [];
    var hard = {};
    var soft = {};
    var labels = {};
    var natives = {};
    chains.forEach(function (chain) {
      hard[normalize(chain.id)] = chain.id;
      hard[normalize(chain.label)] = chain.id;
      labels[chain.id] = chain.label;
      var native = normalize(chain.native);
      if (native) (natives[native] = natives[native] || []).push(chain.id);
    });
    Object.keys(EXTRA_HARD_ALIASES).forEach(function (key) {
      if (labels[EXTRA_HARD_ALIASES[key]]) hard[key] = EXTRA_HARD_ALIASES[key];
    });
    Object.keys(SOFT_ALIASES).forEach(function (key) {
      if (labels[SOFT_ALIASES[key]] && !hard[key]) soft[key] = SOFT_ALIASES[key];
    });
    Object.keys(natives).forEach(function (ticker) {
      if (natives[ticker].length === 1 && !NON_INFERRING_TICKERS.has(ticker) && !hard[ticker] && !soft[ticker]) {
        soft[ticker] = natives[ticker][0];
      }
    });
    var inferable = {};
    Object.keys(natives).forEach(function (ticker) {
      if (natives[ticker].length === 1 && !NON_INFERRING_TICKERS.has(ticker)) inferable[ticker] = natives[ticker][0];
    });
    return { hard: hard, soft: soft, inferable: inferable, labels: labels };
  };

  var tokenize = function (raw) {
    return raw
      .replace(/[\u0000-\u001f\u007f]/g, ' ')
      .replace(/\s*(->|→|=>)\s*/g, ' to ')
      .split(/\s+/)
      .map(function (token) { return token.replace(/^[^\w$]+|[^\w$]+$/g, ''); })
      .filter(Boolean);
  };

  // strong = this segment names chains, so unknown words are unknown chains,
  // not assets; ticker-style aliases (SOL, ETH) resolve to chains there.
  var classify = function (tokens, strong, index) {
    var chains = [];
    var assets = [];
    var unknown = [];
    var phrase = [];
    var flush = function () {
      if (phrase.length) assets.push(phrase.join(' ').slice(0, MAX_ASSET_LENGTH));
      phrase = [];
    };
    var addChain = function (id) { if (chains.indexOf(id) === -1) chains.push(id); };
    for (var i = 0; i < tokens.length; i += 1) {
      var one = tokens[i].toLowerCase();
      var two = i + 1 < tokens.length ? one + ' ' + tokens[i + 1].toLowerCase() : null;
      if (two && index.hard[two]) { flush(); addChain(index.hard[two]); i += 1; continue; }
      if (index.hard[one]) { flush(); addChain(index.hard[one]); continue; }
      if (strong && index.soft[one]) { flush(); addChain(index.soft[one]); continue; }
      if (strong) { flush(); unknown.push(tokens[i]); continue; }
      phrase.push(tokens[i]);
    }
    flush();
    return { chains: chains, assets: assets, unknown: unknown };
  };

  var single = function (list) { return list.length === 1 ? list[0] : null; };
  var unique = function (list) {
    return list.filter(function (value, position) { return list.indexOf(value) === position; });
  };

  var parseActionIntent = function (query) {
    if (typeof query !== 'string') return null;
    var trimmed = query.replace(/\s+/g, ' ').trim();
    if (!trimmed || trimmed.length > MAX_QUERY_LENGTH) return null;
    var tokens = tokenize(trimmed);
    var start = 0;
    while (start < tokens.length && LEADING_FILLER.has(tokens[start].toLowerCase())) start += 1;
    var action = tokens[start] ? ACTION_WORDS[tokens[start].toLowerCase()] : null;
    if (!action) return null;
    var index = buildChainIndex();

    var segments = [{ role: 'subject', tokens: [] }];
    tokens.slice(start + 1).forEach(function (token) {
      var lower = token.toLowerCase();
      if (PREPOSITIONS[lower]) { segments.push({ role: PREPOSITIONS[lower], tokens: [] }); return; }
      if (!BODY_FILLER.has(lower)) segments[segments.length - 1].tokens.push(token);
    });

    var isBridge = action === 'bridge';
    var parsed = segments.map(function (segment) {
      var strong = segment.role === 'on' || (isBridge && (segment.role === 'from' || segment.role === 'to'));
      if (segment.role === 'via') {
        return { role: 'via', chains: [], assets: [], unknown: [], terms: segment.tokens.filter(function (t) { return !index.hard[t.toLowerCase()]; }) };
      }
      var result = classify(segment.tokens, strong, index);
      result.role = segment.role;
      return result;
    });
    var chainsFor = function (roles) {
      var found = [];
      parsed.forEach(function (segment) {
        if (roles.indexOf(segment.role) !== -1) found = found.concat(segment.chains);
      });
      return unique(found);
    };

    var fromChain = null;
    var toChain = null;
    var chain = null;
    if (isBridge) {
      fromChain = single(chainsFor(['from', 'subject']));
      toChain = single(chainsFor(['to']));
      var onChain = single(chainsFor(['on']));
      if (onChain && !fromChain && toChain && !chainsFor(['from', 'subject']).length) fromChain = onChain;
      else if (onChain && !fromChain && !toChain) chain = onChain;
      if (fromChain && toChain && fromChain === toChain) { fromChain = null; toChain = null; chain = null; }
    } else if (action === 'swap') {
      fromChain = single(chainsFor(['from']));
      toChain = single(chainsFor(['to', 'for']));
      if (!fromChain && !toChain) chain = single(chainsFor(['on', 'subject']));
      else if (fromChain && toChain && fromChain === toChain) { chain = fromChain; fromChain = null; toChain = null; }
    } else {
      chain = single(chainsFor(['on', 'subject']));
    }

    var assetPhrases = [];
    var viaTerms = [];
    parsed.forEach(function (segment) {
      assetPhrases = assetPhrases.concat(segment.assets);
      viaTerms = viaTerms.concat(segment.terms || []);
    });
    var asset = assetPhrases.length ? assetPhrases[0] : null;

    // Native-ticker hint only (SOL -> Solana). Never a contract or token id.
    if (!isBridge && !chain && !fromChain && !toChain) {
      var hinted = unique(assetPhrases.join(' ').toLowerCase().split(' ')
        .map(function (word) { return index.inferable[word]; }).filter(Boolean));
      chain = single(hinted);
    }

    var hubId = function (id) { return HUB_CHAIN_IDS[id] || id; };
    var appTerms = [action === 'stake' ? 'staking' : action].concat(
      unique([fromChain, toChain, chain].filter(Boolean)).map(hubId),
      viaTerms.map(function (term) { return term.toLowerCase(); })
    );

    return {
      action: action,
      fromChain: fromChain,
      toChain: toChain,
      chain: chain,
      asset: asset,
      query: trimmed,
      appQuery: appTerms.join(' ')
    };
  };

  var ACTION_RULES = {
    bridge: { categories: ['bridge interoperability'], keyword: /\bbridg(?:e|es|ed|ing)\b/, bonus: [] },
    swap: { categories: ['dex'], keyword: /\bswap(?:s|ping)?\b/, bonus: [] },
    stake: { categories: [], keyword: /\bstak(?:e|es|ed|ing)\b/, bonus: ['defi'] },
    lend: { categories: [], keyword: /\b(?:lend\w*|borrow\w*|money markets?)\b/, bonus: ['defi'] }
  };
  // Action-specific coverage can be narrower than a site's general App Hub tags.
  // Lido SOL/Polygon staking was retired; wrapped stETH presence is not staking.
  // https://blog.lido.fi/sunset-lido-on-solana/
  // https://blog.lido.fi/lido-on-polygon-sunset/
  // THORChain native network list, checked 2026-10-13:
  // https://docs.thorchain.org/what-is-thorchain-and-rune
  var ACTION_CHAIN_OVERRIDES = {
    lido: { stake: ['ethereum'] },
    thorchain: { bridge: ['bitcoin','ethereum','avalanche','base','dogecoin','tron'], swap: ['bitcoin','ethereum','avalanche','base','dogecoin','tron'] }
  };

  var matchActionApps = function (apps, intent) {
    if (!Array.isArray(apps) || !intent || typeof intent !== 'object') return [];
    var rule = ACTION_RULES[intent.action];
    if (!rule) return [];
    var hubId = function (id) { return HUB_CHAIN_IDS[id] || id; };
    var required = unique([intent.fromChain, intent.toChain, intent.chain].filter(function (id) { return typeof id === 'string' && id; }).map(hubId));
    var assetKey = typeof intent.asset === 'string' ? normalize(intent.asset) : '';

    var scored = [];
    apps.forEach(function (app) {
      if (!app || typeof app !== 'object') return;
      var allowed = ACTION_CHAIN_OVERRIDES[app.id] && ACTION_CHAIN_OVERRIDES[app.id][intent.action];
      var chains = (allowed || (Array.isArray(app.chains) ? app.chains : [])).map(normalize);
      if (!required.every(function (id) { return chains.indexOf(id) !== -1; })) return;
      var category = normalize(app.category);
      var name = String(app.name || '').toLowerCase();
      var description = String(app.description || (app.categoryMeta && app.categoryMeta.description) || '').toLowerCase();
      var tags = (Array.isArray(app.tags) ? app.tags : []).map(function (tag) { return String(tag).toLowerCase(); });
      var inCategory = rule.categories.indexOf(category) !== -1;
      var inName = rule.keyword.test(name);
      var inTags = tags.some(function (tag) { return rule.keyword.test(tag); });
      var inDescription = rule.keyword.test(description);
      if (!inCategory && !inName && !inTags && !inDescription) return;
      var score = 0;
      if (inCategory) score += 100;
      if (rule.bonus.indexOf(category) !== -1) score += 20;
      if (inName) score += 30;
      if (inTags) score += 25;
      if (inDescription) score += 20;
      score += required.length * 30;
      if (assetKey.length >= 2 && [name, description].concat(tags).join(' ').indexOf(assetKey) !== -1) score += 15;
      if (app.featured) score += 2;
      scored.push({ app: app, score: score });
    });
    return scored
      .sort(function (a, b) {
        return b.score - a.score || String(a.app.name || '').localeCompare(String(b.app.name || '')) || String(a.app.id || '').localeCompare(String(b.app.id || ''));
      })
      .map(function (entry) { return entry.app; });
  };

  return { matchActionApps: matchActionApps, parseActionIntent: parseActionIntent };
}));
