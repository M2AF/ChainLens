'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createExchangeService, registerExchangeRoutes, parsePair, validAddress } = require('../exchange-service');

const EVM = '0x01faF6DFc230d755141D84d7cB980dd68f5Efe13';
const SOL = '3noTuHnQdHkat2w5rBx18vAACMzFUvB5LodEe5vMN98d';
const fixture = (handlers) => {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    const u = new URL(url);
    calls.push({ path: u.pathname, query: Object.fromEntries(u.searchParams), headers: init.headers, body: init.body && JSON.parse(init.body) });
    const answer = await handlers[u.pathname](u, init);
    return new Response(JSON.stringify(answer.body), { status: answer.status || 200 });
  };
  return { calls, fetchImpl };
};
const simple = {
  '/ss/estimate': () => ({ body: { result: { estimatedAmount: '0.02', rateId: 'rate-1', validUntil: '2030-01-01T00:00:00Z' } } }),
  '/ss/ranges': () => ({ body: { result: { min: '0.01', max: '100' } } }),
  '/ss/exchange': () => ({ body: { result: { id: 'simple-123', status: 'waiting', addressFrom: SOL, addressTo: EVM, amountFrom: '1', amountTo: '0.02' } } }),
  '/ss/status/simple-123': () => ({ body: { result: { id: 'simple-123', status: 'finished', addressFrom: SOL, addressTo: EVM, amountFrom: '1', amountTo: '0.021' } } }),
};

test('quote, create, status use SimpleSwap and keep Worker tag server-side', async () => {
  const { calls, fetchImpl } = fixture(simple);
  const service = createExchangeService({ fetchImpl, clientToken: 'server-tag', now: () => Date.parse('2026-09-24T00:00:00Z') });
  const q = await service.quote({ from: 'sol:sol', to: 'eth:eth', amount: '1', fixed: true });
  assert.equal(q.provider, 'simpleswap');
  assert.equal(q.estimatedAmount, '0.02');
  assert.ok(!JSON.stringify(q).includes('server-tag'));
  const order = await service.create({ quoteId: q.quoteId, addressTo: EVM, userRefundAddress: SOL });
  assert.equal(order.addressFrom, SOL);
  assert.equal(calls.find(c => c.path === '/ss/exchange').body.rateId, 'rate-1');
  assert.equal(calls[0].headers['x-mm-client'], 'server-tag');
  assert.equal((await service.status('simpleswap', 'simple-123')).status, 'finished');
  assert.equal((await service.create({ quoteId: q.quoteId, addressTo: EVM, userRefundAddress: SOL })).id, 'simple-123');
  await assert.rejects(service.create({ quoteId: q.quoteId, addressTo: EVM }), /already used/);
  assert.equal(calls.filter(c => c.path === '/ss/exchange').length, 1);
});

test('ChangeNOW fallback preserves DOT Asset Hub mapping through order creation', async () => {
  const { calls, fetchImpl } = fixture({
    '/ss/estimate': () => ({ status: 404, body: { message: 'Unsupported pair' } }),
    '/ss/ranges': simple['/ss/ranges'],
    '/cn/estimate': () => ({ body: { toAmount: '1.2', rateId: 'cn-rate' } }),
    '/cn/range': () => ({ body: { minAmount: '0.5', maxAmount: '100' } }),
    '/cn/exchange': () => ({ body: { id: 'change-123', status: 'new', payinAddress: '1PolkadotAddress111111111111111111111111111111', payoutAddress: EVM, expectedAmountFrom: '1', expectedAmountTo: '1.2' } }),
  });
  const service = createExchangeService({ fetchImpl });
  const q = await service.quote({ from: 'dot:dot', to: 'eth:eth', amount: '1', fixed: false });
  assert.equal(q.provider, 'changenow');
  assert.equal(calls.find(c => c.path === '/cn/estimate').query.fromNetwork, 'assethub');
  const order = await service.create({ quoteId: q.quoteId, addressTo: EVM });
  assert.equal(order.status, 'waiting');
  assert.equal(calls.find(c => c.path === '/cn/exchange').body.fromNetwork, 'assethub');
});

