const test = require('node:test');
const assert = require('node:assert/strict');
const { createPeopleSearch, MAX_PEOPLE } = require('../people-search-service');

const EVM = '0x01faf6dfc230d755141d84d7cb980dd68f5efe13';
const SOL = 'So11111111111111111111111111111111111111112';
const uid = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const user = (n, name, extra = {}) => ({
  id: uid(n), display_name: name, avatar_url: null, avatar_nft_key: null, banner_url: null, public_wallets: true,
  email: `u${n}@example.com`, passkey_id: 'secret', session_token: 'secret', provider_id: 'secret', ...extra,
});

// Minimal PostgREST-like fake: records calls, honours ilike/eq/in/limit.
const fakeDb = ({ users = [], wallets = [], fail = null, log = [] } = {}) => ({
  log,
  from(table) {
    const state = { table, filters: [], limit: Infinity, columns: null };
    const builder = {
      select(columns) { state.columns = columns; return builder; },
      ilike(column, pattern) { state.filters.push({ type: 'ilike', column, pattern }); return builder; },
      eq(column, value) { state.filters.push({ type: 'eq', column, value }); return builder; },
      in(column, values) { state.filters.push({ type: 'in', column, values }); return builder; },
      limit(n) { state.limit = n; return builder; },
      then(resolve, reject) {
        log.push(state);
        if (fail) return fail instanceof Error ? Promise.reject(fail).then(resolve, reject) : Promise.resolve({ data: null, error: fail }).then(resolve, reject);
        const source = table === 'cl_users' ? users : wallets;
        const data = source.filter(row => state.filters.every(filter => {
          if (filter.type === 'eq') return row[filter.column] === filter.value;
          if (filter.type === 'in') return filter.values.includes(row[filter.column]);
          const regex = new RegExp(`^${filter.pattern.replace(/\\(.)/g, (_, c) => `\u0000${c.charCodeAt(0)};`).replace(/%/g, '.*').replace(/_/g, '.').replace(/\u0000(\d+);/g, (_, c) => String.fromCharCode(c).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))}$`, 'i');
          return regex.test(String(row[filter.column] || ''));
        })).slice(0, state.limit);
        return Promise.resolve({ data, error: null }).then(resolve, reject);
      },
    };
    return builder;
  },
});

const PUBLIC_KEYS = ['avatar_nft_key', 'avatar_url', 'banner_url', 'display_name', 'id', 'match'];

test('name search returns only allowlisted fields and explicit columns', async () => {
  const db = fakeDb({ users: [user(1, 'Alice')] });
  const result = await createPeopleSearch({ db }).search({ q: '  alice ' });
  assert.deepEqual(result, { people: [{ id: uid(1), display_name: 'Alice', avatar_url: null, avatar_nft_key: null, banner_url: null, match: 'name' }], truncated: false });
  assert.deepEqual(Object.keys(result.people[0]).sort(), PUBLIC_KEYS);
  db.log.forEach(call => assert.equal(call.columns, 'id,display_name,avatar_url,avatar_nft_key,banner_url,public_wallets'));
});

test('orders exact names before prefixes before substrings and dedupes', async () => {
  const users = [user(1, 'bob the builder'), user(2, 'Super Bob'), user(3, 'Bobby'), user(4, 'BOB'), user(5, 'Alice')];
  const { people } = await createPeopleSearch({ db: fakeDb({ users }) }).search({ q: 'bob' });
  assert.deepEqual(people.map(p => p.display_name), ['BOB', 'bob the builder', 'Bobby', 'Super Bob']);
  assert.equal(new Set(people.map(p => p.id)).size, people.length);
});

