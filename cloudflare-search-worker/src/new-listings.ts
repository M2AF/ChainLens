import { DurableObject } from 'cloudflare:workers';

const WATCHDOG_MS = 30_000;
const MAX_MESSAGE_CHARS = 256 * 1024;
const RETAINED_LISTINGS = 200;
const clean = (value: unknown, max = 300): string => typeof value === 'string' ? value.slice(0, max) : '';
type Listing = { id: string; url: string; timestamp: number; exchange: string; marketType: string;
  markets: string[]; symbols: string[]; title: string };
type ProviderMessage = { type?: string; code?: string; id?: number | string; url?: string;
  detected_time_us?: number; subscription?: { delay_ms?: number };
  parser?: { exchange?: string; display?: string; assets?: { symbol?: string }[];
    classification?: { event?: string; type?: string; markets?: string[] } };
  content?: { title?: string; text?: string } };
type Diagnostics = { startedAt: number; connectedAt: number | null; lastMessageAt: number | null;
  lastEventAt: number | null; receivedEvents: number; acceptedListings: number; ignoredEvents: number;
  duplicateListings: number; connections: number; lastErrorCode: string | null; lastCloseCode: number | null;
  lastWatchdogAt: number | null; restarts: number };

export function parseListing(message: ProviderMessage): Listing | null {
  if (!message || !['announcement', 'tweet'].includes(message.type || '') || message.parser?.classification?.event !== 'listing') return null;
  let url: URL;
  try { url = new URL(message.url || ''); } catch { return null; }
  if (url.protocol !== 'https:' || url.username || url.password) return null;
  const timestamp = Number(message.detected_time_us) / 1000;
  if (!Number.isFinite(timestamp) || timestamp <= 0 || !Number.isFinite(new Date(timestamp).getTime())) return null;
  return {
    id: clean(String(message.id || url.href + timestamp), 200), url: url.href.slice(0, 4000), timestamp,
    exchange: clean(message.parser.exchange, 60), marketType: clean(message.parser.classification.type, 60),
    markets: (Array.isArray(message.parser.classification.markets) ? message.parser.classification.markets : []).map(m => clean(m, 20)).slice(0, 10),
    symbols: [...new Set((Array.isArray(message.parser.assets) ? message.parser.assets : []).map(a => clean(a?.symbol, 40)).filter(Boolean))].slice(0, 20),
    title: clean(message.parser.display || message.content?.title || message.content?.text || 'New listing', 1000),
  };
}

