Intent: rebuild the home hero to Petter's 2026-11-02 brief: centred text with the switchboard animation below it, impressive on his Surface Pro laptop window first, then scaled up for large screens, and never losing the animation on small screens.

# Website: centred hero, laptop-first (2026-11-02)

**Brief (Petter, in session):** "I don't think the hero section looks good on small screen sizes and it has lost the animations that make it look interesting when we made it smaller. I suggest we try a design where the hero text is centred and the animations follow below." The site is to be optimised for his Surface Pro laptop screen, then scaled up for larger screens, with Tilja's responsive approach as the reference.

**Target sizes.** Tilja's records give the measured, maximised Surface Pro browser as 1270×686, after an earlier 1270×630. The hero is designed against 1270×686, then checked at 1280×800, 1440×900, 1920×1080, 2560×1440, 1024×700, 768×1024, 390×844 and 320×700.

## What changed (`apps/web/src/components/SwitchboardHero.astro`, `apps/web/src/scripts/switchboard.ts`)

- **Copy is centred at every width.** Order: eyebrow, two-line headline, a one-line lead on desktop, then the search box with "Read the docs" beside it.
- **From 1024px the switchboard is a wide band below the copy.** Three tools sit on each side, routed into the console in the middle, with tool names under the tiles. The band is one design field (1120×300 at scale 1) scaled as a unit, from about 0.86 at 1024 to 1.29 at 1920 and wider. The headline size follows window height as well as width, so the copy and the whole band share one laptop window. At 1270×686 the band ends at 664px.
- **Below 1024px the six tools sit in one row,** and each wire drops straight into the console top. The lit route and the travelling packet are kept on tablets and phones. Previously everything below 1024px fell back to a button grid with no circuit.
- **Mobile console height** is measured by the script: the tallest of the six example results, sized once per layout. At 320–390px wide, longer results previously spilled out. The fixed height also stops the page below from jumping as the calls change.
- **Floating tags are replaced** by always-visible tool names.

## Evidence

- Playwright screenshots at every size above, plus a run through all six tools at 1270×686, 1024×700, 768×1024, 390×844 and 320×700. Console overflow is false for all six tools at every size.
- Mid-animation frames confirm the packet travels in both layouts. Dark mode was checked at 1270×686 and 390×844.
- No horizontal overflow at any size.
- apps/web: `npm test` 21/21 and `astro check` 0 errors.
- `design:check` has no findings in the hero. Its six `ALLOWLIST_GROWTH` findings are on `apps/api` files and come from this stack being behind `main`.
- The screenshots were taken from a `STRALE_SITE_DATA=manifests` dev server with the preview banner removed. A live build passed on the parent branch.

## Next

- **Inspect every homepage section at 1270×686 the same way** (Petter's point 2), then scale each up. Tilja's measured rule is worth adopting: every section fits the window (1280×800 and 1440×900, header included), measured in the browser.
- **Bring the website stack (#725 → #736 → this) up to date with `main`.**

## Second pass: every home section fits the Surface Pro window

Each section was measured at 1270×686: section height plus the 64px header, against the window. Before: jobs 1,198px, company data 1,130px, pricing 876px. After, every section fits:

| Section | Height |
|---|---|
| Hero | 621 |
| Jobs | 593 |
| One call | 456 |
| Company data | 621 |
| Pricing | 570 |
| Call to action | 402 |

Every section also fits at 1280×800, 1440×900 and 1920×1080.

- **Section padding (1024px and up)** follows the window height, as Tilja's does: `clamp(48px, 9svh, section-space)`, about 62px at 686px tall. The "One call" section's larger padding scales the same way.
- **Jobs.** The art stands beside the copy and the whole card is the link. "Browse all jobs" moved up beside the heading, and the lead runs on one line. Home cards use a new short `card` line in `content/jobs.ts` that restates part of the full `line`; the catalogue keeps the full line.
- **Company data.** Two equal columns: copy and the two cards on the left, countries and the button on the right. The chips are more compact on desktop. The art is dropped from 1024px up; on phones it still leads the section.
- **Pricing.** "Pricing in full" sits beside the heading, the art is beside each card title, and the rows are tighter.
- **Phones.** Layouts are unchanged apart from the company-data order and the pricing title row, both checked at 390×844.

## Inner pages and large screens (later, same day)

- Inner pages at 1270x686 (tools, company data, pricing, use cases, docs,
  security, about): page heads are consistent (title, lead, art at right) and
  fit the first screen with the next block starting above the fold. Long
  reference sections (tool list, coverage table, sub-processors) are taller
  than one screen by nature; nothing overflows or clips. No change made.
- Home at 1920x1080 and 2560x1440: every section fits. The hero pill sat 20px
  under the nav at every height because the board grows to fill; cd86ac11
  makes that padding height-aware (686: 20px unchanged, 900: 28px, 1080:
  35px). At 2560 CSS px the content stays at the 1440px container, which is
  the token cap; growing past it would need a new token and decision.
- Next: Petter's view of the hero on #892, then the narrow-screen (390, 768)
  pass on the inner pages.

## Petter's preview feedback, 2026-11-03 (fec804e0)

Applied: roomier hero (copy with its own space, taller switchboard band below,
no one-window fit), home section padding 96-160px by height, light theme only
(switch removed), no hairline between differently coloured sections, smaller
footer wordmark with the link columns grouped right and the currency note
removed, slower scroll reveals (~1s, 40px rise). Preview page (private):
https://claude.ai/artifact/Cbduab7jNroiqXwYrTJkvj, regenerated from
apps/web/dist by copying the homepage assets with relative paths.
Next: Petter's next look; then carry the spacing to the inner pages.
