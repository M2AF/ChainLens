# Fixed art palettes

All ChainLens art and material themes now set `fixedPalette: true`. Their picker tiles have no edit control. Profile color overrides from older versions remain stored for compatibility but are ignored for these themes. The engine applies the original palette even if an override is passed directly. Ordinary shipped color themes and custom themes remain editable and synced.

The documentation-page picker also hides art/material edit controls, ignores their saved overrides and rejects opening their editor.

Validation: `npm run check`; all193 Node tests; all14 existing theme-picker browser journeys; an additional browser test covers every art theme with legacy profile overrides and confirms that Crimson is still editable. Logs `.art-lock-{check,tests,browser,legacy}.log`. No deployment or commit.
