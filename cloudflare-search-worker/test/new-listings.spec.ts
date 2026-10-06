import { env } from 'cloudflare:workers';
import { runInDurableObject, abortAllDurableObjects, runDurableObjectAlarm } from 'cloudflare:test';
import { afterEach, describe, expect, it, vi } from 'vitest';
import worker from '../src/index';
import { parseListing } from '../src/new-listings';

const listing = (id = 12) => ({ id, type: 'announcement', url: `https://example.com/listing/${id}`, detected_time_us: 1700000000000000 + id * 1000,
  parser: { exchange: 'upbit', classification: { event: 'listing', type: 'spot' }, assets: [{ symbol: 'TEST' }], display: '$TEST listed' } });
const ready = { type: 'success', code: 'READY', subscription: { delay_ms: 3000, username: 'private' } };
const stub = () => env.NEW_LISTINGS.getByName(crypto.randomUUID());
function mockUpstream() {
  const mock = vi.fn<typeof fetch>().mockImplementation(async () => {
    const pair = new WebSocketPair();
    pair[1].accept();
    return new Response(null, { status: 101, webSocket: pair[0] });
  });
  vi.stubGlobal('fetch', mock);
  return mock;
}

describe('persistent listings collector', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('rejects unsafe URLs, invalid dates and non-listing messages', () => {
    expect(parseListing(listing())?.symbols).toEqual(['TEST']);
    expect(parseListing({ ...listing(), url: 'javascript:alert(1)' })).toBeNull();
    expect(parseListing({ ...listing(), detected_time_us: NaN })).toBeNull();
    expect(parseListing({ ...listing(), parser: { classification: { event: 'delisting' } } })).toBeNull();
  });

  it('keeps one admitted upstream and persists bounded, deduplicated listings across eviction', async () => {
    const mock = mockUpstream();
    const feed = stub();
    await Promise.all([feed.ensureConnected(), feed.ensureConnected()]);
    expect(mock).toHaveBeenCalledOnce();
    await runInDurableObject(feed, object => {
      object['receive'](JSON.stringify(listing()));
      object['receive'](JSON.stringify(ready));
      object['receive'](JSON.stringify(listing()));
      object['receive'](JSON.stringify(listing()));
      object['receive'](JSON.stringify({ ...listing(), type: 'other' }));
      for (let id = 20; id < 230; id++) object['receive'](JSON.stringify(listing(id)));
    });
    const before = await feed.snapshot();
    expect(before.events).toHaveLength(200);
    expect(before.diagnostics.duplicateListings).toBe(1);
    expect(before.diagnostics.ignoredEvents).toBe(1);
    expect(before.state).toBe('live');
    expect(JSON.stringify(before)).not.toContain('private');
    expect(JSON.stringify(before)).not.toContain('test-key');
    await abortAllDurableObjects();
    const after = await env.NEW_LISTINGS.get(feed.id).snapshot();
    expect(after.events).toEqual(before.events);
    expect(after.diagnostics.acceptedListings).toBe(before.diagnostics.acceptedListings);
    expect(after.diagnostics.restarts).toBe(1);
    expect(mock).toHaveBeenCalledTimes(2);
  });

  it('watchdog reschedules without visitors and reconnects after socket loss', async () => {
    const mock = mockUpstream();
    const feed = stub();
    await feed.ensureConnected();
    await runInDurableObject(feed, async (object, state) => {
      object['receive'](JSON.stringify(ready));
      expect(await state.storage.getAlarm()).not.toBeNull();
      object['fail']('SOCKET_ERROR');
      object['retryAt'] = 0;
    });
    expect(await runDurableObjectAlarm(feed)).toBe(true);
    expect(mock).toHaveBeenCalledTimes(2);
    await runInDurableObject(feed, async (_object, state) => expect(await state.storage.getAlarm()).toBeGreaterThan(Date.now()));
  });

  it('honors Retry-After and stops authentication failures across restarts', async () => {
    const mock = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 429, headers: { 'Retry-After': '120' } }));
    vi.stubGlobal('fetch', mock);
    const feed = stub();
    await feed.ensureConnected();
    await runInDurableObject(feed, object => expect(object['retryAt']).toBeGreaterThan(Date.now() + 110_000));
    await feed.ensureConnected();
    expect(mock).toHaveBeenCalledOnce();
    await runInDurableObject(feed, object => object['fail']('AUTHENTICATION_FAILED', true));
    await abortAllDurableObjects();
    expect((await env.NEW_LISTINGS.get(feed.id).snapshot()).state).toBe('error');
    expect(mock).toHaveBeenCalledOnce();
  });

  it('serves persisted data with CORS and no cache, rejecting mutation and other browser origins', async () => {
    mockUpstream();
    const url = 'https://worker.test/api/market/new-listings';
    const response = await worker.fetch(new Request(url, { headers: { Origin: 'https://chainlensnft.info' } }), env);
    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('https://chainlensnft.info');
    const body = await response.json<{ storage: string }>();
    expect(body.storage).toBe('cloudflare-sqlite');
    expect((await worker.fetch(new Request(url, { method: 'POST' }), env)).status).toBe(405);
    expect((await worker.fetch(new Request(url, { headers: { Origin: 'https://evil.test' } }), env)).status).toBe(403);
  });

  it('a corrected provider credential clears a persisted fatal authentication state', async () => {
    const mock = mockUpstream();
    const feed = stub();
    await feed.ensureConnected();
    await runInDurableObject(feed, object => {
      object['keyFingerprint'] = 'fingerprint-of-the-old-credential';
      object['fail']('AUTHENTICATION_FAILED', true);
    });
    await abortAllDurableObjects();
    const recovered = await env.NEW_LISTINGS.get(feed.id).snapshot();
    expect(recovered.state).toBe('connecting');
    expect(mock).toHaveBeenCalledTimes(2);
  });
});
