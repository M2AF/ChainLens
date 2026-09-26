# ChainLens

**Search the web and explore onchain activity in one place.** ChainLens is a browser-based portfolio scanner for public addresses across 24 networks. It also includes market data, an App Hub, Magic Swap, and optional accounts with Messenger and synced preferences.

The previous README described visual design and early architecture. It remains available as a [design reference](docs/DESIGN_REFERENCE.md); this page describes the application and how to run it today. ChainLens and [Magic Money Wallet](https://github.com/M2AF/Magic-Money-Wallet) are separate products: ChainLens scans public data, while Magic Money is a self-custody signer that can connect through standard wallet providers.

## What you can do

| Area | Current behavior |
|---|---|
| Search | Search the web through the Cloudflare Search Worker and SearXNG, find App Hub entries, and recognize wallet addresses for scanning. Search is the landing page. |
| Scanner | Connect a detected wallet or enter public addresses, then view NFTs, tokens, balances, and transaction activity. Results are grouped by address family. |
| Market | Browse top coins and price charts. Market data depends on external providers. |
| Magic Swap | Discover tokens and request quotes through the Magic Money swap Worker. The connected wallet signs through its provider; cross-chain status is tracked after submission. Route availability depends on the pair, provider, wallet, and safety checks. |
| Profile | Sign in with supported wallet signatures, Google, Discord, or a previously registered passkey; link watch-only addresses and manage profile details. |
| Messenger | World Chat and friend direct messages for eligible signed-in accounts; GIF search uses GIPHY when configured. |

The scanner supports 18 EVM networks (Ethereum, Arbitrum One, Optimism, Base, Polygon, Avalanche, Blast, Gnosis, Monad, Abstract, ApeChain, Robinhood Chain, Arc, Ronin, Soneium, WorldChain, Zora, HyperEVM), plus Solana, Polkadot, Tron, Cardano, Bitcoin, and Dogecoin. The live registry is [`public/chain-catalog.js`](public/chain-catalog.js). One EVM address can scan all EVM networks; the other address families use their own formats. A connected extension is optional for scanning. ChainLens does not ask for a seed phrase or private key.

## Run locally

**Prerequisites:** Node.js 22 and npm. Install dependencies from this directory:

```bash
npm ci
npm run dev
```

Open `http://localhost:10000`. The server uses `PORT` when set. `npm run dev` starts the Express server in watch mode; `npm start` runs it without watch mode. The page uses React, Babel, Tailwind, and Chart.js from CDNs, so browser access to those resources is needed. Data-backed views also need their upstream services.

For a basic local run, no database or wallet is required. Features that rely on API keys, Supabase, OAuth, or the hosted swap/search Workers need their respective configuration and a reachable service. Keep secrets in a local `.env` or deployment environment; `.env` is ignored by Git.

### Configuration by feature

| Feature | Server configuration / setup |
|---|---|
| Core scans | Provider keys as needed: `ALCHEMY_KEY`, `HELIUS_KEY`, `BLOCKFROST_KEY`, `MORALIS_KEY`, `SUBSCAN_API_KEY`, and the other provider variables read in `backend-server.js`. Coverage varies by chain and key availability. |
| Accounts | `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, and a unique `JWT_SECRET` for deployed instances. Set `FRONTEND_URL` to the public origin. |
| Google / Discord login | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`; configure callback URLs with `GOOGLE_CALLBACK_URL` and `DISCORD_CALLBACK_URL` if the defaults do not match. |
| Passkeys | Apply `sql/cl_passkeys.sql`; `WEBAUTHN_RP_ID` and `WEBAUTHN_ORIGINS` can set the relying party and allowed origins. Passkeys are added to an existing account before they can be used to sign in. |
| Messenger and themes | Apply `sql/cl_chat.sql` and `sql/cl_themes.sql`. `GIPHY_API_KEY` enables chat GIF search. Messenger requires a verified wallet and a linked Google or Discord account. |
| Synced spam assets | Apply `sql/cl_asset_filters.sql`. Local filters work without sync; signed-in users can merge them across ChainLens and Magic Money. Earlier hidden assets become spam. |
| Search | `SEARCH_WORKER_BASE_URL` overrides the hosted Search Worker used by the compatibility proxy. See [Search deployment](SEARCH_DEPLOYMENT.md). |
| Magic Swap | `MM_SWAP_WORKER_URL` overrides the hosted swap Worker; configure `MM_SWAP_CLIENT_TOKEN` for its server-to-Worker client tag (not authentication). `CHAINLENS_JUPITER_FEE=off` disables the Jupiter fee in DEX quotes. Exchange Swap uses the same Worker URL and its existing server-side `SIMPLESWAP_API_KEY` and `CHANGENOW_API_KEY` secrets; no provider key belongs in ChainLens or the browser. |

The SQL files are in [`sql/`](sql/). Apply only the features you intend to run; Supabase is optional for read-only scanning. Do not use the development JWT fallback on a public deployment.

## How the pieces fit

The Express server in [`backend-server.js`](backend-server.js) serves the single-page app and API routes. The browser UI lives mainly in [`public/index.html`](public/index.html), with dedicated Search and swap modules in `public/`. [`public/chain-catalog.js`](public/chain-catalog.js) is shared by browser and server for network and address-family rules. `non-evm-scanner.js` handles non-EVM scanning, while `search-service.js` and [`swap-service.js`](swap-service.js) connect to the respective Workers.

Magic Swap uses [`public/swap-core.js`](public/swap-core.js), generated from the wallet's shared swap core, to check candidate routes on the server and again in the browser before a signature. Keep that bundle in sync with the wallet; `npm test` checks its recorded bundle hash and swap behavior. A quote or listed network is not a guarantee that a particular swap can execute. Connected-wallet support and provider responses decide what is offered.

Account sessions use server-verified wallet signatures or OAuth, then a JWT for protected profile routes. Manual addresses are watch-only; Bitcoin, Polkadot, Tron, and Dogecoin extension addresses are also linked as watch-only. Passkey registration requires an existing authenticated account. Spam choices render from local storage and can sync with the profile when signed in. Magic Money's custom themes are created in the wallet and read by eligible ChainLens accounts; ChainLens does not edit them.

## Development checks

```bash
npm run check       # syntax checks for the server and browser modules
npm test            # Node tests, including scanner, auth, search, themes, and swaps
npm run test:e2e    # Playwright browser flows
```

The Search Worker has its own package and checks in [`cloudflare-search-worker/`](cloudflare-search-worker/). Its deployment steps are in [SEARCH_DEPLOYMENT.md](SEARCH_DEPLOYMENT.md). The public site also serves [`/docs`](public/docs.html).

## Design and privacy notes

- [Original design reference](docs/DESIGN_REFERENCE.md) records the visual system and earlier implementation decisions. Use this README and the current code for feature/setup facts.
- [Privacy policy](PRIVACY_POLICY.md) describes data handling.
- Portfolio scanning is based on public addresses and third-party indexers. It may show stale, incomplete, or spam assets; use Mark as spam to remove an asset from your view.