test('escapes LIKE wildcards and ignores short or blank queries', async () => {
  const log = [];
  const db = fakeDb({ users: [user(1, 'a_c'), user(2, 'abc'), user(3, '100% real'), user(4, 'x')], log });
  const search = createPeopleSearch({ db }).search;
  assert.deepEqual((await search({ q: 'a_c' })).people.map(p => p.display_name), ['a_c']);
  assert.deepEqual((await search({ q: '%' })).people, []);
  assert.deepEqual((await search({ q: '100%' })).people.map(p => p.display_name), ['100% real']);
  assert.deepEqual((await search({ q: 'a*c' })).people, []);
  const patterns = log.flatMap(call => call.filters.map(f => f.pattern));
  assert.ok(patterns.includes('a\\_c'));
  assert.ok(patterns.includes('%100\\%%'));
  log.length = 0;
  assert.deepEqual(await search({ q: 'x' }), { people: [], truncated: false });
  assert.deepEqual(await search({}), { people: [], truncated: false });
  assert.equal(log.length, 0);
});

test('wallet match respects public_wallets and reports public-wallet only when visible', async () => {
  const users = [
    user(1, 'Visible', { public_wallets: true }),
    user(2, 'Hidden', { public_wallets: false }),
    user(3, 'Defaulted', { public_wallets: null }),
    user(4, 'Undefined', { public_wallets: undefined }),
  ];
  const wallets = [1, 2, 3, 4].map(n => ({ user_id: uid(n), chain: 'evm', address: EVM, label: 'secret', watch_only: true }));
  const { people } = await createPeopleSearch({ db: fakeDb({ users, wallets }) }).search({ address: EVM.toUpperCase().replace('0X', '0x'), chain: 'base' });
  assert.deepEqual(people.map(p => p.display_name).sort(), ['Defaulted', 'Undefined', 'Visible']);
  assert.ok(people.every(p => p.match === 'public-wallet'));
  people.forEach(p => assert.deepEqual(Object.keys(p).sort(), PUBLIC_KEYS));
  assert.ok(!JSON.stringify(people).includes(EVM));
});

test('hidden wallet user surfaces by name without any wallet indication', async () => {
  const users = [user(2, 'Hidden Harry', { public_wallets: false })];
  const wallets = [{ user_id: uid(2), chain: 'evm', address: EVM }];
  const { people } = await createPeopleSearch({ db: fakeDb({ users, wallets }) }).search({ q: 'hidden', address: EVM, chain: 'evm' });
  assert.deepEqual(people.map(p => [p.display_name, p.match]), [['Hidden Harry', 'name']]);
  const onlyWallet = await createPeopleSearch({ db: fakeDb({ users, wallets }) }).search({ address: EVM, chain: 'evm' });
  assert.deepEqual(onlyWallet, { people: [], truncated: false });
});

test('duplicate wallet rows and name+wallet overlap return one person, wallet match first', async () => {
  const users = [user(1, 'Carol'), user(2, 'Carolyn')];
  const wallets = [
    { user_id: uid(2), chain: 'evm', address: EVM }, { user_id: uid(2), chain: 'evm', address: EVM },
    { user_id: uid(1), chain: 'evm', address: EVM },
  ];
  const { people } = await createPeopleSearch({ db: fakeDb({ users, wallets }) }).search({ q: 'carol', address: EVM });
  assert.equal(people.length, 2);
  assert.deepEqual(people.map(p => p.match), ['public-wallet', 'public-wallet']);
  assert.equal(new Set(people.map(p => p.id)).size, 2);
});

test('non-EVM addresses are case-sensitive and not lowercased', async () => {
  const users = [user(1, 'Solana Sam')];
  const wallets = [{ user_id: uid(1), chain: 'solana', address: SOL }];
  const search = createPeopleSearch({ db: fakeDb({ users, wallets }) }).search;
  assert.equal((await search({ address: SOL, chain: 'solana' })).people.length, 1);
  assert.equal((await search({ address: SOL })).people.length, 1);
  assert.deepEqual((await search({ address: SOL.toLowerCase(), chain: 'solana' })).people, []);
});

