# Current Strale website design system

## Canonical source

The canonical marketing-website system is **Quiet Material foundation v0.5**.

- Visual catalogue: [`/strale-site/design-system/design-system.html`](../../public/strale-site/design-system/design-system.html)
- Complete system contract: [`DESIGN-SYSTEM.md`](../../public/strale-site/design-system/DESIGN-SYSTEM.md)
- Adaptive layout contract: [`ADAPTIVE-LAYOUT.md`](../../public/strale-site/design-system/ADAPTIVE-LAYOUT.md)
- Shared tokens: [`assets/design-tokens.css`](../../public/strale-site/design-system/assets/design-tokens.css)
- Current browser route: `/design-system`

This package governs typography, color, spacing, responsive composition, shape,
elevation, glass, motion, components, imagery, accessibility, approved homepage
patterns, and change control. Future website work must read the complete system
contract and adaptive layout contract before editing a marketing surface.

## Visual model

Quiet Material composes up to four layers in this order:

1. white or quiet structural canvas;
2. an approved folded-material raster when spatial atmosphere is useful;
3. one semantic gradient frame;
4. flat or glass product proof rendered as accessible HTML/CSS.

The approved atmospheric expressions are Spectrum, Mulberry, Ember, Cobalt,
Dusk, Frost, Midnight, Mineral, and Mint. The folded family is Balanced,
Mineral, Cobalt, and Warm.

## Asset status

- `assets/hero-folded-light-background-v1.png` and the four
  `pattern-folded-*-v1.png` plates are approved reusable atmosphere assets.
- The six `pattern-folded-dark-*-v2.png` plates are the approved dark Quiet
  Material family for Midnight, Cobalt, Dusk, Mineral, Spectrum, and Ember.
  They are production assets, not local design artifacts.
- `references/*.png` are approved direction and surface-map references; they
  are not production backgrounds.
- `assets/capability-illustrations/` is a provisional illustration library.
  Individual images may inform or seed a composition, but the complete
  illustration system is not locked. Review each image in context before use.

## Historical material

The following remain in the repository for provenance but are superseded as
website implementation authority:

- `foundations/color-typography-system-v0.8.md`;
- `foundations/design-system-mechanics-v0.9.md`;
- `art-direction/territories-v0.1.md`;
- `homepage/round-15-design-system-audit/`;
- the former dark React catalogue, now available only at
  `/product-design-system-legacy`.

Historical files must not be used to override Quiet Material v0.5. If a new
approved system supersedes v0.5, update this file, the canonical package, the
browser route, and the supersession banners together.

The current homepage Prospect Enrichment chapter is governed by
[`prospect-enrichment-v2.0.md`](./homepage/prospect-enrichment-v2.0.md), which
supersedes the earlier Selection Violet enrichment-validation direction for
that chapter without superseding Quiet Material v0.5.
