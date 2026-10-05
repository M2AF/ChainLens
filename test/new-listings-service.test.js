const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { createNewListingsService, parseListing } = require('../new-listings-service');
const fixture = () => ({ id: 12, type: 'announcement', url: 'https://example.com/listing', detected_time_us: 1700000000000000,
  parser: { exchange: 'upbit', classification: { event: 'listing', type: 'spot' }, assets: [{ symbol: 'TEST' }], display: '$TEST listed' } });
test('free listings normalize without paid data; unsafe URLs and other events are rejected', () => {
  const item = parseListing(fixture());
  assert.equal(item.symbols[0], 'TEST'); assert.equal(item.timestamp, 1700000000000);
  assert.equal(parseListing({ ...fixture(), url: 'javascript:alert(1)' }), null);
  assert.equal(parseListing({ ...fixture(), detected_time_us: 'bad' }), null);
  const other = fixture(); other.parser.classification.event = 'delisting';
  assert.equal(parseListing(other), null);
});
test('one upstream, READY admission, deduplication, bounded history, sanitized state, fatal stop', () => {
  const sockets = [];
  class Socket extends EventEmitter {
    constructor(url, options) { super(); this.options = options; sockets.push(this); }
    close() { this.emit('close', 1008); } terminate() { this.emit('close', 1006); }
  }
  const service = createNewListingsService({ key: 'test-secret', Socket });
  service.start(); service.start(); assert.equal(sockets.length, 1);
  const ws = sockets[0];
  const send = message => ws.emit('message', Buffer.from(JSON.stringify(message)));
  send(fixture()); assert.equal(service.snapshot().events.length, 0);
  send({ type: 'success', code: 'READY', subscription: { delay_ms: 3000, username: 'private' } });
  assert.equal(service.snapshot().state, 'live');
  send(fixture()); send(fixture()); assert.equal(service.snapshot().events.length, 1);
  const nonListing = fixture(); nonListing.parser.classification.event = 'none'; send(nonListing);
  assert.equal(service.snapshot().diagnostics.receivedEvents, 3);
  assert.equal(service.snapshot().diagnostics.acceptedListings, 1);
  assert.equal(service.snapshot().diagnostics.duplicateListings, 1);
  assert.equal(service.snapshot().diagnostics.ignoredEvents, 1);
  assert(service.snapshot().diagnostics.connectedAt >= service.snapshot().diagnostics.startedAt);
  const priorSnapshot = service.snapshot(); priorSnapshot.diagnostics.receivedEvents = -1;
  assert.equal(service.snapshot().diagnostics.receivedEvents, 3);
  for (let i = 0; i < 210; i++) send({ ...fixture(), id: i + 20, detected_time_us: 1700000000000000 + i * 1000 });
  assert.equal(service.snapshot().events.length, 200);
  assert(!JSON.stringify(service.snapshot()).includes('private'));
  assert(!JSON.stringify(service.snapshot()).includes('test-secret'));
  send({ type: 'error', code: 'AUTHENTICATION_FAILED', message: 'private upstream details' });
  assert.equal(service.snapshot().state, 'error');
  assert.equal(service.snapshot().diagnostics.lastErrorCode, 'AUTHENTICATION_FAILED');
  service.stop();
});
test('missing server credential reports unconfigured without connecting', () => {
  const service = createNewListingsService(); service.start();
  assert.equal(service.snapshot().state, 'unconfigured'); service.stop();
});
test('transient disconnect retries and only READY restores live state', async () => {
  const sockets = [];
  class Socket extends EventEmitter {
    constructor() { super(); sockets.push(this); }
    terminate() { this.emit('close', 1006); }
  }
  const service = createNewListingsService({ key: 'test', Socket, random: () => 0 });
  try {
    service.start();
    sockets[0].emit('message', Buffer.from(JSON.stringify({ type: 'success', code: 'READY', subscription: { delay_ms: 3000 } })));
    sockets[0].emit('close', 1006);
    assert.equal(service.snapshot().state, 'reconnecting');
    await new Promise(resolve => setTimeout(resolve, 1100));
    assert.equal(sockets.length, 2);
    assert.equal(service.snapshot().state, 'connecting');
    sockets[1].emit('message', Buffer.from(JSON.stringify({ type: 'success', code: 'READY', subscription: { delay_ms: 3000 } })));
    assert.equal(service.snapshot().state, 'live');
  } finally { service.stop(); }
});
