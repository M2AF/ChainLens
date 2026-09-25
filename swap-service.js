/**
 * swap-service.js — ChainLens's server-side proxy for DEX search, quotes and
 * swap status, built on Magic Money's swap service and its shared swap core.
 *
 *   GET /api/dex/tokens     → Worker /tokens            (cached 60 s here)
 *   GET /api/dex/quote      → Worker /quote, then the SHARED candidate filter
 *   GET /api/dex/status     → Worker /swap/status        (cross-chain lifecycle)
 *   GET /api/dex/tx-status  → source-transaction status  (same-chain completion)
 *
 * Why a server proxy rather than the browser calling the Worker directly: the
 * Worker's client token and every provider credential stay on servers, the
 * browser never sees them, and ChainLens can rate-limit and cache its own
 * traffic. The browser still re-checks every quote with the same shared code
 * immediately before each signature (public/dex-swap.js); nothing returned from
 * here is trusted as authority to sign.
 *
 * Jupiter's app fee (Solana same-chain) needs the referral TOKEN account for the
 * output mint. It is derived from the shared policy's referral account and then
 * CHECKED on-chain (exists, token program, same mint), exactly as the wallet does
 * in src/main/swap-fee.ts. Control of that referral account was verified before
 * enabling this (its partner key is the wallet's Solana address, which has signed
 * on-chain transactions); set CHAINLENS_JUPITER_FEE=off to quote Jupiter fee-free.
 */

'use strict';

const crypto = require('crypto');
const core = require('./public/swap-core.js');

const DEFAULT_WORKER_URL = 'https://magicmoney-swap-proxy.guildfordking.workers.dev';
const TOKENS_TTL_MS = 60 * 1000;
const MAX_CACHE = 500;

const JUP_REFERRAL_PROGRAM = 'REFER4ZgmyYx9c6He5XfaTMiGfdLwRnkV4RPp9t9iF3';
const TOKEN_PROGRAM = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
const TOKEN_2022_PROGRAM = 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb';

// Wallet chain id → Worker RPC route for reading a source-transaction receipt.
// Mirrors Magic Money's chain-config alchemyNetwork values; Monad and HyperEVM
// read through the Worker's Tatum gateways until Alchemy serves them there.
const EVM_RECEIPT_RPC = {
  ethereum: 'alchemy/eth-mainnet', arbitrum: 'alchemy/arb-mainnet', optimism: 'alchemy/opt-mainnet',
  base: 'alchemy/base-mainnet', polygon: 'alchemy/polygon-mainnet', avalanche: 'alchemy/avax-mainnet',
  blast: 'alchemy/blast-mainnet', gnosis: 'alchemy/gnosis-mainnet', abstract: 'alchemy/abstract-mainnet',
  apechain: 'alchemy/apechain-mainnet', robinhood: 'alchemy/robinhood-mainnet', arc: 'alchemy/arc-mainnet',
  ronin: 'alchemy/ronin-mainnet', soneium: 'alchemy/soneium-mainnet', worldchain: 'alchemy/worldchain-mainnet',
  zora: 'alchemy/zora-mainnet', monad: 'tatum/monad', hyperevm: 'tatum/hyperevm',
};

// Keyless public RPCs (mirrors Magic Money's chain-config PUBLIC_RPCS / MONAD_RPCS
// / SOLANA_RPCS). Used for source-transaction status when the Worker's RPC route
// cannot answer — e.g. MM_SWAP_CLIENT_TOKEN unset, which the Worker's /rpc routes
// require. Status reads only; nothing is ever sent through these.
const PUBLIC_RPCS = {
  ethereum: ['https://ethereum-rpc.publicnode.com', 'https://eth.drpc.org', 'https://1rpc.io/eth'],
  arbitrum: ['https://arb1.arbitrum.io/rpc'],
  optimism: ['https://mainnet.optimism.io'],
  base: ['https://mainnet.base.org'],
  polygon: ['https://polygon-bor-rpc.publicnode.com', 'https://polygon.drpc.org'],
  avalanche: ['https://api.avax.network/ext/bc/C/rpc'],
  blast: ['https://rpc.blast.io'],
  gnosis: ['https://rpc.gnosischain.com'],
  abstract: ['https://api.mainnet.abs.xyz'],
  apechain: ['https://rpc.apechain.com/http'],
  robinhood: ['https://rpc.mainnet.chain.robinhood.com'],
  arc: ['https://rpc.mainnet.arc.io', 'https://arc-rpc.publicnode.com'],
  ronin: ['https://api.roninchain.com/rpc'],
  soneium: ['https://rpc.soneium.org'],
  worldchain: ['https://worldchain-mainnet.g.alchemy.com/public'],
  zora: ['https://rpc.zora.energy'],
  hyperevm: ['https://rpc.hyperliquid.xyz/evm', 'https://public.1rpc.io/hyperliquid'],
  monad: ['https://rpc.monad.xyz', 'https://rpc1.monad.xyz', 'https://rpc2.monad.xyz', 'https://rpc-mainnet.monadinfra.com'],
  solana: ['https://api.mainnet-beta.solana.com', 'https://solana-rpc.publicnode.com'],
};

