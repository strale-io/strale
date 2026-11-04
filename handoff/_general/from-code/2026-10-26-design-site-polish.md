Intent: Apply Petter's approved kit-06 wordmark, ink/inverse primary actions and two-column homepage hero, verify and prepare a local commit; implementation and verification are complete, but the sandbox makes .git read-only, so the orchestrator must commit the prepared patch before push, PR and merge.

# Website wordmark, action hierarchy and hero

Petter approved all three on 2026-10-26 in session: “go with all three”. This is a refinement of the adopted Open Flow direction, recorded in `docs/strategy/2026-10-26-website-identity-and-hero-adoption.md`, the kit README, provenance and brand-website track register.

## Result

- Adopted `design/brand-kit/open-flow/assets/logo/wordmark.svg`, optimized with SVGO 4.1.0 to one decimal and redundant commands/nodes removed: 4,360 → 2,714 bytes. Render inspection found seven substantial ink components (smallest 9,152 pixels at native size), no stray specks. The actual supplied viewBox is 2002×338, preserved rather than the brief's 2002×336. A professional redraw remains recommended because of slightly uneven edges at large sizes.
- Shared inline `Wordmark.astro` inherits `currentColor`, is aria-hidden inside links labelled Strale, and appears at 22px in navigation and 24px in the footer. The nav link retains a 44px target. The favicon is the S mark alone and is unchanged. No generated OG/social-image lockup exists in apps/web.
- Actions and indicators now use ink on light and inverse surfaces/text in dark mode. Blue links, focus rings, chart and artwork roles remain. Outline buttons stay surface-filled with a strong border; Read the docs stays a text link.
- The homepage becomes 43% copy / 57% scattered switchboard at 1024px. It uses a smaller eyebrow and 44–56px derived headline role, one sentence, search and Read the docs; Browse tools is removed. Both columns centre within the remaining viewport. A minimum board height lets short windows grow, with fit checked at 600px and growth checked at 550px. Below 1024px the text stacks above the full-width mobile board.
- The board fits its column. Labels wrap in measured side channels, with no console or sibling-tile overlaps; horizontal-wire dots stay within their segment. The reduced-motion pause button is correctly hidden. Pause, keyboard choice and aria-live behavior were verified.

## Before and after tokens

| Token | Before | After |
|---|---|---|
| `light.action` | `#3027ff` | `#17151c` |
| `light.action-hover` | `#2118d6` | `#302c38` |
| `light.action-active` | `#1a10b0` | `#0f0d13` |
| `light.text-on-action` | `#ffffff` | `#ffffff` |
| `light.indicator` | `#3027ff` | `#17151c` |
| `dark.action` | `#3027ff` | `#f7f3fb` |
| `dark.action-hover` | `#4f47ff` | `#ffffff` |
| `dark.action-active` | `#2118d6` | `#e5dfed` |
| `dark.text-on-action` | `#ffffff` | `#17151c` |
| `dark.indicator` | `#b9b5ff` | `#f7f3fb` |

Added derived `home-hero`: 44–56px, line height 1.08, tracking −0.045em, measure 16ch. Its laptop size also responds to viewport height (48.75px at 1333×650). General hero/campaign roles remain. All source changes are in the adopted candidate and copied verbatim into the active website surface, followed by regeneration. Minimum primary-label contrast is 13.61:1 across both themes and all states.

## Verification

Authoritative receipt: `archive/receipts/2026-10-26-check-site-polish-wordmark-hero.json`.

