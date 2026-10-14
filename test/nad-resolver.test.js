const test = require('node:test');
const assert = require('node:assert/strict');
const { Interface, namehash, ZeroAddress } = require('ethers');
const { createNadResolver, normalizeNadName, registerNadRoutes, NNS_MAINNET } = require('../nad-resolver');
const { detectScannerIntent, parseAddressInput } = require('../public/chain-catalog');
const ABI = new Interface(['function getResolvedAddress(bytes32 node) view returns (address)']);
const ADDRESS = '0x01faF6DFc230d755141D84d7cB980dd68f5Efe13';
const response = address => ({ ok: true, json: async () => ({ result: ABI.encodeFunctionResult('getResolvedAddress', [address]) }) });

test('recognizes .nad search and scanner input without disturbing existing domains', () => {
  assert.deepEqual(detectScannerIntent('criptoejesus.nad'), { chain: 'evm', value: 'criptoejesus.nad', label: 'Monad .nad domain' });
  assert.equal(parseAddressInput('criptoejesus.nad', 'evm')[0].resolution, 'evm-domain');
  for (const value of ['alice.eth', 'alice.crypto']) assert.equal(detectScannerIntent(value).chain, 'evm');
  assert.equal(detectScannerIntent('alice.sol').chain, 'solana');
  assert.equal(detectScannerIntent('$alice').chain, 'cardano');
  for (const value of ['.nad', 'https://alice.nad', 'my friend.nad']) assert.equal(detectScannerIntent(value), null);
});
test('normalizes names and rejects malformed requests before any RPC', async () => {
  assert.equal(normalizeNadName('  CriptoeJesus.NAD '), 'criptoejesus.nad');
  assert.equal(normalizeNadName('é.nad'), 'é.nad');
  const resolve = createNadResolver({ fetchImpl: () => assert.fail('invalid name reached RPC') });
  for (const value of ['', '.nad', 'alice.eth', 'alice..nad', 'https://alice.nad', 'alice/bob.nad', 'a'.repeat(256) + '.nad', null]) {
    await assert.rejects(resolve(value), e => e.statusCode === 400);
  }
});
test('reads normalized namehash from mainnet NNS and reuses bounded cache until expiry', async () => {
  let now = 1000, calls = 0;
  const resolve = createNadResolver({ now: () => now, fetchImpl: async (url, options) => {
    calls++; const body = JSON.parse(options.body);
    assert.equal(body.method, 'eth_call'); assert.equal(body.params[0].to, NNS_MAINNET);
    assert.equal(body.params[0].data, ABI.encodeFunctionData('getResolvedAddress', [namehash('criptoejesus.nad')]));
    assert.equal(body.params[1], 'latest'); assert.ok(options.signal);
    return response(ADDRESS);
  } });
  assert.equal((await resolve('CriptoeJesus.NAD')).address, ADDRESS);
  await resolve('criptoejesus.nad'); assert.equal(calls, 1);
  now += 60001; await resolve('criptoejesus.nad'); assert.equal(calls, 2);
});
test('deduplicates concurrent lookups and falls back on provider failures', async () => {
  const calls = [];
  const resolve = createNadResolver({ rpcUrls: ['https://first', 'https://second'], fetchImpl: async url => {
    calls.push(url); if (url.endsWith('first')) throw new Error('timeout');
    return response(ADDRESS);
  } });
  const values = await Promise.all([resolve('alice.nad'), resolve('ALICE.NAD')]);
  assert.deepEqual(calls, ['https://first', 'https://second']); assert.equal(values[0].address, values[1].address);
});
test('zero address is not a wallet; malformed/RPC failures remain retryable and distinct', async () => {
  let calls = 0;
  const zero = createNadResolver({ fetchImpl: async () => { calls++; return response(ZeroAddress); } });
  await assert.rejects(zero('unregistered.nad'), e => e.statusCode === 404);
  assert.equal(calls, 1);
  let broken = true;
  const resolve = createNadResolver({ fetchImpl: async () => broken ? { ok: true, json: async () => ({ result: '0x' }) } : response(ADDRESS) });
  await assert.rejects(resolve('alice.nad'), e => e.statusCode === 503);
  broken = false; assert.equal((await resolve('alice.nad')).address, ADDRESS);
});
test('registered HTTP route preserves success and not-found/unavailable status', async () => {
  let handler;
  registerNadRoutes({ get(path, fn) { assert.equal(path, '/api/resolve/nad/:name'); handler = fn; } }, createNadResolver({ fetchImpl: async () => response(ZeroAddress) }));
  let status, body;
  const res = { status(code) { status = code; return this; }, json(value) { body = value; } };
  await handler({ params: { name: 'alice.nad' } }, res);
  assert.equal(status, 404); assert.match(body.error, /no resolved wallet/);
  await handler({ params: { name: 'alice.eth' } }, res); assert.equal(status, 400);
});
