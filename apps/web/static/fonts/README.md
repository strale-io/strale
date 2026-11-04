# Web fonts (subset WOFF2)

Subset copies of the Open Flow kit fonts in `design/brand-kit/open-flow/fonts/` (the masters, with their OFL licences and provenance). They cover Latin and Latin-1 (including Swedish), general punctuation, the euro sign, arrows and the check mark, keep every layout feature and variable axis, and cut the font payload from about 466 KB to about 118 KB. `scripts/prepare-assets.mjs` copies them into `public/fonts/`, and the generated `@font-face` rules list them before the TTF masters.

Regenerate after a master changes, from the repository root:

```
for f in SpaceGrotesk InstrumentSans IBMPlexMono-Regular; do
  python -m fontTools.subset design/brand-kit/open-flow/fonts/$f.ttf --output-file=apps/web/static/fonts/$f.woff2 --flavor=woff2 --layout-features='*' --unicodes="U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+2000-206F,U+2074,U+20AC,U+2122,U+2190-2199,U+2212,U+2215,U+2713"
done
```