test('invalid pairs, addresses, amounts and expired quotes are refused', async () => {
  assert.throws(() => parsePair({ from: 'sol:sol', to: 'sol:sol', amount: '1' }), /different/);
  assert.throws(() => parsePair({ from: 'sol:sol', to: 'eth:eth', amount: '1e9' }), /amount/);
  assert.equal(validAddress('eth', SOL), false);
  const { fetchImpl } = fixture(simple);
  let clock = Date.parse('2026-09-24T00:00:00Z');
  const service = createExchangeService({ fetchImpl, now: () => clock });
  const q = await service.quote({ from: 'sol:sol', to: 'eth:eth', amount: '1' });
  await assert.rejects(service.create({ quoteId: q.quoteId, addressTo: SOL }), /destination/);
  clock += 121_000;
  await assert.rejects(service.create({ quoteId: q.quoteId, addressTo: EVM }), /expired/);
});

test('uncertain create response cannot be replayed with the same quote', async () => {
  let createCalls = 0;
  const { fetchImpl } = fixture({ ...simple, '/ss/exchange': () => { createCalls++; throw new Error('timeout'); } });
  const service = createExchangeService({ fetchImpl });
  const q = await service.quote({ from: 'sol:sol', to: 'eth:eth', amount: '1' });
  await assert.rejects(service.create({ quoteId: q.quoteId, addressTo: EVM }), /may have reached/);
  await assert.rejects(service.create({ quoteId: q.quoteId, addressTo: EVM }), /already used/);
  assert.equal(createCalls, 1);
});

test('Express exchange routes pass the request through to quote and create handlers', async () => {
  const express = require('express');
  const { fetchImpl } = fixture(simple);
  const app = express();
  app.use(express.json());
  registerExchangeRoutes(app, createExchangeService({ fetchImpl }));
  const server = await new Promise(resolve => {
    const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
  });
  try {
    const url = `http://127.0.0.1:${server.address().port}`;
    const response = await fetch(`${url}/api/exchange/quote?from=sol%3Asol&to=eth%3Aeth&amount=1&fixed=false`);
    assert.equal(response.status, 200);
    const quote = await response.json();
    assert.equal(quote.provider, 'simpleswap');
    const create = await fetch(`${url}/api/exchange/create`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ quoteId: quote.quoteId, addressTo: EVM }),
    });
    assert.equal(create.status, 200);
    assert.equal((await create.json()).id, 'simple-123');
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});

test('provider selection follows the wallet: only the estimate decides, limits are informational', async () => {
  const { calls, fetchImpl } = fixture({ ...simple, '/ss/ranges': () => ({ status: 500, body: { message: 'range down' } }) });
  const service = createExchangeService({ fetchImpl });
  const q = await service.quote({ from: 'sol:sol', to: 'eth:eth', amount: '1' });
  assert.equal(q.provider, 'simpleswap');
  assert.equal(q.min, null);
  assert.equal(calls.some(c => c.path.startsWith('/cn/')), false);
});

test('an out-of-range amount stays with SimpleSwap but cannot create an order', async () => {
  const { calls, fetchImpl } = fixture(simple);
  const service = createExchangeService({ fetchImpl });
  const q = await service.quote({ from: 'sol:sol', to: 'eth:eth', amount: '0.001' });
  assert.equal(q.provider, 'simpleswap');
  assert.equal(q.min, '0.01');
  await assert.rejects(service.create({ quoteId: q.quoteId, addressTo: EVM }), /between 0.01 and 100 SOL/);
  assert.equal(calls.filter(c => c.path === '/ss/exchange').length, 0);
});

test('when neither provider can price a pair, SimpleSwap\'s reason is shown', async () => {
  const { fetchImpl } = fixture({
    '/ss/estimate': () => ({ status: 422, body: { description: 'Pair is not available' } }),
    '/ss/ranges': simple['/ss/ranges'],
    '/cn/estimate': () => ({ status: 400, body: { message: 'pair_is_inactive' } }),
    '/cn/range': () => ({ status: 400, body: {} }),
  });
  const service = createExchangeService({ fetchImpl });
  await assert.rejects(service.quote({ from: 'xmr:xmr', to: 'eth:eth', amount: '1' }), /Pair is not available/);
});
