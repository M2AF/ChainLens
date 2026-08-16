/**
 * asset-filter-key.js — the asset identity ChainLens shares with MagicMoney.
 *
 * ⚠ HAND-KEPT PORT. The source of truth is src/shared/asset-filter-key.ts in the
 * MagicMoney Wallet repo, and its unit tests assert these exact answers. If the
 * two drift, the symptom is silent and confusing: hiding an asset here appears
 * to work, and it simply never disappears in the wallet.
 *
 * The problem this solves: both products already let you hide an asset, and each
 * keyed that decision on its own display id.
 *
 *   MagicMoney token   ethereum:0xA0b8…            chain : contract, mixed case
 *   MagicMoney NFT     ethereum:0xbc4c…:1234       chain : contract : tokenId
 *   ChainLens  token   ethereum-0xa0b8…            chain - contract
 *   ChainLens  NFT     ethereum-ethereum-0x…-1234  chain doubled, because our
 *                                                  NFT ids already carry it
 *
 * Neither could read the other's list. Both now write the canonical key below,
 * derived from what the asset IS (chain, contract, token id) rather than from
 * how either product happens to name it.
 *
 * Loaded as a plain script before index.html's babel block; publishes
 * window.assetFilterKey.
 */
(function () {
  'use strict';

  var MAX_FILTER_ENTRIES = 2000;

  // The chain's own coin: MagicMoney writes the EVM zero address, our EVM
  // scanner writes "native", and our Solana scanner writes "native-sol".
  var NATIVE_RE = /^(?:native|native-sol|0x0{40})$/i;

  function clean(v) { return String(v == null ? '' : v).trim().toLowerCase(); }

  function canonicalTokenKey(chain, contractAddress) {
    var raw = String(contractAddress == null ? '' : contractAddress).trim();
    return clean(chain) + ':t:' + (NATIVE_RE.test(raw) ? 'native' : raw.toLowerCase());
  }

  /**
   * Three chains need their own rule, because contract+tokenId is not how they
   * name one NFT and the two products split the name differently:
   *
   *   solana   the mint IS the NFT. MagicMoney also knows the collection address
   *            and we never do, so a collection-keyed id could never match.
   *   cardano  policy id + asset name concatenated is the asset unit — exactly
   *            the whole id we carry, and exactly what MagicMoney splits at 56.
   *   bitcoin  the inscription id is the identity; its number is a label.
   */
  function canonicalNftKey(chain, contractAddress, tokenId) {
    var c = clean(chain), contract = clean(contractAddress), token = clean(tokenId);
    if (c === 'solana')  return c + ':n:' + (token || contract);
    if (c === 'cardano') return c + ':n:' + contract + token;
    if (c === 'bitcoin') return c + ':n:' + contract;
    return c + ':n:' + contract + ':' + token;
  }

  /** Split `<contract>-<tokenId>` on the LAST dash (token ids are decimal). */
  function splitContractToken(rest) {
    var cut = rest.lastIndexOf('-');
    if (cut <= 0) return [rest, ''];
    return [rest.slice(0, cut), rest.slice(cut + 1)];
  }

  /**
   * The canonical key for one asset as the ChainLens scanners return it.
   *
   * Our asset objects are not uniform — that is the whole difficulty. EVM NFTs
   * carry a compound id with the chain baked in, Monad NFTs carry real
   * contractAddress/tokenId fields, and Solana and Cardano carry a single mint or
   * unit. Each case is handled explicitly rather than by a generic parse.
   */
  function keyFor(asset) {
    if (!asset) return '';
    var chain = clean(asset.chain);
    if (!chain) return '';
    var id = String(asset.address || asset.id || asset.mint || asset.name || '');

    if (asset.isToken) return canonicalTokenKey(chain, id);

    if (chain === 'solana')  return canonicalNftKey(chain, '', id);
    if (chain === 'cardano') return canonicalNftKey(chain, id, '');
    if (chain === 'bitcoin') return canonicalNftKey(chain, id, '');

    // Monad hands us the parts directly — no parsing needed, so prefer them.
    if (asset.contractAddress) return canonicalNftKey(chain, asset.contractAddress, asset.tokenId);

    // EVM: `${chain}-${contract}-${tokenId}`. Strip the chain we already know.
    var rest = id.toLowerCase();
    if (rest.indexOf(chain + '-') === 0) rest = rest.slice(chain.length + 1);
    var parts = splitContractToken(rest);
    return canonicalNftKey(chain, parts[0], parts[1]);
  }

  /**
   * Canonical keys for one entry saved before syncing existed.
   *
   * Those keys were `${chain}-${rawId}` for every asset class at once, so they
   * are ambiguous. This returns EVERY reading rather than guessing: an extra key
   * costs nothing (contract addresses, mints and units do not collide, so a wrong
   * reading matches no asset you hold), while guessing wrong would un-hide
   * something you hid.
   */
  function legacyKeyToCanonical(legacy) {
    var raw = String(legacy == null ? '' : legacy);
    var cut = raw.indexOf('-');
    if (cut <= 0) return [];
    var chain = raw.slice(0, cut), rest = raw.slice(cut + 1);
    if (!rest) return [];

    var out = [canonicalTokenKey(chain, rest)];
    var push = function (k) { if (out.indexOf(k) === -1) out.push(k); };

    // `<chain>-<chain>-<contract>-<tokenId>` — our EVM NFT ids.
    if (rest.toLowerCase().indexOf(chain.toLowerCase() + '-') === 0) {
      var inner = splitContractToken(rest.slice(chain.length + 1));
      push(canonicalNftKey(chain, inner[0], inner[1]));
      return out;
    }
    if (rest.indexOf('-') > 0) {
      var parts = splitContractToken(rest);
      push(canonicalNftKey(chain, parts[0], parts[1]));
    }
    // Single-token ids: a mint, a Cardano unit, or an inscription.
    push(canonicalNftKey(chain, rest, rest));
    return out;
  }

  // ─── The synced set ────────────────────────────────────────────────────────
  // { "<key>": { s: 'h' | 's' | 'a', t: <epoch ms> } }
  //   h hidden · s spam · a explicitly restored (a TOMBSTONE, not an absence —
  //   it has to out-rank the older hide the other device still holds).

  function sanitizeEntries(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    var out = {};
    Object.keys(value).forEach(function (key) {
      var e = value[key];
      if (!key || key.length > 256) return;
      if (!e || typeof e !== 'object') return;
      if (e.s !== 'h' && e.s !== 's' && e.s !== 'a') return;
      if (typeof e.t !== 'number' || !isFinite(e.t)) return;
      out[key] = { s: e.s, t: e.t };
    });
    return out;
  }

  /**
   * Per-key last-write-wins union. Every client pushes its whole list, so a plain
   * overwrite would let this tab silently undo a hide made in the wallet.
   */
  function mergeEntries(base, incoming) {
    var out = {};
    [sanitizeEntries(base), sanitizeEntries(incoming)].forEach(function (src) {
      Object.keys(src).forEach(function (key) {
        if (!out[key] || src[key].t > out[key].t) out[key] = src[key];
      });
    });
    var keys = Object.keys(out);
    if (keys.length <= MAX_FILTER_ENTRIES) return out;
    var kept = {};
    keys.sort(function (a, b) { return out[b].t - out[a].t; })
      .slice(0, MAX_FILTER_ENTRIES)
      .forEach(function (key) { kept[key] = out[key]; });
    return kept;
  }

  window.assetFilterKey = {
    MAX_FILTER_ENTRIES: MAX_FILTER_ENTRIES,
    canonicalTokenKey: canonicalTokenKey,
    canonicalNftKey: canonicalNftKey,
    keyFor: keyFor,
    legacyKeyToCanonical: legacyKeyToCanonical,
    sanitizeEntries: sanitizeEntries,
    mergeEntries: mergeEntries,
  };
})();
