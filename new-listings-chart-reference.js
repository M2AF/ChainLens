'use strict';

// Read only public listing metadata. Never evaluate the page's scripts or guess a market from a ticker.
function sourceListingPath(html, event) {
  for (const match of html.matchAll(/<a\b([^>]*data-feed-event-id="[^"]+"[^>]*)>/g)) {
    if (match[1].match(/data-feed-event-id="([^"]+)"/)?.[1] !== String(event.id)) continue;
    const path = match[1].match(/href="([^"]+)"/)?.[1];
    if (path && /^\/listings\/[a-z0-9-]+\/[a-z0-9-]+$/.test(path)) return path;
  }
  return null;
}

function providerLinkedMarket(html, event, symbol) {
  let text = '';
  for (const match of html.matchAll(/self\.__next_f\.push\((\[[\s\S]*?\])\)<\/script>/g)) {
    try { const record = JSON.parse(match[1]); if (record[0] === 1 && typeof record[1] === 'string') text += record[1]; } catch {}
  }
  let scenario;
  function walk(value, depth = 0) {
    if (!value || typeof value !== 'object' || depth > 30) return;
    if (value.scenario?.eventId === String(event.id)) scenario = value.scenario;
    for (const child of Object.values(value)) walk(child, depth + 1);
  }
  for (const line of text.split('\n')) {
    if (!line.includes('"scenario"')) continue;
    try { walk(JSON.parse(line.slice(line.indexOf(':') + 1))); } catch {}
  }
  if (!scenario || scenario.exchange?.toLowerCase() !== event.exchange.toLowerCase() || scenario.officialUrl !== event.url) return null;
  const asset = scenario.assets?.find(asset => asset.ticker === symbol);
  for (const link of asset?.tradeOn || []) {
    try {
      const url = new URL(link.url);
      const match = url.pathname.match(/^\/advanced-trade\/spot\/([A-Z0-9._-]+)-([A-Z0-9]+)$/);
      if (link.exchange === 'Coinbase' && url.origin === 'https://www.coinbase.com' && !url.username && !url.password && match?.[1] === symbol) {
        return { exchange: 'coinbase', market: match[1] + '-' + match[2], quote: match[2] };
      }
    } catch {}
  }
  return null;
}

module.exports = { sourceListingPath, providerLinkedMarket };