// One object per upstream subscription. HTTP readers never create their own provider sockets.
export class NewListingsCollector extends DurableObject<Env> {
  private socket: WebSocket | null = null;
  private opening: Promise<void> | null = null;
  private admitted = false;
  private attemptAt = 0;
  private retryMs = 1000;
  private retryAt = 0;
  private fatal = false;
  private keyFingerprint = '';
  private keyChecked = false;
  private state = 'connecting';
  private delayMs: number | null = null;
  private diagnostics: Diagnostics = { startedAt: Date.now(), connectedAt: null, lastMessageAt: null,
    lastEventAt: null, receivedEvents: 0, acceptedListings: 0, ignoredEvents: 0, duplicateListings: 0,
    connections: 0, lastErrorCode: null, lastCloseCode: null, lastWatchdogAt: null, restarts: 0 };

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.storage.sql.exec(`CREATE TABLE IF NOT EXISTS listings (
      id TEXT PRIMARY KEY, url TEXT NOT NULL, timestamp REAL NOT NULL, payload TEXT NOT NULL,
      UNIQUE(url, timestamp))`);
    ctx.storage.sql.exec('CREATE INDEX IF NOT EXISTS listings_time ON listings(timestamp DESC)');
    ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS feed_meta (id INTEGER PRIMARY KEY CHECK(id = 1), payload TEXT NOT NULL)');
    const row = ctx.storage.sql.exec<{ payload: string }>('SELECT payload FROM feed_meta WHERE id = 1').toArray()[0];
    if (row) {
      const saved = JSON.parse(row.payload) as { diagnostics: Diagnostics; delayMs: number | null; fatal: boolean; retryAt: number; retryMs: number; keyFingerprint?: string };
      this.diagnostics = saved.diagnostics;
      this.diagnostics.restarts++;
      this.delayMs = saved.delayMs;
      this.fatal = saved.fatal;
      this.retryAt = saved.retryAt;
      this.retryMs = saved.retryMs;
      this.keyFingerprint = saved.keyFingerprint || '';
    }
    this.state = !env.NEW_LISTINGS_KEY ? 'unconfigured' : this.fatal ? 'error' : 'reconnecting';
    this.save();
  }

  private save(): void {
    this.ctx.storage.sql.exec('INSERT OR REPLACE INTO feed_meta(id, payload) VALUES(1, ?)', JSON.stringify({
      diagnostics: this.diagnostics, delayMs: this.delayMs, fatal: this.fatal, retryAt: this.retryAt, retryMs: this.retryMs, keyFingerprint: this.keyFingerprint,
    }));
  }

  // Durable alarms are persisted before I/O, so a runtime restart can recover with no visitors.
  async ensureConnected(): Promise<void> {
    if (!this.env.NEW_LISTINGS_KEY) return;
    if (!this.keyChecked) {
      const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(this.env.NEW_LISTINGS_KEY));
      const fingerprint = [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
      if (fingerprint !== this.keyFingerprint) {
        this.fatal = false; this.retryAt = 0; this.retryMs = 1000;
        this.keyFingerprint = fingerprint; this.save();
      }
      this.keyChecked = true;
    }
    if (this.fatal) return;
    if (await this.ctx.storage.getAlarm() === null) await this.ctx.storage.setAlarm(Date.now() + WATCHDOG_MS);
    if (this.socket || Date.now() < this.retryAt) return;
    if (!this.opening) {
      this.opening = this.openUpstream().finally(() => { this.opening = null; });
    }
    await this.opening;
  }

  private async openUpstream(): Promise<void> {
    this.state = 'connecting';
    this.attemptAt = Date.now();
    this.admitted = false;
    try {
      const controller = new AbortController();
      const deadline = setTimeout(() => controller.abort(), 10_000);
      let response: Response;
      try {
        response = await fetch('https://ws.newlistings.pro/v2/full', {
          headers: { Upgrade: 'websocket', Authorization: `Bearer ${this.env.NEW_LISTINGS_KEY}` },
          signal: controller.signal,
        });
      } finally { clearTimeout(deadline); }
      if (response.status !== 101 || !response.webSocket) {
        const after = response.headers.get('Retry-After') || '';
        const wait = /^\d+$/.test(after) ? Number(after) * 1000 : Math.max(0, Date.parse(after) - Date.now()) || 0;
        await response.body?.cancel();
        this.fail(`HTTP_${response.status}`, response.status < 500 && ![408, 429].includes(response.status), wait);
        return;
      }
      const socket = this.socket = response.webSocket;
      socket.accept();
      socket.addEventListener('message', event => {
        if (this.socket !== socket) return;
        try { this.receive(event.data); }
        catch { this.fail('INVALID_MESSAGE', true); }
      });
      socket.addEventListener('close', event => {
        if (this.socket !== socket) return;
        this.diagnostics.lastCloseCode = event.code;
        this.fail('CONNECTION_CLOSED', event.code === 1008);
      });
      socket.addEventListener('error', () => {
        if (this.socket === socket) this.fail('SOCKET_ERROR');
      });
    } catch {
      this.fail('SOCKET_ERROR'); // Never log provider headers or raw error messages.
    }
  }

  private fail(code: string, fatal = false, minimumWait = 0): void {
    const oldSocket = this.socket;
    this.socket = null;
    this.admitted = false;
    try { oldSocket?.close(1000, 'Reconnect'); } catch { /* already closed */ }
    this.fatal = fatal;
    this.state = fatal ? 'error' : 'reconnecting';
    this.diagnostics.lastErrorCode = code;
    this.retryAt = Date.now() + Math.max(this.retryMs, minimumWait) + Math.floor(Math.random() * 250);
    this.retryMs = Math.min(this.retryMs * 2, 30_000);
    this.save();
    this.ctx.waitUntil(fatal ? this.ctx.storage.deleteAlarm() : this.ctx.storage.setAlarm(this.retryAt));
    console.log(JSON.stringify({ message: 'Listing collector disconnected', code, fatal }));
  }

  private receive(data: string | ArrayBuffer): void {
    if (typeof data !== 'string' || data.length > MAX_MESSAGE_CHARS) { this.fail('INVALID_MESSAGE', true); return; }
    const message = JSON.parse(data) as ProviderMessage;
    this.diagnostics.lastMessageAt = Date.now();
    if (message?.type === 'success' && message.code === 'READY') {
      this.admitted = true;
      this.state = 'live';
      this.retryMs = 1000;
      this.retryAt = 0;
      this.diagnostics.connectedAt = Date.now();
      this.diagnostics.connections++;
      this.diagnostics.lastErrorCode = null;
      this.delayMs = Number.isFinite(message.subscription?.delay_ms) ? message.subscription!.delay_ms! : null;
      this.save();
      console.log(JSON.stringify({ message: 'Listing collector admitted', delayMs: this.delayMs }));
    } else if (message?.type === 'error') {
      const code = ['SERVER_UNAVAILABLE', 'CONNECTION_LIMIT_REACHED', 'AUTHENTICATION_FAILED', 'KEY_EXPIRED', 'CONNECTION_CLOSED'].includes(message.code || '') ? message.code! : 'UPSTREAM_ERROR';
      this.fail(code, !['SERVER_UNAVAILABLE', 'CONNECTION_CLOSED', 'CONNECTION_LIMIT_REACHED'].includes(code), code === 'CONNECTION_LIMIT_REACHED' ? 60_000 : 0);
    } else if (this.admitted) {
      this.diagnostics.receivedEvents++;
      this.diagnostics.lastEventAt = Date.now();
      const listing = parseListing(message);
      if (!listing) this.diagnostics.ignoredEvents++;
      else {
        const inserted = this.ctx.storage.sql.exec('INSERT OR IGNORE INTO listings(id, url, timestamp, payload) VALUES(?, ?, ?, ?) RETURNING id',
          listing.id, listing.url, listing.timestamp, JSON.stringify(listing)).toArray();
        if (inserted.length) {
          this.diagnostics.acceptedListings++;
          this.ctx.storage.sql.exec('DELETE FROM listings WHERE id IN (SELECT id FROM listings ORDER BY timestamp DESC LIMIT -1 OFFSET ?)', RETAINED_LISTINGS);
        } else this.diagnostics.duplicateListings++;
      }
      this.save();
    }
  }

  async alarm(): Promise<void> {
    if (this.fatal || !this.env.NEW_LISTINGS_KEY) return;
    await this.ctx.storage.setAlarm(Date.now() + WATCHDOG_MS);
    this.diagnostics.lastWatchdogAt = Date.now();
    // Protocol pings do not prove READY admission. Bound admission time separately.
    if (this.socket && !this.admitted && Date.now() - this.attemptAt >= 15_000) this.fail('ADMISSION_TIMEOUT');
    this.save();
    await this.ensureConnected();
  }

  async snapshot() {
    await this.ensureConnected();
    const events = this.ctx.storage.sql.exec<{ payload: string }>('SELECT payload FROM listings ORDER BY timestamp DESC LIMIT ?', RETAINED_LISTINGS)
      .toArray().map(row => JSON.parse(row.payload) as Listing);
    return { state: this.state, delayMs: this.delayMs, updatedAt: events[0]?.timestamp ?? null, events,
      storage: 'cloudflare-sqlite', historyAvailable: false, diagnostics: { ...this.diagnostics } };
  }
}
