# Mint & Money default colour preset

Mint & Money (`mint-money`) replaces the default Sappy Seals colour theme, using the exact live theme from ChainLens ID `ec18dcf5-3271-46fd-8029-41e5b2f39eed`: background `#0c1e19`, accent `#30ffae`, text `#e8f4ff`. The source custom record is `custom-7aovlrf0py`; it was read through the connected Supabase project, with no database writes.

The main and docs pickers migrate saved `cl_theme=sappy-seals` to `mint-money`. The retired palette is absent from shipped definitions; default count remains24. Mint remains recolourable and uses the existing colour texture rules. Sappy Seals's app/project identity remains in the app hub/search; a later art skin needs its own ID to avoid colliding with the retired palette migration.

Full provenance and wallet implementation notes: sibling `Magic Money Wallet/docs/MINT-MONEY-PRESET.md`. Local checks: `.mint-money-*.log`; browser screenshot `.local-artifacts/mint-money/chainlens.png`. Deployment remains pending; no commit or deployment was performed.
