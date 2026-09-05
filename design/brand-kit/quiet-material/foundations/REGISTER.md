# Identity and typography companion

Candidate 0.1. Complements the accepted atmosphere/surface catalogue 0.2; does not adopt production tokens.

## Type roles

| Role | Family | Wide / narrow | Weight | Leading | Use |
|---|---|---|---|---|---|
| display | sans | 52 / 36 px | 400 | 1.08 | One short marketing message |
| section | sans | 40 / 30 px | 400 | 1.15 | A new chapter or benefit |
| heading | sans | 28 / 24 px | 500 | 1.2 | Subsection or compact story |
| lead | sans | 20 / 18 px | 400 | 1.5 | Optional supporting thought |
| body | sans | 18 / 16 px | 400 | 1.6 | Sustained reading |
| ui | sans | 16 / 16 px | 500 | 1.4 | Navigation and actions |
| compact | sans | 15 / 15 px | 400 | 1.5 | Supporting rows and descriptions |
| caption | sans | 14 / 14 px | 400 | 1.5 | Secondary context, never essential instructions |
| label | mono | 13 / 13 px | 400 | 1.5 | Short optional category or identifier |
| code | mono | 14 / 14 px | 400 | 1.6 | Exact code and identifiers |
| number | sans | 16 / 16 px | 500 | 1.5 | Aligned values; tabular numerals |
| document | sans | 11 / 11 pt | 400 | 1.55 | A4 body text; size is in points |

## Rules

### identity

Use the existing outlined lockup wherever the name needs to be read. The isolated S is for already-branded compact contexts, favicon and avatar.

### clearspace

Keep a quarter of the S height clear on all sides. Measure from visible artwork. Do not squeeze the wordmark, change its paths or use a decorative symbol as the identity.

### small

Use the lockup at 120 CSS px wide or larger. Use the S at 24 CSS px or larger in ordinary UI. The 16 px favicon is a separately inspected small-context exception, not a general minimum.

### inverse

Use off-white identity on a plain dark field. Use ink identity on a plain light field. Keep gradients and folds away from the mark; no outline, glow or recolouring.

### weights

Instrument Sans uses real weights 400, 500 and 600 at normal width. IBM Plex Mono uses the supplied regular 400 only. Disable synthetic bold and italic; italics are not supplied in this batch.

### density

Start with a title. Add supporting copy only when it adds meaning. Give long reading a comfortable measure; remove content before shrinking type. A label is optional, never a mandatory subtitle.

### numerals

Use tabular Instrument Sans numerals for aligned values. Use IBM Plex Mono for code and exact identifiers. Long identifiers wrap where permitted; code blocks may scroll with a clear boundary.

### direct-dark

Candidate: direct light text is checked only in the fixed Cobalt and Dusk specimens shown here, with one title, one short paragraph and one light primary action. Remeasure contrast when the gradient, overlay, text position or layout changes. Detailed results keep a reading panel. Direct text on atmospheric images requires separate crop evidence.

### fallback

Use the bundled fonts for web, social and embedded PDF. Email deliberately uses Arial/Helvetica and a system monospace stack. Browser fallback specimens do not establish email-client compatibility; qualify real clients before sending.

### coverage

English and selected Nordic/Western European glyph fixtures are checked against the exact fonts. This is not full language coverage. Instrument Sans lacks the checkmark glyph; use a separate accessible icon, never silent font fallback as an icon system.

## Channel scope

- **web:** Narrow/wide text reflow; controls and interaction states are next.
- **social:** Square and landscape exports; not platform-specific safe-area qualification.
- **email:** Browser rendering at wide and narrow widths; real inbox testing remains open.
- **pdf:** Two A4 pages with a cover and interior hierarchy/table proof; font resources and screen rendering checked. Long-document pagination and physical print proof remain open.

## Provenance

The outlined master is preserved at `masters/strale-lockup.svg` (SHA-256 `4a6e91cb81830f2960bb526cf8b90a6e93ec1e837829d4c25c70474dd61cb809`). Original creation and rights history not recovered; preserved source, no new rights claim.

Fonts are the existing packaged files and OFL licences. Only container/export geometry and solid colour variants are derived here. No font glyphs or logo paths are redrawn. `exports/manifest.json` binds each output to these inputs.
