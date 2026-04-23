# ChainLens — Design Document

> **Multi-Chain Portfolio Scanner & Explorer**
> A single-page web application for scanning NFTs, tokens, and transactions across 18+ blockchains.

---

## 1. Overview

ChainLens lets users connect wallets (EVM, Solana, Cardano) or paste any address to instantly view their full cross-chain portfolio — NFTs, fungible tokens, transaction history — alongside live market data and integrated swaps.

The design language is bold, minimal, and web3-native: oversized rounded corners, glassmorphism cards, chain-specific gradient accents, and a clean dark/light dual theme.

---

## 2. Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18 (UMD CDN), Babel standalone |
| Styling | Tailwind CSS (CDN) + custom CSS |
| Charts | Chart.js 4.4 |
| Backend | Node.js + Express |
| Database | Supabase (optional — profile/auth features) |
| Auth | JWT + wallet-signed nonces |
| Hosting | Static `public/` served by Express on port 10000 |

---

## 3. Typography

| Role | Font | Weights |
|---|---|---|
| Body / UI | Space Grotesk | 300, 400, 500, 700 |
| Headings / Wordmarks | Syne | 700, 800 |

**Usage conventions:**
- `font-heading` (Syne) is used for asset names, section titles, large numeric displays, and the nav logo.
- `font-sans` (Space Grotesk) is used for all body copy, labels, metadata, and UI controls.
- Labels use `uppercase tracking-widest text-[9px]–text-xs font-black` for a consistent badge/pill style.

---

## 4. Color System

### Brand Gradients

```css
/* Solana / primary accent */
.bg-solana-gradient       { background: linear-gradient(45deg, #9945FF, #14F195); }
.bg-solana-gradient-soft  { background: linear-gradient(45deg, rgba(153,69,255,0.85), rgba(20,241,149,0.85)); }
```

### Chain Pill Colors

| Chain | Gradient / Color |
|---|---|
| EVM (Ethereum, etc.) | `linear-gradient(135deg, #627EEA, #3c3c3d)` |
| Solana | `linear-gradient(135deg, #9945FF, #14F195)` |
| Cardano | `linear-gradient(135deg, #0033AD, #00BAFF)` |

Chain pills appear as small `uppercase tracking-widest` badge overlays on asset cards, colored by chain.

### UI Palette (Tailwind)

| Role | Dark Mode | Light Mode |
|---|---|---|
| Page background | `slate-950` / `slate-900` | `white` / `slate-50` |
| Card surface | `slate-900` / `slate-800` | `white` |
| Card border | `slate-800` / `slate-700` | `slate-100` / `slate-200` |
| Primary accent | `emerald-500` / `emerald-400` | `emerald-500` |
| Secondary accent | `blue-600` / `blue-400` | `blue-600` |
| Destructive / spam | `red-500` / `red-600` | same |
| Muted text | `slate-500` / `slate-600` | `slate-400` |
| Body text | `white` | `slate-900` |

### Semantic Color Usage

- **Emerald** — positive actions (connect wallet, confirm, add, value gain).
- **Blue** — navigation, asset detail actions, scanning states.
- **Orange** — detected browser wallet buttons (hover state).
- **Red** — spam marking, destructive actions, close buttons (hover).
- **Purple → Green gradient** — Solana branding, primary CTAs.

---

## 5. Spacing & Shape

ChainLens uses an intentionally generous border-radius scale to feel modern and approachable:

| Element | Border Radius |
|---|---|
| Asset cards | `rounded-[2.5rem]` (40px) |
| Modals / overlays | `rounded-[3.5rem]` (56px) |
| Wallet picker rows | `rounded-2xl` (16px) |
| Swap column container | `rounded-[2rem]` (32px) |
| Pills / badges | `rounded-full` |
| Icon buttons | `rounded-full` or `rounded-xl` |
| Input fields | `rounded-2xl` |

Padding tends to be generous: cards use `p-5` to `p-12`, modals `p-6 md:p-12`.

---

## 6. Component Patterns

### Glass Card

```css
.glass-card {
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
}
```

Used on overlapping modals and stat panels to create depth without full opacity.

### Asset Card (Grid vs List)

- **Grid view** — `aspect-square` image, centered text, `hover:-translate-y-2 hover:shadow-xl` lift effect on light mode.
- **List view** — `flex` row, 64×64 thumbnail, name + symbol left, balance/value right.
- Both show chain pill badge, hide/spam action buttons on hover (opacity 0 → 100 transition).

### Chain Pills

Inline badge overlays: `absolute top-4 left-4`, `text-[9px] font-bold uppercase tracking-widest backdrop-blur-md border border-white/20`.

### Toggle Switch

Custom CSS switch (48×24px) with springy cubic-bezier dot transition (`cubic-bezier(0.68, -0.55, 0.265, 1.55)`). Used for dark mode and view toggles.

### Modals

Full-screen backdrop (`bg-slate-950/95 backdrop-blur-xl`) with `fadeIn` animation. Content panel uses `.modal-enter`. Close button uses `rounded-full bg-slate-800 hover:bg-red-500` pattern.

### Wallet Picker

Sheet-style modal with sections:
1. **Featured** — Abstract Global Wallet (paste-address flow).
2. **Detected** — Auto-discovered EIP-6963 browser extensions.

Rows use `border` + `hover:border-{color}` + `hover:bg-{color}/5` for a subtle highlight without background flash.

---

## 7. Animations