class SwapInputError extends Error {}

// ── Swap identity for scanned wallet holdings ────────────────────────────────

const DECIMALS_RE = /^(?:0|[1-9]\d?)$/;
const SOLANA_PROGRAM_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

/**
 * The exact, swap-ready identity of a token a scanner found in a wallet, or why
 * there is none. The picker may only offer a holding for swapping through this:
 * a holding is identified by chain + contract/mint, never by symbol or name, and
 * its decimals must come from the token itself (an unknown value is NOT assumed
 * to be 18: a wrong guess mis-sizes every amount the user enters).
 *
 *   { swap: { chain, address, key, decimals, isNative, tokenProgram }, swapIssue: null }
 *   { swap: null, swapIssue: '<why this holding cannot be offered>' }
 */
function swapIdentityFor(chain, { address, decimals, native = false, tokenProgram = null } = {}) {
  const c = String(chain || '').trim().toLowerCase();
  const cap = core.swapCapability(c);
  if (!cap || cap.signing === 'other' || !cap.discovery) {
    return { swap: null, swapIssue: `Swaps are not available for tokens on ${c || 'this network'}.` };
  }
  const isSolana = c === 'solana';
  const raw = native ? (isSolana ? core.SOL_NATIVE_MINT : core.NATIVE_EVM_SENTINEL) : String(address || '').trim();
  if (!raw || !core.isValidSwapAddress(c, raw)) {
    return { swap: null, swapIssue: 'The token contract could not be identified.' };
  }
  const d = typeof decimals === 'number' ? decimals : (DECIMALS_RE.test(String(decimals ?? '').trim()) ? Number(decimals) : NaN);
  if (!Number.isInteger(d) || d < 0 || d > 36) {
    return { swap: null, swapIssue: "The token's decimals could not be confirmed." };
  }
  const isNative = native || core.isNativeSwapAddress(c, raw);
  return {
    swap: {
      chain: c,
      // As reported for EVM (checksum case kept for display); Solana mints are case-sensitive.
      address: isNative ? core.normalizeSwapAddress(c, raw) : raw,
      key: core.swapAssetKey(c, raw),
      decimals: d,
      isNative,
      tokenProgram: isSolana && !isNative && SOLANA_PROGRAM_RE.test(String(tokenProgram || '')) ? tokenProgram : null,
    },
    swapIssue: null,
  };
}

/** Attach `swap` / `swapIssue` to a scanner token record (returns the record). */
function withSwapIdentity(record, chain, identity) {
  return Object.assign(record, swapIdentityFor(chain, identity));
}

// ── All-chain token search limits ────────────────────────────────────────────

const ALL_CHAINS_CONCURRENCY = 6;
const ALL_CHAINS_PER_CHAIN = 8;
const ALL_CHAINS_MAX_RESULTS = 50;
const ALL_CHAINS_TTL_MS = 60 * 1000;
const ALL_CHAINS_PARTIAL_TTL_MS = 15 * 1000;
const MIN_ALL_QUERY = 2;

// ── Solana address helpers (no web3.js on this server) ───────────────────────

const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

function base58Decode(value) {
  let n = 0n;
  for (const ch of String(value)) {
    const i = B58.indexOf(ch);
    if (i < 0) throw new Error('Invalid base58.');
    n = n * 58n + BigInt(i);
  }
  const bytes = [];
  while (n > 0n) { bytes.unshift(Number(n % 256n)); n /= 256n; }
  for (const ch of String(value)) { if (ch !== '1') break; bytes.unshift(0); }
  return Buffer.from(bytes);
}

