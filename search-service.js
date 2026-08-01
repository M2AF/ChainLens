const DEFAULT_TIMEOUT_MS = 70000;
const DEFAULT_CACHE_TTL_MS = 2 * 60 * 1000;
const DEFAULT_MAX_RESULTS = 10;
const MAX_QUERY_LENGTH = 200;

const cleanText = (value) => String(value || '')
  .replace(/<[^>]*>/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const normalizeBaseUrl = (value) => {
  if (!value) return null;
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error('SEARXNG_BASE_URL must be a valid HTTP or HTTPS URL');
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('SEARXNG_BASE_URL must use HTTP or HTTPS');
  }
  parsed.pathname = parsed.pathname.replace(/\/+$/, '');
  parsed.search = '';
  parsed.hash = '';
  return parsed.toString().replace(/\/$/, '');
};

const validateQuery = (value) => {
  const query = String(value || '').replace(/\s+/g, ' ').trim();
  if (!query) {
    const error = new Error('Enter a search query.');
    error.statusCode = 400;
    throw error;
  }
  if (query.length > MAX_QUERY_LENGTH) {
    const error = new Error(`Search queries are limited to ${MAX_QUERY_LENGTH} characters.`);
    error.statusCode = 400;
    throw error;
  }
  return query;
};

const normalizeResult = (result, index) => {
  let url;
  try {
    url = new URL(result?.url);
  } catch {
    return null;
  }
  if (!['http:', 'https:'].includes(url.protocol)) return null;

  return {
    id: `${index}-${url.hostname}-${url.pathname}`,
    title: cleanText(result.title) || url.hostname,
    url: url.toString(),
    snippet: cleanText(result.content),
    source: url.hostname.replace(/^www\./, ''),
    engines: Array.isArray(result.engines) ? result.engines.filter(Boolean).slice(0, 4) : [],
    publishedAt: result.publishedDate || null,
  };
};

const createSearchService = ({
  baseUrl = process.env.SEARXNG_BASE_URL,
  fetchImpl = globalThis.fetch,
  timeoutMs = Number(process.env.SEARCH_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS,
  cacheTtlMs = DEFAULT_CACHE_TTL_MS,
  maxResults = DEFAULT_MAX_RESULTS,
  now = () => Date.now(),
} = {}) => {
  const normalizedBaseUrl = normalizeBaseUrl(baseUrl);
  const cache = new Map();

  const searchWeb = async (rawQuery) => {
    const query = validateQuery(rawQuery);
    if (!normalizedBaseUrl) {
      const error = new Error('Web search is not configured yet.');
      error.statusCode = 503;
      throw error;
    }
    if (typeof fetchImpl !== 'function') {
      const error = new Error('Web search is temporarily unavailable.');
      error.statusCode = 503;
      throw error;
    }

    const cacheKey = query.toLocaleLowerCase();
    const cached = cache.get(cacheKey);
    if (cached && now() - cached.createdAt < cacheTtlMs) return { ...cached.value, cached: true };

    const requestUrl = new URL(`${normalizedBaseUrl}/search`);
    requestUrl.searchParams.set('q', query);
    requestUrl.searchParams.set('format', 'json');
    requestUrl.searchParams.set('language', 'auto');
    requestUrl.searchParams.set('safesearch', '1');
    requestUrl.searchParams.set('categories', 'general');

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let response;
    try {
      response = await fetchImpl(requestUrl, {
        signal: controller.signal,
        headers: { Accept: 'application/json', 'User-Agent': 'ChainLens-Search/1.0' },
      });
    } catch (error) {
      const upstreamError = new Error(error?.name === 'AbortError'
        ? 'Web search took too long to respond. The free search service may still be waking up.'
        : 'Web search is temporarily unavailable.');
      upstreamError.statusCode = 503;
      throw upstreamError;
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) {
      const upstreamError = new Error('Web search is temporarily unavailable.');
      upstreamError.statusCode = 503;
      throw upstreamError;
    }

    let payload;
    try {
      payload = await response.json();
    } catch {
      const upstreamError = new Error('Web search returned an invalid response.');
      upstreamError.statusCode = 503;
      throw upstreamError;
    }

    const results = (Array.isArray(payload.results) ? payload.results : [])
      .map(normalizeResult)
      .filter(Boolean)
      .slice(0, maxResults);
    const value = { query, results, cached: false };
    cache.set(cacheKey, { createdAt: now(), value });
    if (cache.size > 100) cache.delete(cache.keys().next().value);
    return value;
  };

  return {
    configured: Boolean(normalizedBaseUrl),
    provider: 'searxng',
    searchWeb,
  };
};

module.exports = {
  MAX_QUERY_LENGTH,
  createSearchService,
  normalizeBaseUrl,
  normalizeResult,
  validateQuery,
};
