import { createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import { afterEach, describe, expect, it, vi } from 'vitest';
import worker from '../src/index';

const workerEnv = {
  SEARXNG_BASE_URL: 'https://chainlens-search-searxng.onrender.com',
  ALLOWED_ORIGINS: 'https://chainlensnft.info,https://www.chainlensnft.info,http://localhost:3001,http://127.0.0.1:3001',
} satisfies Env;

const request = (path: string, origin = 'https://chainlensnft.info') => new Request(`https://worker.example.com${path}`, {
  headers: { Origin: origin },
});

describe('ChainLens search Worker', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('validates empty search inputs', async () => {
    const response = await worker.fetch(request('/api/search/web?q='), workerEnv);
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: 'Enter a search query.' });
  });

  it('proxies and normalizes SearXNG results for ChainLens', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(Response.json({
      results: [{
        title: 'Uniswap',
        url: 'https://uniswap.org/',
        content: 'Swap tokens',
        engines: ['duckduckgo', 'google'],
      }],
    }));

    vi.stubGlobal('fetch', fetchMock);
    const response = await worker.fetch(request('/api/search/web?q=uniswap'), workerEnv);
    const payload = await response.json<{ query: string; results: Array<{ title: string }> }>();

    expect(response.status).toBe(200);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('https://chainlensnft.info');
    expect(payload.query).toBe('uniswap');
    expect(payload.results[0]?.title).toBe('Uniswap');
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('/search?q=uniswap');
  });

  it('rejects requests from other browser origins', async () => {
    const fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal('fetch', fetchMock);
    const response = await worker.fetch(request('/api/search/web?q=uniswap', 'https://example.com'), workerEnv);

    expect(response.status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('keeps SearXNG awake from the scheduled handler', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response('ok'));
    vi.stubGlobal('fetch', fetchMock);
    const ctx = createExecutionContext();
    const controller = {
      scheduledTime: Date.now(),
      cron: '*/10 * * * *',
      noRetry() {},
    } satisfies ScheduledController;

    worker.scheduled(controller, workerEnv, ctx);
    await waitOnExecutionContext(ctx);
    expect(fetchMock).toHaveBeenCalledWith('https://chainlens-search-searxng.onrender.com/', expect.objectContaining({
      headers: expect.objectContaining({ 'User-Agent': 'ChainLens-Search-KeepAlive/2.0' }),
    }));
  });
});
