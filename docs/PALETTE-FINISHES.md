# Palette finishes

Colour palettes now have a separate local surface choice: **Glass** (frosted),
**Flat**, **Fine Grain** and **Soft Fade**. A separate **Two-tone surfaces** switch defaults on for raised card colours;
off uses the page colour for neutral panels. It works with Glass too. Soft Fade
uses a visible smooth diagonal highlight-to-shade gradient; borders, typography and financial semantic colours
keep their existing rules. Original full art skins suspend this preference;
switching back to a palette restores it. Unknown IDs fall back to Glass.

The user rejected literal material patterns for colour themes. Future realistic
leather/wood/metal/fabric skins should instead use fixed natural palettes and
separate art-theme entries, without recolour controls. No such new skin is bundled.

- `public/texture-engine.js`: allowlisted choices, `cl_texture.v1` local/session
  and `cl_surfaces_two_tone.v1` storage, same-origin window updates, existing account eligibility, art suspension.
- `public/index.html`: finish controls inside the existing eligible theme menu.
- `public/textures.css`: neutral finish rules and light Search hero text contrast.
- `public/themes/finishes/grain.svg`: original sparse neutral pattern, identical
  to the wallet copy. No external assets, dependencies or profile schema changes.
- `test/texture-engine.test.js`: gate, identity, storage and malformed-ID behaviour.
- `e2e/textures.spec.js`: palette/custom switching, original-art/editor preservation,
  Glass restoration and two-tone controls/persistence, reload, 360/900/1400px layouts and light-hero contrast. Uses
  the existing production precompiler to avoid runtime Babel CDN availability.

Checks: 193 Node tests; npm check; new engine syntax; both finish browser journeys
pass. Screenshots reviewed in `.local-artifacts/textures/`; `.texture-*.log`.
Local implementation only; no deployment/commit or live profile writes.

Wallet implementation details and exploratory material provenance are in
`../Magic Money Wallet/docs/PALETTE-FINISHES.md`.

## Clear Glass refinement

User rejected the first frosted pass as insufficiently translucent. Glass now
uses clear 22% tinted panels, stronger curved rim highlights, layered reflections,
22px blur and saturation, with quiet palette-coloured ambient light behind the
panels so transparency is visible. Two-tone controls the underlying tint; art
skins suspend these rules. This is a CSS approximation, not Apple native optical
refraction. No SVG displacement shader or additional dependencies. Reference:
https://developer.apple.com/videos/play/wwdc2025/219/
