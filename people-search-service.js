// Public identity search: display-name lookup and optional public linked-wallet
// lookup. Read-only; returns only the public profile fields and a match reason.
// A wallet match means "this wallet is linked (possibly watch-only)", never
// verified ownership.
const chains = require('./public/chain-catalog');

const MAX_PEOPLE = 10;
const MIN_QUERY_LENGTH = 2;
const MAX_QUERY_LENGTH = 64;
const MAX_ADDRESS_LENGTH = 128;
const MAX_WALLET_ROWS = 50;
const DEFAULT_NAME = 'ChainLens user';
// Explicit allowlist: never select email, social/passkey/session data or ids from providers.
const USER_COLUMNS = 'id,username,display_name,avatar_url,avatar_nft_key,banner_url,public_wallets';

const requestError = (status, message) => Object.assign(new Error(message), { status });
const unavailable = () => requestError(503, 'People search is temporarily unavailable');

// Backslash-escape LIKE wildcards. PostgREST also treats "*" as "%", so it is
// neutralised to a single-character wildcard; every row is re-checked in JS.
const likeLiteral = value => value.replace(/[\\%_]/g, '\\$&').replace(/\*/g, '_');

const cleanQuery = raw => {
  if (raw === undefined || raw === null || raw === '') return '';
  if (typeof raw !== 'string') throw requestError(400, 'Search text must be a string');
  const text = raw.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().replace(/^@/,'');
  if (text.length > MAX_QUERY_LENGTH) throw requestError(400, 'Search text is too long');
  return text.length >= MIN_QUERY_LENGTH ? text : '';
};

const resolveWallet = (rawAddress, rawChain) => {
  if (rawAddress === undefined || rawAddress === null || rawAddress === '') return null;
  if (typeof rawAddress !== 'string') throw requestError(400, 'Enter a valid wallet address');
  const address = rawAddress.trim();
  if (!address || address.length > MAX_ADDRESS_LENGTH) throw requestError(400, 'Enter a valid wallet address');
  let type = null;
  if (rawChain === undefined || rawChain === null || rawChain === '') type = chains.detectAddressChain(address);
  else if (typeof rawChain === 'string') {
    const id = rawChain.trim().toLowerCase();
    if (id === 'evm' || chains.CHAIN_MAP[id]?.family === 'evm') type = 'evm';
    else if (chains.PROFILE_WALLET_MAP[id]) type = id;
  }
  if (!type || !chains.validateProfileWalletAddress(type, address)) throw requestError(400, 'Enter a valid wallet address');
  // EVM addresses are stored lowercase; every other chain is case-sensitive.
  return { chain: type, address: chains.normalizeProfileWalletAddress(type, address) };
};

const toPerson = (row, match) => ({
  id: row.id,
  username: row.username || null,
  display_name: row.display_name || DEFAULT_NAME,
  avatar_url: row.avatar_url || null,
  avatar_nft_key: row.avatar_nft_key || null,
  banner_url: row.banner_url || null,
  match,
});

const createPeopleSearch = ({ db } = {}) => {
  const run = async query => {
    let result;
    if (typeof query.abortSignal === 'function') query = query.abortSignal(AbortSignal.timeout(8000));
    try { result = await query; } catch { throw unavailable(); }
    if (!result || result.error) throw unavailable();
    return Array.isArray(result.data) ? result.data : [];
  };

  const byName = async text => {
    const needle = text.toLowerCase();
    const esc = likeLiteral(text);
    const select = (column,pattern) => run(db.from('cl_users').select(USER_COLUMNS).ilike(column, pattern).limit(MAX_PEOPLE + 1));
    const groups = await Promise.all(['username','display_name'].flatMap(column => [select(column,esc),select(column,`${esc}%`),select(column,`%${esc}%`)]));
    const seen = new Set();
    const rows = [];
    for (const row of groups.flat()) {
      if (!row || typeof row.id !== 'string' || seen.has(row.id)) continue;
      const name = typeof row.display_name === 'string' ? row.display_name.toLowerCase() : '';
      const username = typeof row.username === 'string' ? row.username : '';
      const handleMatch = username.includes(needle);
      if (!handleMatch && !name.includes(needle)) continue;
      seen.add(row.id);
      rows.push({ row: {...row,_match:handleMatch?'username':'name'}, rank: handleMatch ? username === needle ? 0 : username.startsWith(needle) ? 1 : 2 : name === needle ? 3 : name.startsWith(needle) ? 4 : 5 });
    }
    return rows
      .sort((a, b) => a.rank - b.rank || String(a.row.display_name).localeCompare(String(b.row.display_name)) || a.row.id.localeCompare(b.row.id))
      .map(entry => entry.row);
  };

  const byWallet = async wallet => {
    const links = await run(db.from('cl_wallets').select('user_id')
      .eq('chain', wallet.chain).eq('address', wallet.address).limit(MAX_WALLET_ROWS));
    const ids = [...new Set(links.map(link => link && link.user_id).filter(id => typeof id === 'string'))];
    if (!ids.length) return { rows: [], capped: false };
    const users = await run(db.from('cl_users').select(USER_COLUMNS).in('id', ids.slice(0, MAX_WALLET_ROWS)).limit(MAX_WALLET_ROWS));
    const byId = new Map(users.filter(user => user && typeof user.id === 'string').map(user => [user.id, user]));
    // Same default as /api/profiles/:id: only an explicit false hides wallets.
    const rows = ids.map(id => byId.get(id)).filter(user => user && user.public_wallets !== false);
    return { rows, capped: rows.length > MAX_PEOPLE };
  };

  const search = async ({ q, address, chain } = {}) => {
    const text = cleanQuery(q);
    const wallet = resolveWallet(address, chain);
    if (!text && !wallet) return { people: [], truncated: false };
    if (!db || typeof db.from !== 'function') throw unavailable();

    const [named, linked] = await Promise.all([
      text ? byName(text) : [],
      wallet ? byWallet(wallet) : { rows: [], capped: false },
    ]);
    const people = [];
    const seen = new Set();
    let total = 0;
    for (const [rows, match] of [[linked.rows, 'public-wallet'], [named, 'name']]) {
      for (const row of rows) {
        if (seen.has(row.id)) continue;
        seen.add(row.id);
        total += 1;
        if (people.length < MAX_PEOPLE) people.push(toPerson(row, match === 'name' ? row._match || match : match));
      }
    }
    return { people, truncated: total > MAX_PEOPLE || linked.capped };
  };

  return { search };
};

module.exports = { createPeopleSearch, MAX_PEOPLE, USER_COLUMNS };