function base58Encode(bytes) {
  let n = 0n;
  for (const b of bytes) n = (n << 8n) + BigInt(b);
  let out = '';
  while (n > 0n) { out = B58[Number(n % 58n)] + out; n /= 58n; }
  for (const b of bytes) { if (b !== 0) break; out = '1' + out; }
  return out;
}

const P = 2n ** 255n - 19n;
const modp = (a) => ((a % P) + P) % P;
function powmod(b, e) {
  let r = 1n; b = modp(b);
  while (e > 0n) { if (e & 1n) r = (r * b) % P; b = (b * b) % P; e >>= 1n; }
  return r;
}
const D = modp(-121665n * powmod(121666n, P - 2n));

/**
 * Is a 32-byte string a point on ed25519? A program-derived address must NOT
 * be. x² = (y² − 1)/(d·y² + 1) has a solution exactly when that ratio is a
 * square mod p (Euler's criterion). Checked against @solana/web3.js's
 * `PublicKey.isOnCurve` on 500 vectors (test/fixtures-solana-pda.json).
 */
function isOnCurve(bytes) {
  const le = Buffer.from(bytes);
  le[31] &= 0x7f;
  const y = modp(BigInt('0x' + Buffer.from(le).reverse().toString('hex')));
  const y2 = (y * y) % P;
  const u = modp(y2 - 1n);
  const v = modp(D * y2 + 1n);
  if (u === 0n) return true;
  const ratio = (u * powmod(v, P - 2n)) % P;
  return powmod(ratio, (P - 1n) / 2n) === 1n;
}

/** Solana `findProgramAddressSync`. */
function findProgramAddress(seeds, programId) {
  const program = base58Decode(programId);
  for (let bump = 255; bump >= 0; bump--) {
    const hash = crypto.createHash('sha256')
      .update(Buffer.concat([...seeds, Buffer.from([bump]), program, Buffer.from('ProgramDerivedAddress')]))
      .digest();
    if (!isOnCurve(hash)) return { address: base58Encode(hash), bump };
  }
  throw new Error('No program address found.');
}

function deriveJupiterFeeAccount(referralAccount, mint) {
  try {
    return findProgramAddress(
      [Buffer.from('referral_ata'), base58Decode(referralAccount), base58Decode(mint)],
      JUP_REFERRAL_PROGRAM,
    ).address;
  } catch {
    return null;
  }
}

// ── Input validation ──────────────────────────────────────────────────────────

const ecosystemOf = (chain) => (chain === 'solana' ? 'solana' : 'evm');
const isAccount = (chain, v) => ecosystemOf(chain) === 'evm'
  ? /^0x[0-9a-fA-F]{40}$/.test(String(v || ''))
  : core.isValidSwapAddress('solana', String(v || ''));

function requireChain(value, role) {
  const chain = String(value || '').trim().toLowerCase();
  const cap = core.swapCapability(chain);
  if (!cap) throw new SwapInputError(`Swaps are not available on ${chain || 'that network'}.`);
  if (role === 'source' && !(cap.sameChain.length || cap.crossChainSource.length)) {
    throw new SwapInputError(core.swapUnavailableReason(chain) || `No swaps start on ${chain}.`);
  }
  return chain;
}