- `apps/web`: `npm test` — PASS; `npm run check` — PASS (zero errors/warnings, two existing unused-import hints); `npm run build:preview-data` — PASS, 372 pages.
- Root: `npm run design:check` — PASS (124 contrast pairs); `npm run design:test` — PASS; `npm run programs:check` — PASS.
- Root: `npm run claims:check`, `npm run models:check`, `npm run env:check`, `npm run docs:check`, `npm run receipts:check` — PASS. The receipts checker reports existing historical bare-count warnings; these were not changed.
- `npm --workspace=packages/mcp-server run build` — PASS. `apps/api`: `npx tsc --noEmit --project tsconfig.json` — PASS. Root `npm run build` (API TypeScript build) also passed; it was invoked while orienting the live build and is separate from the web build.
- Read-only live API check: `GET https://api.strale.io/v1/platform/facts` — HTTP 200; response includes capability_counts, solution_count_active, static and as_of. No authenticated executions or production writes.
- `apps/web`: initial live `npm run build` — PASS, 435 pages. Final live build and screenshots: PASS, 435 pages in the final build (262.96s)..
- Final preview browser matrix: PASS, both requested routes at all six viewports and both themes, zero axe violations, zero horizontal overflow, zero console errors. Geometry/interaction preview: PASS, 99 checks across 12 widths/heights, all six selections, labels against every tile and console, containment, dots less than 0.15px from paths, fixed-console text fit, pause beyond its cycle, reduced motion and announcements. Final live browser results: PASS: 24 live-data page/viewport/theme cases, zero axe violations, zero horizontal overflow, zero console errors; all 99 live geometry/interaction checks passed..
- Independent working-diff review: technical GO and product GO, both rounds: 2, no remaining actionable findings. Record: `archive/sessions/2026-10-26-site-polish-review.md`.
- `git diff --check` — PASS. `npm run handoff:orient` — PASS. Final handoff gate: FAILED: dirty paths cannot be committed because .git is mounted read-only; the checker also expects this isolated clone to be main and reports a possibly stale merged remote branch. User instructions prohibit branch switching and remote writes, so neither is changed..

Development verification caught and corrected tooltip overlap, out-of-segment dots on short horizontal wires, hidden-pause CSS and 600px fit. The initial browser launch needed an explicit installed Chromium path. Temporary npm invocations from the wrong directory/workspace failed before the correct apps/web commands were run; none is reported as a pass.

## Screenshots

Full matrix and JSON reports: `apps/web/review/wordmark-hero/` (ignored local artifacts). Full-page JPG plus viewport PNG per case. Final 1333×650 paths:

- `/`: `apps/web/review/wordmark-hero/home--1333x650-light.viewport.png`, `apps/web/review/wordmark-hero/home--1333x650-dark.viewport.png`.
- `/tools/swedish-company-data`: `apps/web/review/wordmark-hero/tools-swedish-company-data--1333x650-light.viewport.png`, `apps/web/review/wordmark-hero/tools-swedish-company-data--1333x650-dark.viewport.png`.

The same folder's `report.json` records axe/status/overflow/errors and screenshot paths; `geometry-interaction.json` records the additional geometry and behavior checks. Review harnesses are retained beside those artifacts for reproduction, not added to application code.

## Files changed

- `apps/web/README.md`, `scripts/prepare-assets.mjs`, `src/components/{Header,Footer,Wordmark,SwitchboardHero}.astro`, `src/scripts/switchboard.ts`, `src/styles/{site.css,tokens.generated.css}` (paths under apps/web).
- `design/tokens/{active.json,candidates/open-flow.json}`.
- `design/brand-kit/open-flow/{README.md,CONTRAST.md,build.mjs,provenance.json,tokens.css,assets/logo/wordmark.svg,specimen/index.html,specimen/specimen.css}`.
- `docs/programs/brand-website/tracks.yaml`, the adoption record, this handoff, review record and evidence receipt.

## Remaining work and limits

No production commands are required for this UI change. Git staging failed with `fatal: Unable to create .../.git/index.lock: Read-only file system`. No local commit was created. The complete patch is `apps/web/review/wordmark-hero/site-polish.patch`, also checked for clean application against the starting HEAD in a temporary source tree. The orchestrator applies/reviews and commits it, then pushes, opens the PR and merges. The public-domain cutover remains separately reserved. Professional wordmark redraw is deferred. Automated axe and browser geometry are not a manual screen-reader or Windows hardware test; the requested CSS viewport dimensions were emulated in Chromium.

[BACKFILL] Repo handoff and review evidence are recorded. No Notion Journal write was performed by this build agent; the orchestrator can backfill it in its closeout.
