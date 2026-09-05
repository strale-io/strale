# Quiet Material: identity and typography

**Accepted for continued design work.** The founder accepted this companion on 5 September 2026. This records design acceptance; the packaged candidate status and production tokens remain unchanged. [Start at the complete kit index](../README.md).

This is the current **identity/type companion candidate, revision 0.1**, within the existing Quiet Material kit. The founder accepted the atmosphere/surface catalogue 0.2 on 5 September and asked us to continue with identity variants and typography. The later request to compare direct light text and a light action on dark cards is included as a candidate specimen. It does not replace the accepted reading-panel recipe or adopt production tokens.

Start with `output/pdf/identity-typography.pdf`. The separate `output/pdf/document-specimen.pdf` is an actual two-page A4 type proof. The [generated register](REGISTER.md) is the human reference for roles and rules; [registry.json](registry.json) is their structured source, and [the token candidate](../../../tokens/candidates/quiet-material-foundations.json) owns the design values. [Verification](verification.json) records the exact font, export, reflow, PDF and dark-card checks.

## What to assess

- Pages 2–3: the retained logo at ordinary and small sizes, inverse forms and avatar crops. The mark is derived from the original paths; it has not been redrawn.
- Page 4: direct light text with a light button on Cobalt and Dusk. This suits a short marketing message; it is not a proposal to place dense results directly on artwork. Direct text on atmospheric images remains a separate crop/contrast task.
- Pages 5–9: the type roles, real weights, readable narrow layouts, glyphs, numbers and technical text.
- Pages 10–12: whether the same identity and hierarchy carry across social, email and an A4 document.

The source artwork and fonts are retained. Instrument Sans is used at normal width, with real 400/500/600 weights. The supplied IBM Plex Mono is regular 400 only, so this candidate replaces the old suggestion to use a synthetic medium weight. Italic fonts are not supplied. The original catalogue remains an immutable reviewed artifact on its own inputs; this companion does not rebuild it.

## Exports and boundaries

[exports/manifest.json](exports/manifest.json) records source/input hashes, output hashes and candidate status. Exports include ink/inverse SVG lockups and isolated marks, avatar SVG/PNG pairs, 16/32px PNG favicon and ICO, a PNG email lockup, two social PNG specimens, and an inline-style email HTML specimen. Paths and letterforms are unchanged; wrapper transforms centre the isolated S and set avatar safe space.

The logo's original creation/rights history is still unknown. Packaged font files and their OFL licences remain in the parent kit. No original font outlines were modified. Font inspection covers the explicitly recorded glyph fixture, not all languages. Instrument Sans lacks the checkmark in the supplied file; icons need their own assets.

Social dimensions are composition specimens, not promises about every platform's crop. The email export uses system fonts and a relative PNG image; host/attach the image appropriately in a real template. Browser reflow does not prove compatibility in Outlook, Gmail or dark mode. The PDFs embed fonts and have checked geometry; physical print proof remains open. Nothing was sent, published to a marketing channel or installed in production.

## Rebuild

```powershell
node design/brand-kit/quiet-material/foundations/build.mjs --playwright <playwright/index.mjs>
python design/brand-kit/quiet-material/foundations/verify.py
node design/brand-kit/quiet-material/foundations/build.mjs --check
```

The browser build uses installed Chrome with a fresh context and blocks HTTP(S). Python verification requires PyMuPDF, Pillow and fontTools. Source assets are local, so this companion does not require the external preserved archive extraction. `--check` verifies the committed generated views and artifacts without launching a browser. Rebuild after any hashed input changes.

The completion plan remains [SYSTEM-COMPLETION.md](../../../../docs/programs/brand-website/SYSTEM-COMPLETION.md). Navigation, controls, form states, utility symbols and composition studies are now available in the accepted companions linked from the kit index. Remaining qualification follows the system completion plan. The companion is one current part of the kit, not an alternative design direction.
