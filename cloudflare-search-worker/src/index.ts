const MAX_QUERY_LENGTH = 200;
const MAX_UPSTREAM_BYTES = 2 * 1024 * 1024;
const SEARCH_TIMEOUT_MS = 65_000;
const KEEP_ALIVE_TIMEOUT_MS = 55_000;

type Fetcher = typeof fetch;

type SearxResult = {
  title?: unknown;
  url?: unknown;
  content?: unknown;
  engines?: unknown;
  publishedDate?: unknown;
};

type SearchResult = {
  id: string;
  title: string;
  url: string;
  snippet: string;
  source: string;
  engines: string[];
  publishedAt: string | null;
};

const cleanText = (value: unknown): string => String(value || '')
  .replace(/<[^>]*>/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const allowedOrigins = (env: Env): Set<string> => new Set(
  env.ALLOWED_ORIGINS.split(',').map((origin) => origin.trim()).filter(Boolean),
);

const corsHeaders = (origin: string | null, env: Env): HeadersInit => {
  const headers: Record<string, string> = {
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  };
  if (origin && allowedOrigins(env).has(origin)) headers['Access-Control-Allow-Origin'] = origin;
  return headers;
};

const jsonResponse = (payload: unknown, status: number, origin: string | null, env: Env): Response => Response.json(payload, {
  status,
  headers: {
    ...corsHeaders(origin, env),
    'Cache-Control': status === 200 ? 'public, max-age=60' : 'no-store',
    'X-Content-Type-Options': 'nosniff',
  },
});

const normalizeBaseUrl = (value: string): string => {
  const url = new URL(value);
  if (url.protocol !== 'https:') throw new Error('SearXNG must use HTTPS.');
  url.pathname = url.pathname.replace(/\/+$/, '');
  url.search = '';
  url.hash = '';
  return url.toString().replace(/\/$/, '');
};

const validateQuery = (value: string | null): string => {
  const query = String(value || '').replace(/\s+/g, ' ').trim();
  if (!query) throw new RangeError('Enter a search query.');
  if (query.length > MAX_QUERY_LENGTH) throw new RangeError(`Search queries are limited to ${MAX_QUERY_LENGTH} characters.`);
  return query;
};

const normalizeResult = (result: SearxResult, index: number): SearchResult | null => {
  let url: URL;
  try {
    url = new URL(String(result.url || ''));
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;

  return {
    id: `${index}-${url.hostname}-${url.pathname}`,
    title: cleanText(result.title) || url.hostname,
    url: url.toString(),
    snippet: cleanText(result.content),
    source: url.hostname.replace(/^www\./, ''),
    engines: Array.isArray(result.engines)
      ? result.engines.filter((engine): engine is string => typeof engine === 'string' && Boolean(engine)).slice(0, 4)
      : [],
    publishedAt: typeof result.publishedDate === 'string' ? result.publishedDate : null,
  };
};

const searchSearxng = async (query: string, env: Env, fetchImpl: Fetcher = fetch): Promise<SearchResult[]> => {
  const requestUrl = new URL(`${normalizeBaseUrl(env.SEARXNG_BASE_URL)}/search`);
  requestUrl.searchParams.set('q', query);
  requestUrl.searchParams.set('format', 'json');
  requestUrl.searchParams.set('language', 'auto');
  requestUrl.searchParams.set('safesearch', '1');
  requestUrl.searchParams.set('categories', 'general');

  const response = await fetchImpl(requestUrl, {
    headers: { Accept: 'application/json', 'User-Agent': 'ChainLens-Search-Worker/1.0' },
    signal: AbortSignal.timeout(SEARCH_TIMEOUT_MS),
    cf: { cacheEverything: true, cacheTtl: 120 },
  });
  if (!response.ok) throw new Error(`SearXNG returned HTTP ${response.status}.`);

  const contentLength = Number(response.headers.get('content-length') || 0);
  if (contentLength > MAX_UPSTREAM_BYTES) throw new Error('SearXNG response exceeded the size limit.');

  const payload: unknown = await response.json();
  const rawResults = payload && typeof payload === 'object' && 'results' in payload
    ? (payload as { results?: unknown }).results
    : null;
  return (Array.isArray(rawResults) ? rawResults : [])
    .map((result, index) => normalizeResult(result as SearxResult, index))
    .filter((result): result is SearchResult => Boolean(result))
    .slice(0, 10);
};

const warmSearxng = async (env: Env, fetchImpl: Fetcher = fetch): Promise<boolean> => {
  try {
    const response = await fetchImpl(`${normalizeBaseUrl(env.SEARXNG_BASE_URL)}/`, {
      headers: { Accept: 'text/html', 'User-Agent': 'ChainLens-Search-KeepAlive/2.0' },
      signal: AbortSignal.timeout(KEEP_ALIVE_TIMEOUT_MS),
    });
    if (!response.ok) throw new Error(`SearXNG returned HTTP ${response.status}.`);
    await response.body?.cancel();
    console.log(JSON.stringify({ message: 'SearXNG keep-alive succeeded', status: response.status }));
    return true;
  } catch (error) {
    console.error(JSON.stringify({
      message: 'SearXNG keep-alive failed',
      error: error instanceof Error ? error.message : String(error),
    }));
    return false;
  }
};

const handleRequest = async (request: Request, env: Env, fetchImpl: Fetcher = fetch): Promise<Response> => {
  const url = new URL(request.url);
  const origin = request.headers.get('Origin');
  const isAllowedOrigin = Boolean(origin && allowedOrigins(env).has(origin));

  if (request.method === 'OPTIONS') {
    return isAllowedOrigin
      ? new Response(null, { status: 204, headers: corsHeaders(origin, env) })
      : jsonResponse({ error: 'Origin not allowed.' }, 403, origin, env);
  }

  if (url.pathname === '/api/search/status') {
    if (request.method !== 'GET') return jsonResponse({ error: 'Method not allowed.' }, 405, origin, env);
    return jsonResponse({ provider: 'searxng-cloudflare-worker', configured: true }, 200, origin, env);
  }

  if (url.pathname === '/api/search/activity') {
    if (request.method !== 'POST') return jsonResponse({ error: 'Method not allowed.' }, 405, origin, env);
    if (!isAllowedOrigin) return jsonResponse({ error: 'Origin not allowed.' }, 403, origin, env);
    const warmed = await warmSearxng(env, fetchImpl);
    return warmed
      ? jsonResponse({ active: true }, 200, origin, env)
      : jsonResponse({ error: 'Search warm-up failed.' }, 503, origin, env);
  }

  if (url.pathname !== '/api/search/web') return jsonResponse({ error: 'Not found.' }, 404, origin, env);
  if (request.method !== 'GET') return jsonResponse({ error: 'Method not allowed.' }, 405, origin, env);
  if (!isAllowedOrigin) return jsonResponse({ error: 'Origin not allowed.' }, 403, origin, env);

  let query: string;
  try {
    query = validateQuery(url.searchParams.get('q'));
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : 'Invalid search query.' }, 400, origin, env);
  }

  try {
    const results = await searchSearxng(query, env, fetchImpl);
    return jsonResponse({ query, results, cached: false }, 200, origin, env);
  } catch (error) {
    console.error(JSON.stringify({
      message: 'Web search failed',
      error: error instanceof Error ? error.message : String(error),
    }));
    return jsonResponse({ error: 'Web search is temporarily unavailable.' }, 503, origin, env);
  }
};

export default {
  fetch(request: Request, env: Env): Promise<Response> {
    return handleRequest(request, env);
  },
} satisfies ExportedHandler<Env>;
