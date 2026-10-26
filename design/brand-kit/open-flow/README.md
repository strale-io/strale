> **Adopted 2026-10-24 by Petter (DEC-20261024-B).** The candidate's status is `adopted` and its values are the `website` surface of `design/tokens/active.json`; `apps/web` builds from that surface. Where the text below says "candidate" or "not adopted", read it as the status before 24 October.

> **Revised to 0.2, Daylight, on 2026-10-25 by Petter (DEC-20261025-A).** The light canvas is white and the light tinted surfaces are paler and cooler, so colour appears only in the artwork, the primary action and illustrations. The kit's no-loop rule is narrowed to ambient-only: a slow loop is allowed in the home Switchboard hero and the pulsing status dots, and lists and copy stay still. Spot illustrations live in `apps/web/src/assets/illustrations/` with their briefs in `provenance.json`. Kit colours, type, spacing and the dark theme are unchanged.

> **Revised to 0.3 on 2026-10-26, on Petter's direction that day** ("some of the fonts … especially for ordinary text, should be slightly smaller … revisit our entire font sizing framework"). Running text is one step smaller: body 16–17px (kit 16–19), lead 17–19, compact 16 (kit 16–17), detail 16–18 (kit 17–20), small 13–14. The kit's 16px floor for reading text is kept, so phones read as before and the change shows from tablet width up. Headings, label, UI, code and stat sizes are unchanged. Measures are set from a target line length rather than a raw ch count: Instrument Sans sets about 1.55 characters per `ch`, so the kit's 62ch body ran to about 95 characters a line; body is now 45ch (about 70 characters), compact 46ch and lead 44ch. Revised kit roles are tagged `derived` with the kit's sizes and measure kept in `kit_original`. Section rhythm is 64 / 80 / 96 (was 64 / 96 / 128), and the content container steps up to 1320 at 1600px and 1440 at 1920px (new breakpoints `2xl` and `3xl`). 0.3 also adds the Switchboard `circuit` and `circuit-grid` roles (connector lines stand clear of the board grid; the connector meets 3:1 on the board in both themes) and `layout.viewport.height` (`--viewport-height`, the small viewport height the home hero fills).

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

**Carried over unchanged from kit-06:** the eleven kit colours (`brand.*`, except `brand.image-ground`, which is sampled from the artwork), Space Grotesk and Instrument Sans, the type roles hero, campaign, section, detail, body, compact and label (sizes, weights, leading, tracking, measure; 0.3 made body, compact and detail smaller, see above), the 8px control radius, the 1600ms and 2200ms reveal durations, the no-loop and reduced-motion rules, the artwork, and the reading regions the kit declared for it.