function parseQuoteRequest(q) {
  const fromChain = requireChain(q.fromChain, 'source');
  const toChain = requireChain(q.toChain, 'destination');
  const sell = String(q.sell || '').trim();
  const buy = String(q.buy || '').trim();
  if (!core.isValidSwapAddress(fromChain, sell)) throw new SwapInputError('Choose a valid token to sell.');
  if (!core.isValidSwapAddress(toChain, buy)) throw new SwapInputError('Choose a valid token to buy.');
  const amount = String(q.amount || '').trim();
  if (!/^[0-9]{1,78}$/.test(amount) || BigInt(amount) === 0n) throw new SwapInputError('Enter an amount to swap.');
  const slippageBps = Number(q.slippageBps);
  if (!Number.isInteger(slippageBps) || slippageBps < 1 || slippageBps > 5000) {
    throw new SwapInputError('Slippage must be between 0.01% and 50%.');
  }
  const taker = String(q.taker || '').trim();
  const toAddress = String(q.toAddress || '').trim();
  if (!isAccount(fromChain, taker)) throw new SwapInputError('Connect the wallet that will pay for this swap.');
  if (!isAccount(toChain, toAddress)) throw new SwapInputError('Choose the account that will receive this swap.');
  const decimals = (v) => {
    const n = Number(v);
    return Number.isInteger(n) && n >= 0 && n <= 36 ? n : null;
  };
  return {
    fromChain, toChain, sell, buy, amount, slippageBps, taker, toAddress,
    sellSymbol: String(q.sellSymbol || '').slice(0, 32),
    buySymbol: String(q.buySymbol || '').slice(0, 32),
    fromDecimals: decimals(q.fromDecimals),
    toDecimals: decimals(q.toDecimals),
  };
}

// ── Service ───────────────────────────────────────────────────────────────────

