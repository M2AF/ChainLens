# Linked wallet profile layout

The owner Profile page uses a compact wallet-style list with small chain icons,
thin row dividers, names and primary/watch-only status. Full addresses wrap
instead of being truncated. Copy writes the exact address and confirms success;
clipboard failures use the existing profile error display. Rename and Remove
remain visible in a vertical column. Set Primary is beside the status label.
Existing wallet mutation routes and public-wallet visibility are unchanged.

Implementation: `public/index.html`, scoped `public/profile-portfolio.css`.
Regression: `e2e/profile-linked-wallets.spec.js` checks all eight fixture
addresses, exact clipboard contents, stacked controls, rename/save/cancel,
primary and remove, and no horizontal overflow at 1920/1024/768/390px.

Local validation on user base `5cbf5e8`: syntax checks, all 11 JSX assets
precompiled, 228 unit tests, the focused wallet journey and eight existing
public-profile/NFT-avatar browser cases pass. Final screenshots reviewed and
saved to `.local-artifacts/linked-wallets/`. Logs:
`.local-artifacts/linked-wallet-{final-unit,final-e2e,regression}.log`.
No backend/schema changes, Magic Money source changes, commit or deployment.