| Class / Keyframe | Usage |
|---|---|
| `slideUp` (0.4s ease-out, staggered `0s / 0.08s / 0.16s / 0.24s`) | Profile page section entrance |
| `fadeIn` (0.3s ease-out) | Modal entrance |
| `pulse-slow` (3s, custom) | Scanning / loading indicators |
| `hover:-translate-y-2` | Social link buttons, light-mode cards |
| `hover:translateY(-1px)` | Wallet cards |
| `group-hover:scale-110` | Asset card image zoom (700ms) |
| `transition-all 0.4s cubic-bezier(0.4,0,0.2,1)` | Switch background |
| `transition-all 0.4s cubic-bezier(0.68,-0.55,0.265,1.55)` | Switch dot (spring) |

---

## 8. Layout & Navigation

The app is a single-page React app rooted at `#root`. Navigation is a horizontally scrollable tab bar (`.scrollbar-none` on mobile) with four primary tabs:

| Tab | Icon | Content |
|---|---|---|
| Portfolio | 🏠 | NFT/token grid for connected wallets |
| Market | 📊 | Top 100 coins + price charts |
| Swap | 🔄 | Embedded DEX iframes |
| Profile | 👤 | Auth, linked wallets, settings |

Max content width: `max-w-6xl mx-auto` for the asset grid; wider for market/profile panels.

### Responsive Behavior

- Asset grid: `grid-cols-2 md:grid-cols-4 lg:grid-cols-5`
- Mobile: `overflow-x: hidden` on body; tab nav scrollable
- Swap column: fixed `650px` height, `min-height: 600px`, scales with container width

---

## 9. Theming

Dark/light mode is controlled by a `darkMode` boolean in React state (persisted to `localStorage`). All components pass `darkMode` as a prop and use conditional Tailwind classes inline — no CSS variables or `dark:` prefix variant.

**Toggle location:** Top-right of the navbar, custom animated switch.

---

## 10. Supported Blockchains

| Category | Chains |
|---|---|
| EVM | Ethereum, Polygon, Base, Avalanche, Optimism, Arbitrum, Blast, Zora, ApeChain, Soneium, Ronin, World Chain, Gnosis, HyperEVM, Abstract, Monad |
| Solana | Solana |
| Cardano | Cardano |

---

## 11. External APIs & Services

| Service | Purpose |
|---|---|
| **Alchemy** | EVM NFTs, tokens, transaction history |
| **Helius** | Solana NFTs, tokens, transactions |
| **Blockfrost** | Cardano balances and transactions |
| **Moralis** | Monad transaction history |
| **CoinGecko** | Native token prices (90s cache) |
| **DexScreener** | Token pair prices |
| **Zerion** | Supplemental EVM token data |
| **Unstoppable Domains** | ENS / UD domain resolution |
| **Jupiter API** | Solana swap widget |
| **Uniswap API** | EVM swap widget |
| **DexHunter** | Cardano swap widget |
| **Supabase** | User profiles, linked wallets, auth records |

---

## 12. Authentication Flow

1. User initiates connection (EVM extension, Solana, Cardano, Google, Discord, or paste-address).
2. Frontend requests a nonce from `/api/auth/nonce`.
3. User signs the message `ChainLens login\nAddress: {addr}\nNonce: {nonce}` in their wallet.
4. Backend verifies the signature (ethers.js for EVM, tweetnacl for Solana, CBOR for Cardano) and returns a JWT.
5. JWT stored in `localStorage` as `cl_token`; passed as `Authorization: Bearer` header on all protected routes.

**Watch-only wallets:** EVM addresses can be added without signing (paste flow). Abstract Global Wallet addresses are supported this way since AGW smart accounts require no EOA signing.

**Social OAuth:** Google and Discord OAuth redirect flows, backed by `cl_linked_accounts` in Supabase. Accounts are merged by `provider + provider_id`.

---

## 13. Data Storage

### Supabase Tables

| Table | Purpose |
|---|---|
| `cl_users` | User records (provider, display_name, avatar_url) |
| `cl_wallets` | Linked wallet addresses per user (chain, address, is_primary) |
| `cl_linked_accounts` | Social OAuth accounts linked to a user |

### localStorage (client-side)

| Key | Content |
|---|---|
| `cl_token` | JWT auth token |
| `hiddenAssets` | JSON array of asset IDs hidden by user |
| `spamAssets` | JSON array of asset IDs marked as spam |

---

## 14. Branding Assets

| File | Usage |
|---|---|
| `ChainLens_dark_.png` | Full wordmark — for dark backgrounds |
| `ChainLens_light_.png` | Full wordmark — for light backgrounds |
| `chainlens_icon_dark.png` | Square icon — dark variant (favicon, app icon) |
| `chainlens_icon_light.png` | Square icon — light variant |

The icon is a chain link combined with a magnifying glass, rendered in a bold, high-contrast monochrome style.

---

## 15. Scrollbar Styling

Custom dark scrollbars applied via `.dark-scroll`:

```css
.dark-scroll::-webkit-scrollbar       { width: 8px; }
.dark-scroll::-webkit-scrollbar-track { background: #0f172a; }
.dark-scroll::-webkit-scrollbar-thumb { background: #334155; border-radius: 10px; }
```

Tab navigation uses `.scrollbar-none` to hide the scrollbar on mobile.

---

## 16. Key UX Decisions

- **No page reloads** — all state managed in React; wallet connections and scans update the UI inline.
- **Abort on re-scan** — an `AbortController` ref cancels in-flight fetch requests when the user triggers a new scan, preventing stale data races.
- **Asset deduplication** — NFTs and tokens are keyed by `{chain}-{address/id}` to prevent duplicates across multi-wallet loads.
- **Spam/hide management** — Users can hide or flag spam assets per-session (localStorage); a management modal lets them review and restore hidden items.
- **Image fallback** — All asset images use an `onError` handler that falls back to an inline SVG placeholder generated from the asset symbol and chain color.
- **Price display** — Token cards show balance, native-denominated value, and USD value. USD values are computed from CoinGecko native prices fetched at scan time.