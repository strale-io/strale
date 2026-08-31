# Strale adaptive layout framework

Status: active workstream  
Owner surface: `index.html`  
Shared primitives: `assets/design-tokens.css`

## Objective

Strale should feel deliberately composed on phones, tablets, Surface-class
laptops, desktop monitors, and ultrawide displays. The layout responds to the
browser's CSS viewport, which already incorporates browser zoom and operating-
system display scaling. A Surface running Windows at 150% therefore receives
the same considered layout as any other browser with the same effective CSS
viewport.

The system must not depend on physical pixel resolution or
`devicePixelRatio`. Those values describe hardware density, not usable layout
space.

## Core rules

1. **Fluid first.** Gutter, shell width, column gap, and approved visual scale
   interpolate continuously with `clamp()`, `min()`, and available space.
2. **Breakpoints change structure, not scale.** Media queries may stack a grid,
   reveal the mobile menu, or simplify an interaction. They must not make the
   entire page suddenly larger because the viewport crossed one pixel.
3. **Three shells, one hierarchy.** Navigation is widest, the hero may be
   wider than editorial sections, and primary sections share one content shell.
4. **Height is a first-class constraint.** Laptop and landscape-tablet layouts
   are verified by height as well as width. Important proof should not require
   a hidden second viewport merely because a screen is short.
5. **Type protects hierarchy.** Fluid layout may change measure and wrapping.
   The laptop composition retains the approved 52px hero, while an expansive
   wide-and-tall viewport may interpolate to 62px. Technical text never drops
   below its legibility floor.
6. **No transform-based responsive sizing.** Product frames resize through
   their container and aspect ratio. `transform: scale()` is reserved for
   animation, never used to create a large-screen layout.
7. **No page-level horizontal overflow.** Horizontal movement is allowed only
   in components that explicitly own it, such as the capability rail.
8. **One vertical rhythm.** Standard sections use 48px edges on phones, 64px
   on tablets, 72px on standard desktops, and 92px in the expansive tier.
   Compact-height laptops may use 48–56px. Every primary section at a given
   viewport uses the same resolved edge; exceptions belong inside a named
   narrative component, never between sections.

The desktop How Strale Works scroll story and the closing CTA own their inner
compositions, but both participate in the shared outer section edge. Neither
may introduce free-floating margins between otherwise standard sections.

## Layout primitives

| Token | Contract |
|---|---|
| `--layout-gutter` | Fluid page inset, 20–64px. |
| `--layout-available` | Viewport width after two gutters. |
| `--nav-content` | Widest shell, capped at 1504px. |
| `--hero-content` | Fluid hero shell, 1163–1408px when space permits. |
| `--section-content` | Shared primary-section shell, 1180–1440px when space permits. |
| `--hero-visual-width` | Product-proof width, 570–720px on desktop. |
| `--hero-column-gap` | Fluid desktop column gap, 72–112px. |
| `--scroll-story-height` | One viewport plus 640–840px of step travel, capped at 2280px so each process stage remains readable longer. |

The shell order is intentional:

`navigation >= hero >= primary section`

At narrow widths every shell resolves to the same available width, avoiding
independent edge drift.

## Structural tiers

These are behavior boundaries rather than device labels.

| Effective CSS viewport | Structural behavior |
|---|---|
| `<= 620px` | Compact phone controls and typography; single-column content. |
| `621–800px` | Single-column narrative; touch-first horizontal rail. |
| `801–1100px` | Tablet / narrow-window structure; collapsed navigation, stacked hero, and direct-tab process story without scroll capture. |
| `>= 1101px` | Desktop navigation, two-column hero, and scroll-led process story. |

There is no abrupt page-scale breakpoint. At `1728px × 950px` and above, a
bounded **expansive composition** tier lets the hero proof, column gap, and
display heading grow modestly inside their established shells. Once those
caps are reached, additional width becomes calm outer whitespace.

Height-sensitive adjustments use content-driven thresholds only where needed:

- compact landscape/laptop: `<= 740px`;
- standard laptop: `741–880px`;
- spacious: `>= 881px`.

Height rules may reduce vertical padding or sticky-story travel. They must not
shrink essential controls. Landscape tablets from 900–1100px are the one
intentional structural exception: they use a compact two-column hero so the
complete composition fits without turning the product proof into a second
screen.

## Hero vertical contract

The desktop hero is a first-screen composition, not a generic `100vh` block.

- At `>= 1101px`, it fills the usable first screen with
  `min-height: calc(100svh - header)`.
- `svh` is used instead of legacy `vh` so mobile and browser chrome changes do
  not make the composition jump.
- Short desktop screens compress top/bottom padding and internal gaps before
  they reduce type or controls.
- Landscape tablets use the compact two-column exception described above.
- Portrait tablets and phones remain content-driven and stack naturally; a
  fixed viewport height would crop the proof or create fragile overflow.
