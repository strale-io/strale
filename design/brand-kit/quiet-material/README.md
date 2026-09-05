# Quiet Material: atmosphere and surface register

This is the **current consolidation proposal, revision 0.2**, for the existing Quiet Material v0.7 direction. It incorporates founder feedback on excessive nested-card spacing and same-tone reading panels. It is not a replacement identity or a production adoption. Start with the specimen catalogue under `output/pdf/`, then use the generated [register](REGISTER.md) for implementation detail. Revision 0.1 remains recoverable at commit `2972015dedfeb8bcd30369e0b0b4259bdc62f678`; it is historical, not a competing current recipe.

## Source hierarchy

1. `design/tokens/active.json` remains the production authority. Positioning and claims retain their existing decision/register authority.
2. [registry.json](registry.json) owns this candidate's asset identities, roles, pairings, crop instructions, source confidence, restrictions and reconciliation record.
3. [quiet-material-catalogue.json](../../tokens/candidates/quiet-material-catalogue.json) contains the exact retained CSS values and separately named document geometry. Its geometry is not website layout. It supersedes no previous token candidate.
4. [REGISTER.md](REGISTER.md) and the PDF are generated views. Edit the register/tokens, rebuild, inspect, then verify; do not hand-edit a generated view.
5. [verification.json](verification.json) binds the PDF to the register, tokens and builder inputs. It records the measured text/background specimens, with explicit limits.

The preserved source package remains immutable and recoverable from the release URL and archive digest in `registry.json`. The builder takes an extracted package root and verifies every referenced source file against its recorded SHA-256. Large image masters are not duplicated into this repository. The PDF embeds them; the local HTML intermediate needs the extracted originals. Fonts and their OFL licences are packaged here with digests. No source image is regenerated, retouched or recoloured.

## What to review

- Pages 2–3: whether the light and dark families feel related and their distinct roles are sensible.
- Pages 4–7: retained gradients, then revised compositions. Dark gradients frame light paper with a fixed narrow inset. Frost and Mint have direct dark text and no inner card.
- Pages 8–21: all fourteen images at landscape, square and narrow crops. Light reading panels sit low with a fixed inset, preserving atmosphere above. One-row compact cards demonstrate reducing content before type size. Amber remains image-only.
- Page 22: the retained lockup and the legacy favicon conflict. This proposes identity/symbol separation, not a new logo.
- Pages 23–24: composition rules and remaining work.

The first version's thick centred frames and dark-on-dark panels were rejected in founder review. Revision 0.2 uses a 16px gradient-frame inset, 20px reading-panel padding and 12px inner corners; these are document specimen tokens, not a universal responsive component specification. Larger raster atmospheres use a 20px inset with a low-set panel. Solid off-white paper replaces the earlier translucent/gradient reading surfaces. No original image or gradient is changed. The narrow hero crop still loses its desktop quiet-left area, and the complete closing composition remains open. Direct text on raster atmospheres remains unqualified; the direct Frost/Mint examples have their own measured evidence.

## Rebuild and verify

From the repository root:

```powershell
node design/brand-kit/quiet-material/build.mjs --source <extracted-package-root> --playwright <playwright/index.mjs>
python design/brand-kit/quiet-material/verify.py
npm run design:check
npm run design:test
```

The optional `--playwright` argument locates an existing Playwright package; otherwise the builder uses a locally resolvable installation. It launches installed Chrome headlessly with a fresh context, allows only local/data inputs, closes the browser, and writes no product data. The PDF verifier requires PyMuPDF and Pillow. `--register-only` regenerates just the human register. `--check --source <root>` adds extracted-file integrity checks to ordinary CI validation.

CI's existing `design:check` checks coverage, token references, original identity/digests, generated-register drift and PDF/evidence/input hashes. `design:test` includes negative checks for missing assets, changed sources, invented Amber material, silent illustration promotion, same-tone dark panels and nested Frost/Mint cards. Rendering also checks equal gradient-frame insets and the absence of an inner gradient. CI does not fetch a release or regenerate visual evidence.

The contrast method samples every background pixel beneath each hidden specimen text element, on the actual Chromium composition, and requires 4.5:1 even for headings. It is a conservative check of those fixed specimens, not certification of arbitrary crops, full responsive pages, dark mode or motion. PDF text bounds and visual page review are separate checks. Verification accepts only the raw PDF bound to that render, then checks that lossless optimisation preserves every page's text, geometry and rendered pixels. Rebuild before running verification again; a prior verification record cannot authorise a different PDF. CI enforces the complete evidence shape, per-page sample coverage and agreement between measurements, failure lists and status.

## Open work

Current records cover all fourteen atmospheric assets, but eleven original creation/rights histories remain unknown. Missing direction-reference and capability-illustration sources are explicitly unavailable. The three editorial references remain excluded from implementation. Identity exports at small sizes, complete typography roles/fallbacks, component states, motion and channel templates still need their own specimens.

Continue from [SYSTEM-COMPLETION.md](../../../docs/programs/brand-website/SYSTEM-COMPLETION.md). Keep the earlier audit and rejected studies as history; do not reactivate them as competing current directions.
