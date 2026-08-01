# ChainLens Search deployment

ChainLens Search uses one separate SearXNG web service on Render. The existing ChainLens service calls it through the server-side `/api/search/web` endpoint, so the SearXNG URL and search implementation are not built into the browser UI.

## 1. Deploy SearXNG on Render

1. Push this repository to GitHub.
2. In the Render dashboard, choose **New > Blueprint**.
3. Connect the same GitHub repository used by ChainLens.
4. Render will read `render.yaml` and propose one new service named `chainlens-search-searxng`.
5. Create the service and wait for its first deploy to finish.
6. Open the new service and copy its public URL. It will look similar to `https://chainlens-search-searxng.onrender.com`, but use the exact URL Render gives you.

The Blueprint generates `SEARXNG_SECRET` automatically. Do not reuse or expose that value.

## 2. Connect the existing ChainLens service

1. Open the existing ChainLens web service in Render.
2. Go to **Environment**.
3. Add this environment variable:

   ```text
   SEARXNG_BASE_URL=https://the-exact-url-from-step-1.onrender.com
   ```

4. Save the change and redeploy the existing ChainLens service.

No change is required to `chainlensnft.info`. It remains attached to the existing ChainLens service.

## 3. Verify

Open these URLs after both deploys finish:

- `https://chainlensnft.info/api/search/status` should return `{"provider":"searxng","configured":true}`.
- `https://chainlensnft.info` should open on the Search tab.
- Search for a normal web query and confirm web results appear.
- Search for an App Hub app such as `Uniswap` and confirm the app match appears immediately.
- Paste a wallet address and confirm **Scan in ChainLens** opens the Scanner with that value populated.

## Free-tier behavior

The SearXNG service can sleep after inactivity. The first search after it sleeps can take up to about a minute; the Search page explains this while it waits. App Hub matches and wallet recognition happen locally and continue to appear immediately.

The ChainLens backend limits each visitor to 30 proxied searches per minute and caches successful searches briefly to reduce load. The public SearXNG service itself is still reachable at its Render URL, which is acceptable for this free MVP but should be protected or moved behind the existing Magic Money Cloudflare Worker if usage grows.

## Future Cloudflare migration

The frontend only calls `/api/search/web`. To move search to the Magic Money Cloudflare Worker later, update the server-side provider implementation or its configured upstream; the Search page and its URLs do not need to change.
