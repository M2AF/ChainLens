'use strict';

const WebSocket = require('ws');
const clean = (value, max = 300) => typeof value === 'string' ? value.slice(0, max) : '';
function parseListing(message) {
  if (!message || !['announcement', 'tweet'].includes(message.type) || message.parser?.classification?.event !== 'listing') return null;
  let url;
  try { url = new URL(message.url); } catch { return null; }
  if (url.protocol !== 'https:' || url.username || url.password) return null;
  const timestamp = Number(message.detected_time_us) / 1000;
  if (!Number.isFinite(timestamp) || timestamp <= 0 || !Number.isFinite(new Date(timestamp).getTime())) return null;
  const symbols = [...new Set((Array.isArray(message.parser.assets) ? message.parser.assets : []).map(a => clean(a?.symbol, 40)).filter(Boolean))].slice(0, 20);
  return { id: String(message.id || url.href + timestamp), url: url.href, timestamp,
    exchange: clean(message.parser.exchange, 60), marketType: clean(message.parser.classification.type, 60),
    markets: (Array.isArray(message.parser.classification.markets) ? message.parser.classification.markets : []).map(m => clean(m, 20)).slice(0, 10),
    symbols, title: clean(message.parser.display || message.content?.title || message.content?.text || 'New listing', 1000) };
}

// One authenticated upstream per server, shared by all browser visitors.
function createNewListingsService({ key, Socket = WebSocket, random = Math.random } = {}) {
  let socket, retryTimer, admissionTimer, stopped = false, retryMs = 1000;
  let state = key ? 'connecting' : 'unconfigured', delayMs = null, updatedAt = null;
  const events = [];
  const snapshot = () => ({ state, delayMs, updatedAt, events: events.slice() });
  function connect() {
    if (stopped || !key || socket) return;
    state = 'connecting';
    let fatal = false, minimumWait = 0, admitted = false;
    const current = socket = new Socket('wss://ws.newlistings.pro/v2/full', {
      headers: { authorization: `Bearer ${key}` }, handshakeTimeout: 10000, maxPayload: 256 * 1024,
    });
    admissionTimer = setTimeout(() => current.terminate(), 15000);
    admissionTimer.unref?.();
    current.on('message', data => {
      let message;
      try { message = JSON.parse(data.toString()); } catch { fatal = true; state = 'error'; current.close(); return; }
      if (message?.type === 'success' && message.code === 'READY') {
        admitted = true; clearTimeout(admissionTimer); retryMs = 1000; state = 'live';
        delayMs = Number.isFinite(message.subscription?.delay_ms) ? message.subscription.delay_ms : null;
      } else if (message?.type === 'error') {
        fatal = message.code !== 'SERVER_UNAVAILABLE'; state = fatal ? 'error' : 'reconnecting'; current.close();
      } else if (admitted) {
        const event = parseListing(message);
        if (event && !events.some(e => e.id === event.id || (e.url === event.url && e.timestamp === event.timestamp))) {
          events.push(event); events.sort((a, b) => b.timestamp - a.timestamp); events.splice(200); updatedAt = Date.now();
        }
      }
    });
    current.on('unexpected-response', (_request, response) => {
      const status = response.statusCode;
      fatal = status < 500 && status !== 408 && status !== 429;
      const after = response.headers['retry-after'] || '';
      minimumWait = /^\d+$/.test(after) ? Number(after) * 1000 : Math.max(0, Date.parse(after) - Date.now()) || 0;
      response.resume(); current.terminate();
    });
    current.on('error', () => {}); // Never expose upstream errors or auth headers.
    current.on('close', code => {
      clearTimeout(admissionTimer); socket = null;
      if (stopped) return;
      if (fatal || code === 1008) { state = 'error'; return; }
      state = 'reconnecting';
      retryTimer = setTimeout(connect, Math.max(retryMs, minimumWait) + random() * 250);
      retryTimer.unref?.(); retryMs = Math.min(retryMs * 2, 30000);
    });
  }
  return { snapshot, start: connect, stop() { stopped = true; clearTimeout(retryTimer); clearTimeout(admissionTimer); socket?.terminate(); } };
}
module.exports = { createNewListingsService, parseListing };