- Tall displays keep the complete first screen. The expansive composition
  grows the proof, headline, and column spacing within strict caps; remaining
  space becomes part of the hero atmosphere rather than exposing the next
  section prematurely.

The desired outcome is consistent prominence, not identical geometry. A
visitor should understand the full hero on the first desktop screen, while a
phone visitor should be able to read and scroll the same content without it
being squeezed into an artificial viewport.

## Verification matrix

Every material layout change is checked at the following CSS viewports:

| Class | Width × height |
|---|---|
| Small phone | 360 × 800 |
| Modern phone | 390 × 844 |
| Portrait tablet | 768 × 1024 |
| Landscape tablet | 1024 × 768 |
| Short laptop | 1280 × 720 |
| Common laptop | 1366 × 768 |
| Surface / scaled desktop | 1536 × 864 |
| Desktop | 1600 × 900 |
| Large desktop | 1920 × 1080 |
| Ultrawide confidence check | 2560 × 1440 |

Also verify:

- browser zoom at 200% (the layout should naturally enter a narrower tier);
- Windows display scaling behavior via the effective CSS viewport;
- keyboard focus and 44px touch targets;
- `prefers-reduced-motion: reduce`;
- no positive document-level horizontal overflow;
- content remains readable with long headings and two-line supporting copy.

## Acceptance checks

- A one-pixel resize around a breakpoint never changes type or card scale.
- Navigation, hero, and section shells remain centered and preserve their
  intended width hierarchy.
- At `1280 × 720` and wider desktop viewports, navigation plus hero form one
  complete first-screen composition without horizontal clipping.
- At `1024 × 768` landscape, the compact two-column hero fits the usable first
  screen. Portrait tablet and phone heroes remain content-driven.
- A standard section introduction uses the shared heading and lead measure.
- Cards use `width: 100%`, `min-width: 0`, and intrinsic/aspect-ratio sizing
  inside their shell instead of fixed page coordinates.
- `document.documentElement.scrollWidth <= window.innerWidth` at every matrix
  viewport, except for the browser scrollbar's reported width difference.

## Rollout

1. **Foundation — complete:** fluid gutter and three-shell hierarchy; remove
   the old page-scale cliff; normalize navigation, hero, and section alignment.
2. **Hero composition — complete:** full usable desktop first screen, compact
   landscape-tablet exception, content-driven portrait/mobile behavior, and a
   bounded expansive tier.
3. **Section composition — baseline complete:** shared heading, lead measure,
   stage gap, card padding, and grid gap are applied across the page. Continue
   auditing each section's internal density without changing its approved idea.
4. **Interaction adaptation — baseline complete:** the capability rail owns its
   horizontal movement, runs only while its scroll surface is visible, and the
   How Strale Works story uses about 300–420px of height-aware step travel.
   Touch, keyboard, explicit motion opt-out, and reduced-motion states are part
   of the regression contract.
5. **Quality gate — baseline complete:** the documented width/height matrix has
   no page-level horizontal overflow. Add browser-zoom and long-copy regression
   checks as individual sections are refined.

### Expansive component density

Primary sections do not all become `100svh`; doing so would slow the narrative
and create artificial empty space in compact sections. Instead, components
with meaningful visual proof opt into the expansive tier:

- section headings and leads increase within the shared type caps;
- proof surfaces receive more vertical padding and a larger stage gap;
- compact product rows may grow from 48px to 60px;
- technical labels may grow from 11px to 13px;
- imagery and product proof grow more than surrounding prose.

The Tools catalogue is the reference implementation for this rule. Its
laptop form stays compact, while its wide-and-tall form uses taller catalogue
rows, larger technical type, and more frame padding. This lets it occupy more
of a large viewport without forcing a full-screen section.

## Motion contract

Motion is part of the default website experience. Opening `index.html`
directly and loading it through the local server must initialize the same
motion system.

- Hero typing, workflow reveal, and the capability rail run by default.
- `?motion=0` is the explicit static-review opt-out.
- `prefers-reduced-motion: reduce` keeps every sequence in a complete,
  readable static state.
- Layout changes must be verified against state transitions, not only against
  screenshots: hero prompt text changes, all workflow nodes and results reach
  their revealed state, the capability rail advances, and the How story moves
  through all four active steps.

## Next section passes

Work through these independently so a visual change cannot destabilize the
page-wide sizing system:

1. capabilities rail: touch, trackpad, fade width, and narrow-window controls;
2. workflows: mobile card density and heading/copy reflow;
3. integrations and trust: tab wrapping, proof-card height, and short laptops;
4. pricing and closing: two-column collapse, CTA wrapping, and text enlargement;
5. global accessibility: 200% zoom, focus order, reduced motion, and long-copy
   stress cases.
