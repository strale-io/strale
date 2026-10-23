# Open Flow — Strale website design system

**Status: candidate 0.1, proposed for founder review.** Not adopted. Production still runs [`design/tokens/active.json`](../../tokens/active.json). The website will be built in `apps/web` (DEC-20260902-A) once a decision adopts this system.

On 23 October 2026 Petter chose the pink BrandKit Lab direction, `strale-reference-kit-06` (9 September 2026), as Strale's visual direction for the website redesign: "yes, I think it's the one that you brought out... we need to elaborate on the design system and build it so that we have a complete design system that works for our website." This system builds that kit out for the website. It is a visual-direction choice. Positioning (DEC-20260905-A) is unchanged, and the homepage story and hero are being worked out separately. Copy in this kit is neutral placeholder text.

It replaces [Quiet Material](../README.md) as the visual direction. Quiet Material stays in the repository as history.

| Open | What it is |
|---|---|
| [`specimen/index.html`](specimen/index.html) | The rendered specimen. Shows every token, component, state and section pattern, in light and dark. Open it locally in a browser. |
| [`screenshots/`](screenshots/) | The specimen at 1440px and 390px, light and dark, in seven parts each. |
| [`../../tokens/candidates/open-flow.json`](../../tokens/candidates/open-flow.json) | Every value. The only source; everything else is generated from it or checked against it. |
| [`tokens.css`](tokens.css) | Generated CSS custom properties, ready for `apps/web`. |
| [`CONTRAST.md`](CONTRAST.md) | Generated WCAG proof: 122 pairs, all passing. |
| [`provenance.json`](provenance.json) | Hash-bound lineage for every copied asset and font. |

## What came from the kit and what is new

**Carried over unchanged from kit-06:** the eleven kit colours (`brand.*`, except `brand.image-ground`, which is sampled from the artwork), Space Grotesk and Instrument Sans, the type roles hero, campaign, section, detail, body, compact and label (sizes, weights, leading, tracking, measure), the 8px control radius, the 1600ms and 2200ms reveal durations, the no-loop and reduced-motion rules, the artwork, and the reading regions the kit declared for it.

