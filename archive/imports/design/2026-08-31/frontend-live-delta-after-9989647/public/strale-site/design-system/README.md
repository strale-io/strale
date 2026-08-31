# Strale website design system

Status: **canonical for the marketing website**  
Foundation: **Quiet Material v0.5**  
Visual catalogue: [`design-system.html`](design-system.html)  
Current implementation: `/homepage-v2`

This directory is the single source of truth for website design work. The
system is larger than its colour palette: typography, spacing, responsive
composition, motion, component behavior, imagery, accessibility, and change
control are all part of the contract.

## Where each part lives

| Area | Authority |
| --- | --- |
| Principles and visual model | [`DESIGN-SYSTEM.md`](DESIGN-SYSTEM.md), sections 1–2 |
| Colour and atmospheric expressions | `DESIGN-SYSTEM.md`, section 3; [`assets/design-tokens.css`](assets/design-tokens.css) |
| Typography and responsive type | `DESIGN-SYSTEM.md`, section 4; `assets/design-tokens.css` |
| Spacing and editorial rhythm | `DESIGN-SYSTEM.md`, section 5; [`ADAPTIVE-LAYOUT.md`](ADAPTIVE-LAYOUT.md) |
| Shape, elevation, and glass | `DESIGN-SYSTEM.md`, section 6 |
| Components and interaction states | `DESIGN-SYSTEM.md`, section 7 |
| Copy and content behavior | `DESIGN-SYSTEM.md`, section 8 |
| Motion and reduced-motion behavior | `DESIGN-SYSTEM.md`, section 9; `ADAPTIVE-LAYOUT.md` |
| Accessibility and approved patterns | `DESIGN-SYSTEM.md`, section 10 |
| Change control | `DESIGN-SYSTEM.md`, section 11 |

## Asset status

- `hero-folded-light-background-v1.png` and the four `pattern-folded-*-v1.png`
  files are approved reusable atmospheric assets.
- `references/` contains approved direction boards and surface maps. These are
  references, not backgrounds to paste into a page.
- `capability-illustrations/` is provisional. Each image must be reviewed in
  its page context; the set is not yet a locked illustration language.

## Implementation rule

Before changing a marketing page, read this file, `DESIGN-SYSTEM.md`, and
`ADAPTIVE-LAYOUT.md`. Reuse the shared tokens and approved assets. Page-local
values are allowed only when the system has no suitable semantic token; any
repeated exception should be promoted into the canonical system.

When the system itself changes, update the written contract and tokens first,
then the catalogue, then consuming pages. Do not silently redefine the system
inside a page component.

## Historical systems

The Luminous Utility/Luminous Spectrum documents under
`docs/website-redesign/` are preserved as design history but are not current
implementation authority. The former product-interface catalogue is available
at `/product-design-system-legacy`; it does not govern the marketing website.

The stable browser entry point for this package is `/design-system`.