test('rejects malformed addresses, chains and oversized text with 400', async () => {
  const search = createPeopleSearch({ db: fakeDb() }).search;
  for (const input of [
    { address: 'nope' }, { address: EVM, chain: 'mars' }, { address: SOL, chain: 'evm' },
    { address: 12345 }, { q: 'x'.repeat(65) }, { q: { $ne: 1 } },
  ]) {
    await assert.rejects(() => search(input), error => error.status === 400, JSON.stringify(input));
  }
});

test('database errors and missing db surface as 503, not empty success', async () => {
  for (const fail of [{ message: 'down' }, new Error('network')]) {
    await assert.rejects(() => createPeopleSearch({ db: fakeDb({ fail }) }).search({ q: 'alice' }), error => error.status === 503);
    await assert.rejects(() => createPeopleSearch({ db: fakeDb({ fail }) }).search({ address: EVM }), error => error.status === 503);
  }
  await assert.rejects(() => createPeopleSearch({ db: null }).search({ q: 'alice' }), error => error.status === 503);
  assert.deepEqual(await createPeopleSearch({ db: null }).search({ q: '' }), { people: [], truncated: false });
});

test('caps output at ten people and marks truncation', async () => {
  const users = Array.from({ length: 25 }, (_, i) => user(i + 1, `Dave ${String(i).padStart(2, '0')}`));
  const log = [];
  const result = await createPeopleSearch({ db: fakeDb({ users, log }) }).search({ q: 'dave' });
  assert.equal(result.people.length, MAX_PEOPLE);
  assert.equal(result.truncated, true);
  log.forEach(call => assert.ok(call.limit <= MAX_PEOPLE + 1));
  const few = await createPeopleSearch({ db: fakeDb({ users: users.slice(0, 3) }) }).search({ q: 'dave' });
  assert.deepEqual([few.people.length, few.truncated], [3, false]);
});

test('wallet lookups are bounded and flag truncation when many users share a wallet', async () => {
  const users = Array.from({ length: 15 }, (_, i) => user(i + 1, `Shared ${i}`));
  const wallets = users.map(u => ({ user_id: u.id, chain: 'evm', address: EVM }));
  const log = [];
  const result = await createPeopleSearch({ db: fakeDb({ users, wallets, log }) }).search({ address: EVM });
  assert.equal(result.people.length, MAX_PEOPLE);
  assert.equal(result.truncated, true);
  log.forEach(call => assert.ok(call.limit <= 50));
  const inCall = log.find(call => call.filters.some(f => f.type === 'in'));
  assert.ok(inCall.filters.find(f => f.type === 'in').values.length <= 50);
});

test('public wallet matches survive an initial hidden group and hidden-only counts stay private', async () => {
  const hidden = Array.from({length:15}, (_,i) => user(i+1, 'Hidden '+i, {public_wallets:false}));
  const visible = user(16, 'Visible');
  const users = [...hidden, visible], wallets = users.map(u => ({user_id:u.id,chain:'evm',address:EVM}));
  const result = await createPeopleSearch({db:fakeDb({users,wallets})}).search({address:EVM});
  assert.deepEqual(result.people.map(p=>p.id), [visible.id]); assert.equal(result.truncated,false);
  const onlyHidden = await createPeopleSearch({db:fakeDb({users:hidden,wallets:wallets.slice(0,15)})}).search({address:EVM});
  assert.deepEqual(onlyHidden,{people:[],truncated:false});
});

test('null profile fields use public defaults', async () => {
  const users = [{ id: uid(9), display_name: 'Nulls', avatar_url: undefined, avatar_nft_key: undefined, banner_url: undefined, public_wallets: null }];
  const { people } = await createPeopleSearch({ db: fakeDb({ users }) }).search({ q: 'nulls' });
  assert.deepEqual(people[0], { id: uid(9), display_name: 'Nulls', avatar_url: null, avatar_nft_key: null, banner_url: null, match: 'name' });
});
