# ChainLens Search deployment

ChainLens Search uses a Cloudflare Worker in front of the SearXNG web service on Render. The Search page calls the Worker directly, and the legacy server-side `/api/search/web` endpoint proxies to the same Worker for compatibility.

## 1. Deploy SearXNG on Render

1. Push this repository to GitHub.
2. In the Render dashboard, choose **New > Blueprint**.
3. Connect the same GitHub repository used by ChainLens.
4. Render will read `render.yaml` and propose one new service named `chainlens-search-searxng`.
5. Create the service and wait for its first deploy to finish.
6. Open the new service and copy its public URL. It will look similar to `https://chainlens-search-searxng.onrender.com`, but use the exact URL Render gives you.

The Blueprint generates `SEARXNG_SECRET` automatically. Do not reuse or expose that value.

## 2. Deploy the Cloudflare search Worker

The Worker project lives in `cloudflare-search-worker/`.

```bash
cd cloudflare-search-worker
npm install
npm test
npm run check
npm run deploy
```

The deployed Worker is `https://chainlens-search.guildfordking.workers.dev`. Its 10-minute Cron Trigger keeps the SearXNG Render service awake independently of the ChainLens Render process.

The Worker only accepts browser searches from the allowed ChainLens origins configured in `wrangler.jsonc`.

## 3. Verify

Open these URLs after both deploys finish:

- `https://chainlens-search.guildfordking.workers.dev/api/search/status` should return `{"provider":"searxng-cloudflare-worker","configured":true}`.
- `https://chainlensnft.info/api/search/status` should return the same provider through the compatibility endpoint after ChainLens deploys.
- `https://chainlensnft.info` should open on the Search tab.
- Search for a normal web query and confirm web results appear.
- Search for an App Hub app such as `Uniswap` and confirm the app match appears immediately.
- Paste a wallet address and confirm **Scan in ChainLens** opens the Scanner with that value populated.

## Free-tier behavior

The Worker itself does not sleep. Its Cron Trigger requests SearXNG every 10 minutes, which is shorter than Render's inactivity window. App Hub matches and wallet recognition remain local and continue to appear immediately.

The public SearXNG service itself remains reachable at its Render URL. The Worker restricts browser origins and briefly caches upstream search requests, but it is not a substitute for a private SearXNG origin if usage grows.