function createSwapService(options = {}) {
  const workerUrl = String(options.workerUrl || DEFAULT_WORKER_URL).replace(/\/+$/, '');
  const clientToken = options.clientToken || '';
  const fetchImpl = options.fetchImpl || fetch;
  const now = options.now || Date.now;
  const jupiterFee = options.jupiterFee !== false;
  const tokenCache = new Map();

  // The page persists and polls every swap it starts (restart included), which
  // is the precondition the shared policy names for broad cross-chain routes.
  core.setSettlementTrackingActive(true);

  async function worker(pathAndQuery, init = {}, timeoutMs = 20000) {
    const headers = { accept: 'application/json', ...(init.headers || {}) };
    if (clientToken) headers['x-mm-client'] = clientToken;
    const res = await fetchImpl(`${workerUrl}${pathAndQuery}`, {
      ...init, headers, signal: AbortSignal.timeout(timeoutMs),
    });
    const body = await res.json().catch(() => null);
    return { ok: res.ok, status: res.status, body };
  }

  async function rpc(route, method, params) {
    const { ok, body } = await worker(`/rpc/${route}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    }, 10000);
    if (!ok || !body || body.error) throw new Error(body?.error?.message || body?.error || 'RPC unavailable');
    return body.result;
  }

  async function publicRpc(chain, method, params) {
    let lastError = null;
    for (const url of PUBLIC_RPCS[chain] || []) {
      try {
        const res = await fetchImpl(url, {
          method: 'POST',
          headers: { 'content-type': 'application/json', accept: 'application/json' },
          body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
          signal: AbortSignal.timeout(8000),
        });
        const body = await res.json().catch(() => null);
        if (res.ok && body && !body.error) return body.result;
        lastError = new Error(body?.error?.message || `RPC ${res.status}`);
      } catch (err) {
        lastError = err;
      }
    }
    throw lastError || new Error(`No public RPC for ${chain}`);
  }

  /** The Worker's keyed RPC first, then keyless public RPCs. */
  async function statusRpc(chain, workerRoute, method, params) {
    if (workerRoute) {
      try {
        return { result: await rpc(workerRoute, method, params), source: 'worker' };
      } catch { /* fall through to public RPCs */ }
    }
    return { result: await publicRpc(chain, method, params), source: 'public' };
  }

  async function tokens(query) {
    const chain = String(query.chain || '').trim().toLowerCase();
    if (chain === 'all') return tokensAllChains(query);
    return tokensOnChain(query);
  }

  /** Networks the all-chain search asks: every swap chain with token discovery. */
  function searchChains() {
    return Object.values(core.SWAP_NETWORKS)
      .filter(n => n.discovery && n.signing !== 'other' && n.signing !== 'smart-account')
      .map(n => n.id);
  }

  /**
   * GET /api/dex/tokens?chain=all&q=... — one text query across every swap
   * chain. Each chain's results are sanitized separately and stay qualified by
   * chain + address; two tokens with the same symbol or name on different
   * chains are two results. Only an identical chain + address is deduplicated.
   * Exact-address lookups stay chain-specific (an address alone does not say
   * which network it is on). Bounded: at most 6 chains in flight, 8 results per
   * chain, 50 overall, cached 60 s (15 s when some chains failed).
   */
  async function tokensAllChains(query) {
    if (query.address) throw new SwapInputError('Exact-address search needs a network: use chain=<network>&address=<address>.');
    const q = String(query.q || '').replace(/\s+/g, ' ').trim();
    if (q.length < MIN_ALL_QUERY) throw new SwapInputError(`Type at least ${MIN_ALL_QUERY} characters to search every network.`);
    if (q.length > 64) throw new SwapInputError('Search text is too long.');
    const chains = searchChains();
    if (chains.some(c => core.looksLikeSwapAddress(c, q))) {
      throw new SwapInputError('Exact-address search needs a network: use chain=<network>&address=<address>.');
    }
    const limit = Math.min(ALL_CHAINS_MAX_RESULTS, Math.max(1, Number(query.limit) || 20));
    const key = `all|${q.toLowerCase()}|${limit}`;
    const hit = tokenCache.get(key);
    if (hit && hit.expiresAt > now()) return hit.value;

    const perChain = new Map();
    const failed = [];
    let next = 0;
    const lane = async () => {
      while (next < chains.length) {
        const chain = chains[next++];
        try {
          const out = await tokensOnChain({ chain, q, limit: Math.min(limit, ALL_CHAINS_PER_CHAIN) });
          if (out.error) failed.push({ chain, error: out.error });
          perChain.set(chain, out.tokens);
        } catch (err) {
          failed.push({ chain, error: err instanceof SwapInputError ? err.message : 'Token search unavailable.' });
          perChain.set(chain, []);
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(ALL_CHAINS_CONCURRENCY, chains.length) }, lane));

    // Chain + address is the identity; nothing is merged by symbol or name.
    const seen = new Set();
    const ranked = [];
    for (const chain of chains) {
      (perChain.get(chain) || []).forEach((t, rank) => {
        if (!t || t.chain !== chain) return;
        const id = core.swapAssetKey(chain, t.address);
        if (seen.has(id)) return;
        seen.add(id);
        ranked.push({ token: { ...t, key: id }, rank, chainOrder: chains.indexOf(chain) });
      });
    }
    const needle = q.toLowerCase();
    // An exact symbol OR name match first ("emonad" is EMO's name), then prefixes.
    const score = (t) => {
      const sym = t.symbol.toLowerCase();
      const name = String(t.name || '').toLowerCase();
      if (sym === needle || name === needle) return 0;
      if (sym.startsWith(needle) || name.startsWith(needle)) return 1;
      return 2;
    };
    ranked.sort((a, b) => score(a.token) - score(b.token)
      || (b.token.verified === true) - (a.token.verified === true)
      || a.rank - b.rank
      || a.chainOrder - b.chainOrder);

    failed.sort((a, b) => chains.indexOf(a.chain) - chains.indexOf(b.chain));
    const value = {
      tokens: ranked.slice(0, limit).map(r => r.token),
      chains: { searched: chains, failed },
      partial: failed.length > 0,
      error: failed.length === chains.length ? 'Token search is unavailable right now.' : null,
    };
    if (failed.length < chains.length) {
      if (tokenCache.size >= MAX_CACHE) tokenCache.delete(tokenCache.keys().next().value);
      tokenCache.set(key, { value, expiresAt: now() + (failed.length ? ALL_CHAINS_PARTIAL_TTL_MS : ALL_CHAINS_TTL_MS) });
    }
    return value;
  }

  async function tokensOnChain(query) {
    const chain = String(query.chain || '').trim().toLowerCase();
    if (!core.swapCapability(chain)) return { tokens: [], error: `Swaps are not available on ${chain || 'that network'}.` };
    const address = String(query.address || '').trim().slice(0, 64);
    const q = String(query.q || '').trim().slice(0, 64);
    const limit = Math.min(50, Math.max(1, Number(query.limit) || 20));
    const key = `${chain}|${address.toLowerCase()}|${q.toLowerCase()}|${limit}`;
    const hit = tokenCache.get(key);
    if (hit && hit.expiresAt > now()) return hit.value;

    const params = new URLSearchParams({ chain, limit: String(limit) });
    if (address) params.set('address', address);
    else if (q) params.set('q', q);
    const { ok, status, body } = await worker(`/tokens?${params}`, {}, 10000);
    if (!ok || !body) return { tokens: [], error: body?.error || `Token search unavailable (${status}).` };
    const list = Array.isArray(body.tokens) ? body.tokens : [];
    const value = {
      // Sanitized against THIS chain: a record claiming another chain, or with
      // an invalid address or decimals, is dropped rather than repaired.
      tokens: list
        .filter(t => !t || t.chain == null || String(t.chain).toLowerCase() === chain)
        .map(t => core.sanitizeDiscoveredToken(t, chain)).filter(Boolean),
      error: body.error || null,
    };
    if (!value.error) {
      if (tokenCache.size >= MAX_CACHE) tokenCache.delete(tokenCache.keys().next().value);
      tokenCache.set(key, { value, expiresAt: now() + TOKENS_TTL_MS });
    }
    return value;
  }

  /** The Jupiter fee account for an output mint, derived AND checked, or why not. */
  async function resolveJupiterFeeAccount(outputMint) {
    const derived = deriveJupiterFeeAccount(core.SWAP_FEE_BENEFICIARIES.solanaReferralAccount, outputMint);
    if (!derived) return { feeAccount: null, reason: 'Could not derive a fee account for this token.' };
    let account;
    try {
      account = (await rpc('helius', 'getAccountInfo', [derived, { encoding: 'jsonParsed' }]))?.value ?? null;
    } catch {
      return { feeAccount: null, reason: 'Could not confirm the Magic Money fee account for this token (Solana RPC unavailable).' };
    }
    if (!account) return { feeAccount: null, reason: 'Magic Money has no fee account for this token yet.' };
    if (account.owner !== TOKEN_PROGRAM && account.owner !== TOKEN_2022_PROGRAM) {
      return { feeAccount: null, reason: 'The fee account for this token is not a token account.' };
    }
    if (account.data?.parsed?.type !== 'account') {
      return { feeAccount: null, reason: 'The fee account for this token is not an initialized token account.' };
    }
    if (account.data?.parsed?.info?.mint !== outputMint) {
      return { feeAccount: null, reason: 'The fee account for this token holds a different mint.' };
    }
    return { feeAccount: derived, reason: null };
  }

  async function quote(query) {
    const req = parseQuoteRequest(query);
    const excluded = [];
    const params = new URLSearchParams({
      chain: req.fromChain, fromChain: req.fromChain, toChain: req.toChain,
      sell: req.sell, buy: req.buy, sellSymbol: req.sellSymbol, buySymbol: req.buySymbol,
      amount: req.amount, slippageBps: String(req.slippageBps), taker: req.taker, toAddress: req.toAddress,
    });
    if (req.fromDecimals != null) params.set('fromDecimals', String(req.fromDecimals));
    if (req.toDecimals != null) params.set('toDecimals', String(req.toDecimals));

    if (req.fromChain === 'solana' && req.toChain === 'solana') {
      if (jupiterFee) {
        const resolved = await resolveJupiterFeeAccount(core.normalizeSwapAddress('solana', req.buy));
        if (resolved.feeAccount) params.set('solFeeAccount', resolved.feeAccount);
        else excluded.push(`jupiter fee: ${resolved.reason}`);
      } else {
        excluded.push('jupiter fee: not enabled on ChainLens');
      }
    }

    const { ok, status, body } = await worker(`/quote?${params}`, {}, 25000);
    if (!ok || !body) {
      return { quote: null, routing: null, error: body?.error || `The swap service is unavailable (${status}).` };
    }
    const list = Array.isArray(body.candidates) && body.candidates.length
      ? body.candidates
      : (body.quote ? [body.quote] : []);
    if (!list.length) return { quote: null, routing: null, error: body.error || 'No route available.' };
    const selected = core.selectFromCandidates(list, excluded);
    return { quote: selected.quote, routing: selected.routing || null, error: selected.error };
  }

  async function status(query) {
    const provider = String(query.provider || '');
    const txHash = String(query.txHash || '');
    if (!/^[a-z0-9]{2,16}$/.test(provider) || !/^[0-9A-Za-z]{20,100}$/.test(txHash.replace(/^0x/, ''))) {
      throw new SwapInputError('Invalid status request.');
    }
    const params = new URLSearchParams({
      provider, txHash,
      fromChain: requireChain(query.fromChain, 'source'),
      toChain: requireChain(query.toChain, 'destination'),
    });
    if (query.bridge) params.set('bridge', String(query.bridge).slice(0, 40));
    if (query.requestId) params.set('requestId', String(query.requestId).slice(0, 100));
    const { ok, body } = await worker(`/swap/status?${params}`, {}, 15000);
    // A transient failure is UNKNOWN, not failed: the page keeps polling.
    if (!ok || !body) return { transient: true };
    return body;
  }

  async function txStatus(query) {
    const chain = requireChain(query.chain, 'source');
    const hash = String(query.hash || '');
    if (chain === 'solana') {
      if (!core.isValidSwapAddress('solana', hash) && !/^[1-9A-HJ-NP-Za-km-z]{64,90}$/.test(hash)) {
        throw new SwapInputError('Invalid transaction signature.');
      }
      const { result, source } = await statusRpc('solana', 'helius', 'getSignatureStatuses', [[hash], { searchTransactionHistory: true }]);
      const s = result?.value?.[0];
      if (!s) return { state: 'pending', source };
      if (s.err) return { state: 'failed', source };
      const finality = s.confirmationStatus || null;
      return { state: finality === 'finalized' || finality === 'confirmed' ? 'confirmed' : 'pending', finality, source };
    }
    if (!/^0x[0-9a-fA-F]{64}$/.test(hash)) throw new SwapInputError('Invalid transaction hash.');
    const route = EVM_RECEIPT_RPC[chain] || null;
    if (!route && !PUBLIC_RPCS[chain]) return { state: 'unknown' };
    const { result: receipt, source } = await statusRpc(chain, route, 'eth_getTransactionReceipt', [hash]);
    if (!receipt || receipt.status == null) return { state: 'pending', source };
    const blockNumber = receipt.blockNumber ? Number.parseInt(receipt.blockNumber, 16) : null;
    return { state: receipt.status === '0x1' ? 'confirmed' : 'failed', blockNumber, source };
  }

  return { tokens, quote, status, txStatus, resolveJupiterFeeAccount };
}

function createRateLimit({ limit, windowMs = 60 * 1000, message }) {
  const buckets = new Map();
  const cleanup = setInterval(() => {
    const t = Date.now();
    for (const [key, value] of buckets) if (value.resetAt <= t) buckets.delete(key);
  }, 5 * 60 * 1000);
  cleanup.unref?.();
  return (req, res, next) => {
    const t = Date.now();
    const key = req.ip || req.socket?.remoteAddress || 'unknown';
    const current = buckets.get(key);
    if (!current || t >= current.resetAt) { buckets.set(key, { count: 1, resetAt: t + windowMs }); return next(); }
    if (current.count >= limit) {
      res.set('Retry-After', String(Math.ceil((current.resetAt - t) / 1000)));
      return res.status(429).json({ error: message });
    }
    current.count += 1;
    return next();
  };
}

/** Mount the DEX swap routes. `service` is a createSwapService() instance. */
function registerSwapRoutes(app, service) {
  const searchLimit = createRateLimit({ limit: 90, message: 'Too many token searches. Please wait a moment.' });
  const quoteLimit = createRateLimit({ limit: 30, message: 'Too many quote requests. Please wait a moment.' });
  const statusLimit = createRateLimit({ limit: 120, message: 'Too many status checks. Please wait a moment.' });
  const handle = (fn) => async (req, res) => {
    try {
      res.set('Cache-Control', 'no-store');
      res.json(await fn(req.query || {}));
    } catch (err) {
      if (err instanceof SwapInputError) return res.status(400).json({ error: err.message });
      console.warn('[dex-swap]', err && err.message ? err.message : err);
      res.status(502).json({ error: 'The swap service is temporarily unavailable.' });
    }
  };
  app.get('/api/dex/tokens', searchLimit, handle(service.tokens));
  app.get('/api/dex/quote', quoteLimit, handle(service.quote));
  app.get('/api/dex/status', statusLimit, handle(service.status));
  app.get('/api/dex/tx-status', statusLimit, handle(service.txStatus));
}

module.exports = {
  createSwapService,
  registerSwapRoutes,
  SwapInputError,
  swapIdentityFor,
  withSwapIdentity,
  // exported for tests
  isOnCurve,
  findProgramAddress,
  deriveJupiterFeeAccount,
  parseQuoteRequest,
};
