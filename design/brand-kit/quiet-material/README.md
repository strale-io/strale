# Quiet Material: atmosphere and surface register

This is the **current consolidation proposal** for the existing Quiet Material v0.7 direction. It is not a replacement identity or a production adoption. Start with the specimen catalogue under `output/pdf/`, then use the generated [register](REGISTER.md) for implementation detail.

## Source hierarchy

1. `design/tokens/active.json` remains the production authority. Positioning and claims retain their existing decision/register authority.
2. [registry.json](registry.json) owns this candidate's asset identities, roles, pairings, crop instructions, source confidence, restrictions and reconciliation record.
3. [quiet-material-catalogue.json](../../tokens/candidates/quiet-material-catalogue.json) contains the exact retained CSS values and separately named document geometry. Its geometry is not website layout. It supersedes no previous token candidate.
4. [REGISTER.md](REGISTER.md) and the PDF are generated views. Edit the register/tokens, rebuild, inspect, then verify; do not hand-edit a generated view.
5. [verification.json](verification.json) binds the PDF to the register, tokens and builder inputs. It records the measured text/background specimens, with explicit limits.

The preserved source package remains immutable and recoverable from the release URL and archive digest in `registry.json`. The builder takes an extracted package root and verifies every referenced source file against its recorded SHA-256. Large image masters are not duplicated into this repository. The PDF embeds them; the local HTML intermediate needs the extracted originals. Fonts and their OFL licences are packaged here with digests. No source image is regenerated, retouched or recoloured.

## What to review

- Pages 2–3: whether the light and dark families feel related and their distinct roles are sensible.
- Pages 4–7: retained gradients, then proposed gradient/surface pairings.
- Pages 8–21: all fourteen images at landscape, square and narrow crops. One-row compact cards demonstrate reducing content before type size.
- Page 22: the retained lockup and the legacy favicon conflict. This proposes identity/symbol separation, not a new logo.
- Pages 23–24: composition rules and remaining work.

Particular judgements: the narrow hero crop loses its desktop quiet-left area; Dusk/Ember/Graphite paired with the existing neutral glass become visibly blue-biased; Amber has no card recipe. These limitations are recorded, rather than filled with invented assets or colours. The current catalogue does not approve direct text on an atmospheric image.

## Rebuild and verify

From the repository root:

```powershell
node design/brand-kit/quiet-material/build.mjs --source <extracted-package-root> --playwright <playwright/index.mjs>
python design/brand-kit/quiet-material/verify.py
npm run design:check
npm run design:test
```

The optional `--playwright` argument locates an existing Playwright package; otherwise the builder uses a locally resolvable installation. It launches installed Chrome headlessly with a fresh context, allows only local/data inputs, closes the browser, and writes no product data. The PDF verifier requires PyMuPDF and Pillow. `--register-only` regenerates just the human register. `--check --source <root>` adds extracted-file integrity checks to ordinary CI validation.

CI's existing `design:check` now checks coverage, token references, original identity/digests, generated-register drift and PDF/evidence/input hashes. `design:test` includes negative checks for missing assets, changed sources, invented Amber material and silent illustration promotion. CI does not fetch a release or regenerate visual evidence.

The contrast method samples every background pixel beneath each hidden specimen text element, on the actual Chromium composition, and requires 4.5:1 even for headings. It is a conservative check of those fixed specimens, not certification of arbitrary crops, full responsive pages, dark mode or motion. PDF text bounds and visual page review are separate checks. Verification accepts only the raw PDF bound to that render, then checks that lossless optimisation preserves every page's text, geometry and rendered pixels. Rebuild before running verification again; a prior verification record cannot authorise a different PDF. CI enforces the complete evidence shape, per-page sample coverage and agreement between measurements, failure lists and status.

## Open work

Current records cover all fourteen atmospheric assets, but eleven original creation/rights histories remain unknown. Missing direction-reference and capability-illustration sources are explicitly unavailable. The three editorial references remain excluded from implementation. Identity exports at small sizes, complete typography roles/fallbacks, component states, motion and channel templates still need their own specimens.

Continue from [SYSTEM-COMPLETION.md](../../../docs/programs/brand-website/SYSTEM-COMPLETION.md). Keep the earlier audit and rejected studies as history; do not reactivate them as competing current directions.
