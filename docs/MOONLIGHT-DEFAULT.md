# ChainLens default appearance

Light and Dark are removed from the main/Docs selection UI. New installs and stored `light`/`dark` IDs resolve to `moonlight`; missing finishes use Soft Fade (`fade`), with two-tone enabled unless explicitly saved off. Stored valid colour/art/custom selections and explicit surface preferences are retained. Retired Sappy colour IDs still migrate to Mint & Money.

Moonlight is available to guests and is the fallback for deleted/unavailable themes, lost profile eligibility and revoked art ownership. Other themes still require the existing eligible profile; NFT gates remain unchanged. The signed-out Light/Dark switch becomes a Moonlight badge. Eligible users keep the full colour/custom and default-collapsed Art/Material picker, without Mode rows. `darkMode` remains an internal tone flag for rendering light-colour palettes.

`texture-engine.js` defaults to fade and the main/Docs renderers enable finishes for the Moonlight baseline, including guests. Docs now loads the same finish engine/styles. Low-level `applyMode` remains for compatibility; UI/fallback call paths use the Moonlight palette. No wallet defaults or database records changed.

Validation: syntax checks,204Node tests,six JSX precompiles,10 main/Docs browser cases plus final2 ownership/fallback cases and2 guest finish/material gate cases pass. Covers new guest default, legacy Light/Dark migration, choice removal, exact Moonlight background, fade/two-tone, reload, saved Grape/Glass/two-tone-off preservation, eligible counts, colour selection, lost access, Docs and full Sappy animation/ownership lifecycle. Logs `.moonlight-default-*.log`; screenshot `.local-artifacts/moonlight-default/guest.png`. Local only, no commit or deployment.
