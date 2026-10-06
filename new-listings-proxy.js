'use strict';

// Render only reads the durable Cloudflare feed; it never owns a provider connection.
async function readNewListings(fetchImpl, baseUrl) {
  const url = new URL('/api/market/new-listings', baseUrl);
  if (url.protocol !== 'https:' || url.username || url.password) throw new Error('Invalid listings Worker URL');
  const response = await fetchImpl(url.href, {
    headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) throw new Error('Listings Worker unavailable');
  const feed = await response.json();
  if (!feed || !Array.isArray(feed.events) || typeof feed.state !== 'string' || feed.storage !== 'cloudflare-sqlite') {
    throw new Error('Invalid listings Worker response');
  }
  return feed;
}

module.exports = { readNewListings };
