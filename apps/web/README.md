# apps/web — the strale.dev redesign

The new public website (DEC-20260902-A), built from the adopted site structure, messaging and Open Flow design system (DEC-20261024-B). It is not live: strale.dev still serves `strale-frontend` until the founder-reserved public cutover (FD-20260901-PUBLIC-DOMAIN in `docs/decisions/PENDING.md`).

| Read | For |
|---|---|
| `docs/programs/brand-website/SITE-STRUCTURE.md` | Page set, sections, data sources per page |
| `docs/programs/brand-website/MESSAGING-LEVELS.md` | The L1/L2/L3 lines and what each may claim |
| `design/brand-kit/open-flow/README.md` | Components, imagery rules, accessibility checklist |
| `docs/company/claims.yaml` | Claim rulings; `npm run claims:check` scans `src/` |

## How it works

Astro, static output. Every catalogue fact on a page — tools, prices, countries, free tools, x402 eligibility, test dates — is read at build time; nothing is typed into a page.

- `src/lib/site-data.ts` is the only data entry point. `STRALE_SITE_DATA=live` (the default) reads the production API at `STRALE_API_BASE` (default `https://api.strale.io`): `/v1/platform/facts`, `/v1/capabilities`, `/v1/solutions`, `/x402/catalog` and the trust batch endpoint. A failed read fails the build.
- `STRALE_SITE_DATA=manifests` builds a **preview** from this repository's `manifests/` for environments that cannot reach the API. Visibility, x402 eligibility and USD prices are approximated and bundled checks are absent. Every preview page carries a banner and `noindex`. Never publish a preview build.
- Fields the API does not expose (output-field reliability, example inputs) come from `manifests/<slug>.yaml`. Constants the site must state (free-tier daily limit, minimum top-up, price cap) are read from the API source by `src/lib/code-facts.ts`.
- Editorial data lives in `src/content/`: the positioning sentence, the job groups visitors filter by, and the slug-to-country map. `npm test` fails when a manifest category, country or example slug is not placed.

## Design

Styles use tokens only. `src/styles/tokens.generated.css` is generated from the `website` surface of `design/tokens/active.json` (`npm run design:web-tokens` at the repo root). `src/styles/site.css` holds the shared components, derived from the Open Flow specimen. From the repo root, `npm run design:check` refuses hex, px/rem/ms literals, raw font stacks, unknown tokens and non-token breakpoints anywhere in `src/` (`.css`, `<style>` blocks and literal `style=""`), and fails if the generated token file is stale.

Fonts, the adopted kit-06 wordmark and the vector bands are copied from `design/` into `public/` by `scripts/prepare-assets.mjs` before every dev or build run; raster artwork is imported from `design/` through `astro:assets`, which emits resized WebP.

## Commands

```bash
npm ci
npm run dev                  # live data
STRALE_SITE_DATA=manifests npm run dev
npm run build                # live data, into dist/
npm run build:preview-data   # preview data, into dist/
npm test                     # editorial and helper tests
npm run check                # astro check (types)
node scripts/review.mjs --playwright <path-to-playwright>   # screenshots 1440/390 × light/dark + axe, into review/latest
```

Working notes (2026-10-26):

- `npm run dev` on live data fetches the catalogue on every render and can hang; to look at
  the site, `npm run build` (about 4.5 minutes, around 440 pages) then
  `npx astro preview --port 4321`. Stop the preview before rebuilding, and never run two live
  builds at once: the API answers 429.
- For a fast look at layout only, `STRALE_SITE_DATA=manifests npm run build`; that build has
  no bundled checks or test results.
- Screenshots for review: `scripts/review.mjs`, or Playwright from this folder's
  `node_modules` with `channel: "msedge"`. Scroll the page once before a full-page shot, or
  the scroll-reveal blocks below the fold are still waiting.
- Tool names and descriptions come from `manifests/` (canonical), everything else from the
  live API.

CI (`.github/workflows/ci.yml`, job `web`) runs the tests, the type check and a preview build on every code PR, then a non-blocking live build whose screenshots and accessibility report are uploaded as the `web-review` artifact. CI never deploys the site.

## Deployment

Not configured from this repository. When Petter approves a cutover, the intended host is Cloudflare Pages (DEC-20260902-A) with root directory `apps/web`, build command `npm run build`, output `dist`, and Node 22. A scheduled rebuild keeps catalogue data fresh; that schedule, the domain and the redirects from today's URLs (`/capabilities/:slug` → `/tools/:slug` and the rest of SITE-STRUCTURE's carry-over table) are part of the cutover plan, not of this app.