**Derived here (the kit doesn't have them):** the whole dark theme; interaction, status, code and chart colours; the subhead, lead, ui, small, code, stat and numeric type roles; IBM Plex Mono for code; the spacing scale, radius scale, elevation, grid, containers and breakpoints; motion easings and short durations; every component and section pattern. The kit calls its component specimens "a starting point, not a complete interactive library". It has no dark theme, and its logo rule records no reversed or dark-background logo asset. Those gaps are filled here.

**The page canvas is `#fdf7fe`.** This is the pale pink-lilac ground of the flow artwork, sampled from `wide.png`. Full-bleed artwork then meets the page with no visible edge. Cards sit on white (`--surface`).

## Principles

1. **Colour carries recognition. Ink and light surfaces carry information.** Blue, violet and teal belong to the artwork, the logo stage, the primary action and charts. None of them signals state on its own.
2. **One message per section.** A section opens with a statement, then explains. Add detail by grouping it, never by shrinking type below its role.
3. **Artwork stays whole.** Each image is composed for one format. Show it at its own ratio, uncropped. Put text only in the reading region the kit declared. If copy doesn't fit there, put the text beside the image.
4. **States are words plus colour.** Every status has an icon and a label. Focus is always a visible 2px ring.
5. **The reading surface never moves.** Graphics reveal in place and settle. Artwork never loops; only loading indicators repeat.

## Colour

Components use **role tokens** only (`--canvas`, `--text`, `--action` and so on). Each role resolves per theme. Brand tokens (`--brand-*`) are for artwork stages, identity and the inverse button, nowhere else.

| Role | Light | Dark | Use |
|---|---|---|---|
| `--canvas` | #fdf7fe | #130d21 | Page background |
| `--surface` | #ffffff | #1c1530 | Cards, panels, inputs |
| `--surface-sunken` | #f6ecf8 | #0f0a1b | Alternate sections, disabled fields, inline code |
| `--surface-soft` | #eecff2 | #2a1d40 | Editorial emphasis, with dark text |
| `--surface-blue` / `--surface-teal` | #e4e8ff / #d7efeb | #1f1a4a / #0f2a2a | Grouped information, the recommended column, icon tiles |
| `--surface-inverse` | #29164b | #29164b | CTA band, section statement. Light text only |
| `--text` / `--text-muted` | #17151c / #5c5468 | #f7f3fb / #bdb4cc | Reading text / secondary text. Both pass AA on every surface above |
| `--border` | #d2cfd8 | #3a3050 | Decorative dividers only |
| `--border-strong` | #7a7287 | #857a9c | Input and control boundaries (3:1 on every surface) |
| `--action` (+ `-hover`, `-active`) | #3027ff | #3027ff | Primary button. White label, 7.3:1 |
| `--action-subtle` | #e4e8ff | #241f5c | Hover and selected backgrounds |
| `--link` / `--focus` | #3027ff | #b9b5ff | Links, focus rings, icon accents |
| `--indicator` | #3027ff | #b9b5ff | Selected-tab and current-page underline, checkbox and radio fill (3:1). Electric blue is only 2.6:1 on the dark canvas |
| `--focus-inverse` / `--focus-code` | #ffffff / #b9b5ff | same | Focus ring on the deep-violet band / inside code blocks |
| `--success` `--warning` `--danger` `--info` (+ `-bg`) | see tokens | see tokens | Status. Always with an icon and words |
| `--code-*` | dark | darker | Code blocks are dark in both themes |

Rules:

- **Teal is not success, and teal is not text.** Teal on white is 4.1:1, too low for small text. Success has its own green.
- **Never set dark text on electric blue** (2.46:1). Blue takes white text.
- The decorative `--border` is never the only edge of an input. Fields use `--border-strong`.
- **Theme switching.** Dark follows the system preference unless the page is pinned. Pin with `data-theme="light"` or `data-theme="dark"` on `<html>` or any element. The specimen's navigation includes a System / Light / Dark switch.

### Contrast

[`CONTRAST.md`](CONTRAST.md) lists every pair the components use. Text needs 4.5:1 and non-text needs 3:1, per WCAG 2.x. `npm run design:check` recomputes all pairs from the token file and fails if any drops below its minimum. A pairing not listed there is not proven; add it to `layout.contrast` before using it. The proof covers token pairs only. Text over artwork is only allowed inside a kit-checked reading region.

### Charts

Six categorical slots, assigned in fixed order and never cycled. Light: `#3027ff #0a9a8f #7a3cff #b87400 #c2188f #2f86e0`. Dark: `#5d57ff #169c90 #9566ff #c4861c #db4a95 #3a8fe0`. Both orders were chosen with a palette validator during authoring: lightness band, chroma floor, protan/deutan separation of adjacent slots, normal-vision floor, and 3:1 contrast. No receipt for that run is committed. Only the 3:1 contrast against each canvas is re-checked by `design:check` (it is in `CONTRAST.md`). Re-validate colour-vision separation before changing a slot. Use the sequential blue ramp (`--chart-seq-1..7`) for magnitude. Use the diverging teal–grey–magenta ramp (`--chart-div-*`) for polarity. Labels and values stay in text colours. Two or more series always get a legend. Status colours are never used as series. No dual axes.

## Type

| Role | Family | Size (px, fluid 360→1440) | Use |
|---|---|---|---|
| `hero` | Space Grotesk 600 | 36–76, lh 1.04, −0.045em, 16ch | One per page, in the hero shell |
| `campaign` | Space Grotesk 600 | 30–52 | Inner-page h1, major statement |
| `section` | Space Grotesk 600 | 26–36 | h2 |
| `subhead` | Space Grotesk 600 | 20–24 | h3, card titles |
| `detail` | Instrument Sans 600 | 17–20 | h4, group headings |
| `lead` | Instrument Sans 400 | 18–21, 52ch | Intro paragraph |
| `body` | Instrument Sans 400 | 16–19, lh 1.6, 62ch | Reading text, never below 16 |
| `compact` | Instrument Sans 400 | 16–17 | Cards, tables, reference |
| `ui` | Instrument Sans 500 | 16 | Buttons, nav, tabs, labels |
| `small` | Instrument Sans 400 | 14 | Helper text, metadata, legal. Never the only carrier of essential content |
| `label` | Instrument Sans 600 | 12–13, +0.06em | Eyebrows, badges. Sentence case |
| `code` | IBM Plex Mono 400 | 14–15 | Code, identifiers |
| `stat` | Space Grotesk 600, tabular | 36–56 | A single headline number |
| `numeric` | Instrument Sans 500, tabular | 16 | Prices, counts, latency. Right-aligned in columns |

Space Grotesk introduces and Instrument Sans explains. Use at most two weights in one composition. Sustained reading is left-aligned. Only a short, self-contained statement may be centred. Never typeset the logo in either font. `small` (14px) is a derived deviation from the kit's 16px floor. It is allowed only for metadata and helper text, never for reading text.

## Space, radii, elevation, layout

- **Spacing:** 0, 2, 4, 8, 12, 16, 20, 24, 32, 40, 48, 64, 80, 96, 128, 160. Named stacks: tight 8, base 16, loose 24, group 32, block 48.
- **Radii:** tag 4, control 8 (kit), card 12, media 20, pill.
- **Elevation:** four levels (0–3). Cards rest at 1, hover lifts to 2, menus sit at 3. On dark, elevation also raises the surface colour, because a shadow alone doesn't read there.
- **Layout:** containers 1200 (content), 1320 (wide), 720 (prose). Grid 4 / 8 / 12 columns at 0 / 768 / 1024px. Gutters 16 / 24 / 32. Section rhythm 64 / 96 / 128. Breakpoints 640, 768, 1024, 1280. Mobile first. Measures: body 62ch, lead 52ch, section 28ch, hero 16ch.
- **Controls:** 36 / 44 / 52px heights. Primary actions and navigation use 44px targets or larger. Compact controls (small buttons, chips, code tabs, segmented control, theme switch) are 36px. Nothing interactive goes below the WCAG 2.2 floor of 24px. Borders 1px. Focus ring 2px with 2px offset.

## Motion

Durations: fast 120ms (colour and border), base 200ms (elevation, disclosure), slow 320ms (panel entrance), reveal-signature 1600ms (bands), reveal-atmosphere 2200ms (glow or field). Easing `standard` for state changes, `reveal` for reveals only. Reveals open a clip region over artwork that stays still. Text never slides in. Artwork never loops; spinners and skeletons repeat only while something is loading. Under `prefers-reduced-motion` every duration becomes 0, reveals show their final frame, and the spinner stops.

## Imagery

All flow artwork shares one family: blue, violet and teal ribbons on a near-white lilac ground. It has crisp edges, generous empty space, and no text or logo baked in. The kit's asset library marks wide, centre-field, card-field and portrait-field `checks-pending`. Field, the glow and the bands are not in the library at all; the kit lists them only as proposal or provisional assets. The library's approval is "not-granted". Before any image reaches the public site, it needs the actual-copy fit check and a rights confirmation.

| Asset | Ratio | Reading region (x, y, w, h of the image) | Use |
|---|---|---|---|
| `wide` | 16:9 | 6%, 8%, 53% × 54% (ink on source pixels ≥15.5:1) | Hero shell at every width |
| `centre-field` | 16:9 | 16%, 12%, 68% × 48% (≥15.3:1) | Centred section opening, light CTA band, 1024px and up |
| `card-field` | 4:3 | 8%, 8%, 76% × 49% (≥15.6:1) | Feature media panel, media card |
| `portrait-field` | 4:5 | 8%, 7%, 84% × 49% (≥17.0:1) | Portrait formats (social, editorial). Not the mobile hero |
| `field` | 3:2 | none | Decorative only. Never under text |
| `light` (the glow) | 3:2 | none | Atmosphere beside a solid reading surface. Never text on it |
| `bands.svg` | 40:19 | none (transparent vector) | Dark-theme partner, CTA band, motion reveal |

**Crops.** None. Use `object-fit: contain` at the native ratio. A new ratio needs a new commission. The kit's earlier `portrait.png` and `card.png` failed their commissioned regions, so they are not carried into this kit.

**Safe text regions.** The regions are generated into `tokens.css` as `--region-<asset>-x/-y/-width/-height`, so layouts place text from the asset record. Text goes only inside the region above, and only when the real copy fits at every width. If it doesn't fit, use the stacked layout: text on the canvas, the image whole beside or below it. Never shrink type to make it fit.

**When to use which.** The hero uses `wide`. A feature split or media card uses `card-field` in a 20px-radius media panel. A colour pause uses `--surface-inverse` with `bands.svg`, with no raster at all. Atmosphere uses `light` beside a white reading surface. `field` is for decorative fills that carry no message.

**Light and dark pairs.** Every raster has a light ground, so none of them goes full-bleed on the dark canvas.

| Use | Light | Dark |
|---|---|---|
| Hero shell | `wide`, full-bleed on the matching canvas | `bands.svg` anchored bottom-right on `--canvas`, away from the text |
| Feature media | `card-field` in a media panel | the same panel, contained (a light window into the colour world) |
| CTA band | `bands.svg` on deep violet | identical |
| Atmosphere | `light` beside a reading surface | identical; the glow holds up on dark |

Dark-native raster variants have not been commissioned. That is listed as a gap below.

## Components

Every component is in the specimen with its states. State classes (`is-hover`, `is-focus`, `is-active`) exist only so the specimen can show states side by side. A real page gets state from `:hover`, `:focus-visible`, `:active`, `disabled`, `aria-*` and data.

| Component | Variants | States shown | Rules |
|---|---|---|---|
| Navigation | desktop bar with disclosure menu; mobile menu button with in-page panel | current page, hover, open, theme switch | Escape closes and returns focus. An outside click closes. The menu opens in the page, not as a modal. Flowing-S logo, ink in light and inverse in dark |
| Buttons | primary, secondary, tertiary, destructive, inverse, inverse outline, icon; 36 / 44 / 52 | default, hover, pressed, focus, disabled, loading | One primary per group. Loading keeps the label and sets `aria-busy`. Explain a disabled button when the next step isn't obvious. Focus ring turns white on deep violet |
| Links | inline, standalone with arrow, external | default, hover, focus | Inline links are always underlined. External links say so to screen readers |
| Form fields | text, search, select, textarea, checkbox, radio | placeholder, hover, focus, filled, error, valid, disabled, checking | Label above the field. Help text below. Errors give an icon plus a sentence saying how to fix it, linked with `aria-describedby` and `aria-invalid` |
| Tabs | underline tabs, segmented | selected, default, hover, focus, disabled | Roving tabindex. Arrow keys, Home and End move between tabs |
| Tags and badges | neutral, blue, soft, teal; success, warning, danger, info | — | Status badges always carry an icon and a word |
| Notices | info, success, warning, error | — | Title says what happened, body says what to do. Add `role="status"` (or `role="alert"` for errors) only when the notice is inserted after load |
| Cards | feature, link card, media, unavailable, loading skeleton, empty state, error | default, hover, focus | A link card is a single link. Never nest panels. Skeletons pulse unless reduced motion is on |
| Code blocks | language tabs, response block, error response, empty response, inline code | copy → "Copied" or "Copy failed" | Dark in both themes. Copy is confirmed in words and announced |
| Tool request / result | request pane plus result pane | idle (empty), loading, success, error | Specimen fixture only; it sends no request. While running, the button is `aria-disabled` so keyboard focus stays on it. An error names the missing field and says nothing was charged |
| Pricing rows | table at 768px and up, stacked below | available, account, unavailable, loading, empty, error | Integer cents, formatted by the page. Tabular figures, right-aligned. Unavailable says why |
| Tables | data, sortable, empty, loading, error | sorted ascending / descending, row hover | Numbers right-aligned and tabular. Header cells use `scope`. Wide tables scroll inside their frame |
| Footer | brand plus four link columns | link hover | Columns drop to two on phones |

## Section patterns

These are shells only. Dashed outlines mark slots. Hero copy, order and message come from the positioning work, not from this kit.

- **Hero shell.** On light: `wide` full-bleed. From 1024px, the slots (eyebrow, headline, one sentence, two actions) sit inside its reading region. Below 1024px the text stacks above the whole image. On dark: the same slots, with `bands.svg` anchored bottom-right.
- **Feature.** Three-up cards with one thought each, or a split with text and a list beside a `card-field` media panel, which may sit on `--surface-sunken`.
- **Catalogue grid.** Search plus filter chips in one row, then a result count, then a 1 / 2 / 3-column grid of link cards. Filtering to nothing shows the empty state with "Clear filters".
- **Comparison.** A table with word-labelled ticks and dashes (placeholder values only), with the recommended column in blue mist. Below 768px it becomes cards.
- **CTA band.** The colour band is deep violet with `bands.svg` and inverse buttons, the same in both themes. The glow band puts `light` beside a white reading surface.

## Accessibility checklist for any page built from this

Check contrast for any colour pairing not listed in `CONTRAST.md`. Every action needs a visible focus ring. Targets should be 44px, and never below 24px. Decorative icons get `aria-hidden="true"`. Status must be stated in words, not colour alone. Body text never goes below 16px. Copy should be checked at 390px and 1440px with real content. Respect reduced motion. Images in this kit are decorative (`alt=""`) unless they carry content. Text over an image must fit its declared region.

## Use and rebuild

```bash
node design/brand-kit/open-flow/build.mjs
```
Run this after changing `design/tokens/candidates/open-flow.json`. It regenerates `tokens.css`, `CONTRAST.md` and the generated regions of `specimen/index.html`.

`npm run design:check` runs `build.mjs --check`. It fails on stale output, any contrast pair below its minimum, or a copied asset or font whose hash changed. It also fails on an off-token literal in the specimen CSS or inline styles: hex, a px/rem/ms/vw length (negative or any case), a colour function or common named colour, a raw font stack, an unknown token, or a non-token breakpoint. It catches the same literals in `specimen.js`. Percentages, ch, deg and unitless numbers are allowed as proportions. `npm run design:test` runs `build.test.mjs`, which plants each of those failures and proves the check catches it.

To regenerate the screenshots (needs Chrome and a Playwright install; not run in CI):
```bash
node design/brand-kit/open-flow/screenshot.mjs path/to/node_modules/playwright/index.mjs
```

## Open items

- **Founder review** of this system. Adoption needs a decision record and the promotion swap described in `design/README.md`.
- **Logo.** The kit's STRALE wordmark stays a candidate (raster only, R–A–L join open). The flowing-S logo is current until the founder decides.
- **Imagery approval.** Kit-06 asset checks are `checks-pending`, and the library's approval is "not-granted". Each image used publicly needs a live copy-fit check and a rights record.
- **Dark-native artwork.** No dark-ground raster exists. Dark uses `bands.svg` and contained panels. A dark field commission is optional.
- **Missing formats** listed by the kit: small 1:1 card, sequence, 3:1 divider, 9:16 story. None blocks the website.
- **Web derivatives.** Production needs AVIF/WebP at responsive widths. The PNG masters here are 0.9–1.5 MB each.
- **Font licences:** all three families are SIL OFL (licence files in `fonts/`). IBM Plex Mono is the only family not from the kit.
- **Real-page checks** (performance, assistive technology, email and social templates) belong to the `apps/web` build, not this specimen.
