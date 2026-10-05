# Market Watch New Listings

Market Watch has Market and New Listings modes, matching the Magic Swap mode buttons. Market retains prices and charts. New Listings displays exchange listing announcements, searchable by ticker, exchange, or title, newest first. It is not a feed of all newly minted tokens.

The switcher uses the provider's official 192px PNG favicon, downloaded from https://newlistings.pro/favicon-nlf.png into `public/new-listings-favicon.png`, displayed at 18px and served locally.

`new-listings-service.js` maintains one authenticated, receive-only WebSocket per backend process. The key is read from server environment `NEW_LISTINGS_KEY`; never place it in public files. Local `.env` is ignored. Production must configure that variable and restart/redeploy the backend separately. No deployment is included in this change.

The browser polls `/api/market/new-listings` every five seconds only while New Listings is open. Responses contain sanitized recent announcements and connection status, never credentials or account identity. Up to 200 events are held in memory; they reset on server restart. The free plan has no historical backfill, so reconnects can leave gaps. The provider delay comes from READY; it does not include polling or transit time.

READY confirms admission; socket open alone does not. Transient failures retry with exponential backoff and jitter, respecting Retry-After. Auth, expiry, or connection-limit failures stop retries until the operator resolves them and restarts. Protocol pings are handled by `ws`, without application heartbeat messages. HTTPS source links only, React text rendering, bounded fields and payloads.

Keep production to one ingest process or at most the key's two permitted egress IPs. Multiple replicas must use a shared ingest service before scaling past this limit. The existing Node backend avoids a new Worker/relay infrastructure dependency; `ws` is the only added runtime dependency because authentication requires a bearer header and browser WebSocket cannot set it.

Provider references: https://newlistings.pro/docs/quickstart, https://newlistings.pro/docs/v2/full, https://newlistings.pro/docs/v2/connection-lifecycle.

Validation: `npm run check`, `npm test`, `npx playwright test e2e/new-listings.spec.js e2e/market-candles.spec.js`. UI fixtures test presentation separately from the live authenticated admission probe. Screenshots are under `test-results/new-listings-{desktop,mobile}.png`.
