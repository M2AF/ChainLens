'use strict';

const SOURCE = 'https://newlistings.pro';
// Match the provider's event identity, never a ticker alone (tickers can collide).
function parseSourceIcons(html) {
  const events = new Map();
  for (const match of html.matchAll(/<a\b([^>]*data-feed-event-id="[^"]+"[^>]*)>([\s\S]*?)<\/a>/g)) {
    const id = match[1].match(/data-feed-event-id="([^"]+)"/)?.[1];
    const encoded = match[1].match(/data-feed-cache="([^"]+)"/)?.[1];
    try {
      const cache = JSON.parse(decodeURIComponent(encoded));
      const symbols = cache[3];
      if (cache[0] !== 'feed' || String(cache[1]) !== id || !Array.isArray(symbols) || symbols.length > 20) continue;
      const urls = [...match[2].matchAll(/<img\b[^>]*\bsrc="([^"]+)"/g)].map(image => {
        const url = new URL(image[1].replace(/&amp;/g, '&'), SOURCE);
        const media = url.searchParams.get('url');
        if (url.origin !== SOURCE || url.pathname !== '/_next/image' || !media?.startsWith('/media/token-images/') || media.includes('..')) throw new Error('Unexpected image');
        return url.href;
      });
      if (urls.length !== symbols.length) continue;
      events.set(id, symbols.map((symbol, index) => ({ symbol, url: urls[index] })));
    } catch { /* A changed or incomplete source card is not an identity match. */ }
  }
  return events;
}

function createListingIconEnricher(fetchImpl) {
  const icons = new Map();
  let nextRefresh = 0, pending;
  async function refresh() {
    nextRefresh = Date.now() + 60_000;
    try {
      const response = await fetchImpl(SOURCE + '/', { signal: AbortSignal.timeout(4000), redirect: 'error', headers: { Accept: 'text/html' } });
      if (!response.ok) return;
      // Bound the public-page response before decoding or parsing it.
      const reader = response.body.getReader();
      const chunks = []; let size = 0;
      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          size += value.byteLength;
          if (size > 2 * 1024 * 1024) { await reader.cancel(); return; }
          chunks.push(Buffer.from(value));
        }
      } finally { reader.releaseLock(); }
      for (const [id, assets] of parseSourceIcons(Buffer.concat(chunks).toString('utf8'))) {
        icons.delete(id); icons.set(id, assets);
      }
      while (icons.size > 200) icons.delete(icons.keys().next().value);
    } catch { /* Artwork outages must not interrupt the durable listings feed. */ }
  }
  return async feed => {
    if (feed.events.length && Date.now() >= nextRefresh && !pending) pending = refresh().finally(() => { pending = null; });
    if (pending) await pending;
    return { ...feed, events: feed.events.map(event => {
      const assets = icons.get(String(event.id));
      return assets && assets.length === event.symbols?.length && assets.every((asset, index) => asset.symbol === event.symbols[index])
        ? { ...event, tokenIcons: assets } : event;
    }) };
  };
}

module.exports = { parseSourceIcons, createListingIconEnricher };
