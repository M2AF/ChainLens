# ChainLens Design Documentation

## 1. Overview
ChainLens is a multi-chain blockchain explorer and asset scanner designed to provide a unified, "sign-in free" interface for viewing wallet contents across EVM, Solana, and Cardano networks. It prioritizes a "techno-professional" aesthetic, high performance, and deep technical transparency.

## 2. Visual Identity & UI/UX
The design language is centered around a "Future-Proof Minimalist" theme, favoring high-contrast dark modes with vibrant neon accents.

### 2.1 Color Palette
- **Primary Background:** `#020617` (Slate-950)
- **Card/Surface:** `#0f172a` (Slate-900) with 40% opacity and 16px backdrop blur.
- **Accent 1 (Solana):** Linear gradient `#9945FF` to `#14F195`.
- **Accent 2 (EVM/Cyan):** `#06b6d4`.
- **Accent 3 (Cardano):** `#0033AD`.
- **Status (Success):** `#10b981` (Emerald-500).

### 2.2 Typography
- **Headings:** *Syne* (Bold/ExtraBold) – Used for brand identity and major section headers to provide a geometric, modern feel.
- **Body/Interface:** *Space Grotesk* – Chosen for its readability and "tech" character, used for wallet addresses, token balances, and navigation.

### 2.3 UI Components
- **Glass-morphism:** All primary cards (`glass-card`) utilize backdrop-filter blur and subtle borders (`border-white/10`) to create depth without clutter.
- **Animated Scanners:** The logo and primary "SCAN" buttons utilize a `pulse-slow` animation during active API fetches to provide immediate visual feedback.

## 3. Technical Architecture

### 3.1 Frontend (React + Tailwind)
- **State Management:** Utilizes React Hooks (`useState`, `useMemo`) for real-time filtering of assets without re-renders.
- **Asset Persistence:** `AssetGrid` is memoized to ensure that <img> tags remain mounted when switching between NFT and Token tabs, preventing redundant network requests for images.
- **Data Visualization:** Integrated with **Chart.js** to provide real-time price action with 24h/7d/1m/1y/All timeframes.

### 3.2 Backend (Node.js/Express)
- **Multi-Chain Integration:**
    - **Alchemy:** Primary provider for EVM chain (Ethereum, Base, Polygon, etc.) NFT and Token data.
    - **Moralis:** Utilized for Monad (0x8f) data and fallback ERC20 indexing.
    - **Helius:** Powering Solana asset and transaction history.
    - **Blockfrost:** Core provider for Cardano (ADA) ledger data.
- **Price Discovery:** A multi-layered fallback system:
    1. CoinGecko API (Primary)
    2. DexScreener (Real-time DeFi prices)
    3. DefiLlama (Secondary fallback)
- **Address Resolution:** Supports ENS, Unstoppable Domains, Solana SNS, and ADA Handles ($handle).

## 4. Key UX Patterns
- **Watch-Only Mode:** Users can paste any address or domain for a quick scan without connecting a wallet.
- **Unified Portfolio Value:** Real-time calculation of total balance across all chains, converted to USD using live market rates.
- **Spam Filtering:** A built-in keyword filter (`voucher`, `airdrop`, `lucky`, etc.) to automatically hide known malicious or low-value NFTs from the primary gallery.

## 5. Development Standards
- **Dark Mode First:** All components are designed for Slate-950 environments first, with a functional Light Mode toggle.
- **Full Code Preservation:** As per project standards, all code updates must preserve the integrity of the full file structure (avoiding abbreviated snippets) to ensure feature parity across versions.