**Derived here (the kit doesn't have them):** the whole dark theme; interaction, status, code and chart colours; the subhead, lead, ui, small, code, stat and numeric type roles; IBM Plex Mono for code; the spacing scale, radius scale, elevation, grid, containers and breakpoints; motion easings and short durations; every component and section pattern. The kit calls its component specimens "a starting point, not a complete interactive library". It has no dark theme, and its logo rule records no reversed or dark-background logo asset. Those gaps are filled here.

**The page canvas is white (`#ffffff`) since 0.2.** In 0.1 it was `#fdf7fe`, the pink-lilac ground sampled from `wide.png`, which made every page read pink. That ground is kept as `--brand-image-ground` for the raster artwork only. Cards on the white canvas are set off by their border and a light shadow.

## Principles

1. **Colour carries recognition. Ink and light surfaces carry information.** Blue, violet and teal belong to the artwork, the logo stage, links, focus rings and charts. None of them signals state on its own.
2. **One message per section.** A section opens with a statement, then explains. Add detail by grouping it, never by shrinking type below its role.
3. **Artwork stays whole.** Each image is composed for one format. Show it at its own ratio, uncropped. Put text only in the reading region the kit declared. If copy doesn't fit there, put the text beside the image.
4. **States are words plus colour.** Every status has an icon and a label. Focus is always a visible 2px ring.
5. **The reading surface never moves.** Graphics reveal in place and settle. Since 0.2 a slow ambient loop is allowed only in the home Switchboard hero (which has a Pause control and holds while the pointer or focus is in it) and in the pulsing status dots; everything else reveals once. Loading indicators repeat while loading.

## Colour

Petter approved ink primary buttons, inverse buttons in dark mode and ink/light indicators on 2026-10-26 ("go with all three"). Blue stays on links, focus rings, artwork, charts and brand stages. Outline buttons keep a surface background and strong border; the hero documentation action is a quiet text link. Approval record: [website identity and hero adoption](../../../docs/strategy/2026-10-26-website-identity-and-hero-adoption.md).

Components use **role tokens** only (`--canvas`, `--text`, `--action` and so on). Each role resolves per theme. Brand tokens (`--brand-*`) are for artwork stages, identity and the inverse button, nowhere else.

| Role | Light | Dark | Use |
|---|---|---|---|
| `--canvas` | #ffffff | #130d21 | Page background |
| `--surface` | #ffffff | #1c1530 | Cards, panels, inputs |
| `--surface-sunken` | #f6f6f9 | #0f0a1b | Alternate sections, disabled fields, inline code |
| `--surface-soft` | #f4effa | #2a1d40 | Editorial emphasis, with dark text |
| `--surface-blue` / `--surface-teal` | #eef0ff / #e8f5f2 | #1f1a4a / #0f2a2a | Grouped information, the recommended column, icon tiles |
| `--surface-inverse` | #29164b | #29164b | CTA band, section statement. Light text only |
| `--text` / `--text-muted` | #17151c / #5c5468 | #f7f3fb / #bdb4cc | Reading text / secondary text. Both pass AA on every surface above |
| `--border` | #d2cfd8 | #3a3050 | Decorative dividers only |
| `--border-strong` | #7a7287 | #857a9c | Input and control boundaries (3:1 on every surface) |
| `--action` / `--action-hover` / `--action-active` | #17151c / #302c38 / #0f0d13 | #f7f3fb / #ffffff / #e5dfed | Ink primary with white label in light; inverse primary with ink label in dark. All states exceed AA |
| `--action-subtle` | #e4e8ff | #241f5c | Hover and selected backgrounds |
| `--link` / `--focus` | #3027ff | #b9b5ff | Links, focus rings, icon accents |
| `--indicator` | #17151c | #f7f3fb | Ink / light-text selected-tab and current-page underline, checkbox and radio fill (3:1) |
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

Refined to 0.4 under Petter’s 2026-10-26 website-polish instruction. Sustained reading stays at 16px; compact reference and interactive text use 15px. Interactive labels never use the smaller metadata roles. General hero and campaign sizes are unchanged. Petter approved the smaller `home-hero` role for the two-column homepage on 2026-10-26.

| Role | Family | Size (px, fluid 360→1440) | Use |
|---|---|---|---|
| `hero` | Space Grotesk 600 | 36–76, lh 1.04, −0.045em, 16ch | One per page, in the hero shell |
| `home-hero` | Space Grotesk 600 | 44–56, lh 1.08, −0.045em, 16ch | Home hero from 1024px; campaign size below |
| `campaign` | Space Grotesk 600 | 30–52 | Inner-page h1, major statement |
| `section` | Space Grotesk 600 | 24–32 | h2 |
| `subhead` | Space Grotesk 600 | 18–22 | h3, card titles |
| `detail` | Instrument Sans 600 | 16–18 (kit 17–20, revised 0.3) | h4, group headings |
| `lead` | Instrument Sans 400 | 16–18, 44ch | Intro paragraph |
| `body` | Instrument Sans 400 | 16, lh 1.6, 45ch | Reading text, never below 16 |
| `compact` | Instrument Sans 400 | 15, 46ch | Cards, tables, reference |
| `ui` | Instrument Sans 500 | 15 | Buttons, nav, tabs, labels |
| `small` | Instrument Sans 400 | 13 | Helper text, metadata, legal. Never the only carrier of essential content |
| `label` | Instrument Sans 600 | 12, +0.06em | Eyebrows, badges. Sentence case |
| `code` | IBM Plex Mono 400 | 13, lh 1.55 | Code, identifiers |
| `stat` | Space Grotesk 600, tabular | 36–56 | A single headline number |
| `numeric` | Instrument Sans 500, tabular | 16 | Prices, counts, latency. Right-aligned in columns |

Space Grotesk introduces and Instrument Sans explains. Use at most two weights in one composition. Sustained reading is left-aligned. Only a short, self-contained statement may be centred. Never typeset the logo in either font. `small` (13px) is a derived deviation from the kit's 16px floor. It is allowed only for metadata and helper text, never for reading text.

## Space, radii, elevation, layout

- **Spacing:** 0, 2, 4, 8, 12, 16, 20, 24, 32, 40, 48, 64, 80, 96, 128, 160. Named stacks: tight 8, base 16, loose 24, group 32, block 48, heading-before 96, heading-subsection 48 and heading-after 16. Content sections use at least heading-before above their opening h2; the smaller heading-after keeps it attached to the following content. Heading-led subsections use heading-subsection (48px, previously 24px). Existing larger section padding is preserved.
- **Radii:** tag 4, control 8 (kit), card 12, media 20, pill.
- **Elevation:** four levels (0–3). Cards rest at 1, hover lifts to 2, menus sit at 3. On dark, elevation also raises the surface colour, because a shadow alone doesn't read there.
- **Layout:** containers 1200 (content; 1320 from 1600px and 1440 from 1920px, 0.3), 1320 (wide), 720 (prose). Grid 4 / 8 / 12 columns at 0 / 768 / 1024px. Gutters 16 / 24 / 32. Section rhythm 64 / 80 / 96 (0.3; was 64 / 96 / 128). Breakpoints 640, 768, 1024, 1280, 1600, 1920. Mobile first. Measures: body 45ch, lead 44ch (0.3; were 62ch and 52ch), section 28ch, hero 16ch.
- **Controls:** 36 / 44 / 52px heights. Primary actions and navigation use 44px targets or larger. Compact controls (small buttons, chips, code tabs, segmented control, theme switch) are 36px. Nothing interactive goes below the WCAG 2.2 floor of 24px. Borders 1px. Focus ring 2px with 2px offset.

## Motion

Durations: fast 120ms (colour and border), base 200ms (elevation, disclosure), slow 320ms (panel entrance), reveal-signature 1600ms (bands), reveal-atmosphere 2200ms (glow or field). Easing `standard` for state changes, `reveal` for reveals only. Reveals open a clip region over artwork that stays still. Text never slides in, with one exception since 0.2: the home headline rises in word by word, once, on load. Pointer micro-interactions (a slight lean on primary buttons, an arrow nudge, a light under the pointer on cards, a lift on chips, a sheen across primary buttons, an underline growing on nav links) respond to the pointer and never run on their own. Ambient 9000ms (one example call in the home Switchboard) is the only content loop; the status dots pulse at reveal-atmosphere. Spinners and skeletons repeat only while something is loading. Under `prefers-reduced-motion` every duration becomes 0, reveals show their final frame, ambient loops stop and the spinner stops.

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

**Spot illustrations (Open Flow 0.2, Daylight, set v2, 2026-10-26).** The site's spot art in
`apps/web/src/assets/illustrations/` is one matched set: the same camera (a gentle
three-quarter view from slightly above), the same light (soft key from the upper left, one
contact shadow), satin ribbons in blue, violet and teal with pink-lilac highlights, and matte
white objects. Every image is a transparent PNG converted to WebP with alpha, so it stands on
light and dark surfaces with no plate behind it. Each image's full brief and hash are in that
folder's `provenance.json`. To add one, reuse the shared brief from an existing entry, change
only the subject sentence, generate with ChatGPT image generation through the Codex CLI on the
founder subscription (`codex exec --skip-git-repo-check -s workspace-write "<brief>" < /dev/null`;
stdin must be closed), check it on white and on deep violet side by side, then convert
(1024px wide, WebP quality 86, alpha kept) and record it in `provenance.json`.

## Components

Every component is in the specimen with its states. State classes (`is-hover`, `is-focus`, `is-active`) exist only so the specimen can show states side by side. A real page gets state from `:hover`, `:focus-visible`, `:active`, `disabled`, `aria-*` and data.

| Component | Variants | States shown | Rules |
|---|---|---|---|
| Navigation | desktop bar with disclosure menu; mobile menu button with in-page panel | current page, hover, open, theme switch | Escape closes and returns focus. An outside click closes. The menu opens in the page, not as a modal. Adopted kit-06 STRALE wordmark, ink in light and inverse in dark |
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

- **Home Switchboard hero (approved by Petter on 2026-10-26).** From 1024px, a 43% copy / 57% board split, with smaller eyebrow and 44–56px headline, one sentence, search, then a quiet documentation link. Vertically centred in the remaining viewport with a minimum diagram height so short windows scroll. Below 1024px copy precedes the full-width mobile board. No Browse tools button.
- **Artwork hero shell (other pages).** On light: `wide` full-bleed. From 1024px, the slots (eyebrow, headline, one sentence, two actions) sit inside its reading region. Below 1024px the text stacks above the whole image. On dark: the same slots, with `bands.svg` anchored bottom-right.
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

`npm run design:check` runs `build.mjs --check`. It fails on stale output, any contrast pair below its minimum, or a copied asset or font whose hash changed. It also fails on an off-token literal in the specimen CSS or inline styles: hex, a px/rem/ms/vw length (negative or any case), a colour function or common named colour, a raw font stack, an unknown token, or a non-token breakpoint. `specimen.js` may only toggle classes and attributes: it fails if the script sets inline styles or contains a hex colour or a px/rem/em/vh/vw length. Percentages, ch, deg and unitless numbers are allowed as proportions. `npm run design:test` runs `build.test.mjs`, which plants each of those failures and proves the check catches it.

To regenerate the screenshots (needs Chrome and a Playwright install; not run in CI):
```bash
node design/brand-kit/open-flow/screenshot.mjs path/to/node_modules/playwright/index.mjs
```

## Open items

- **Founder review** of this system. Adoption needs a decision record and the promotion swap described in `design/README.md`.
- **Logo.** The kit-06 STRALE wordmark was adopted by Petter on 2026-10-26 ("go with all three"), as a vector trace pending a professional redraw. Use `assets/logo/wordmark.svg` with `currentColor`: ink on light and inverse on dark, sized by height (22px nav, 24px footer). The trace has slightly uneven edges at very large sizes; a professional redraw is recommended later. The S-only favicon is retained.
- **Imagery approval.** Kit-06 asset checks are `checks-pending`, and the library's approval is "not-granted". Each image used publicly needs a live copy-fit check and a rights record.
- **Dark-native artwork.** No dark-ground raster exists. Dark uses `bands.svg` and contained panels. A dark field commission is optional.
- **Missing formats** listed by the kit: small 1:1 card, sequence, 3:1 divider, 9:16 story. None blocks the website.
- **Web derivatives.** Production needs AVIF/WebP at responsive widths. The PNG masters here are 0.9–1.5 MB each.
- **Font licences:** all three families are SIL OFL (licence files in `fonts/`). IBM Plex Mono is the only family not from the kit.
- **Real-page checks** (performance, assistive technology, email and social templates) belong to the `apps/web` build, not this specimen.
