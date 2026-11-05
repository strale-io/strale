# DEC-20261105-A: strale.io is the main website; strale.dev redirects to it

**Decided by:** Petter, in the Strale orchestrator session on 2026-11-05: "yes,
make strale.io the main site". **Status:** active. **Resolves:**
FD-20260901-PUBLIC-DOMAIN (`docs/decisions/PENDING.md`).

## Decision

- The public website, built in `apps/web` (DEC-20260902-A), is served at
  **`https://strale.io`** (and `www.strale.io`, redirecting to the apex).
- **`strale.dev` and `www.strale.dev` answer a permanent 301** to the same path
  and query string on `strale.io`. Every link issued on strale.dev keeps
  working, including audit links (`/audit/<id>?token=…&expires_at=…`).
- It happens **at the website switch-over**, in the same step as the new site.
  Until then strale.dev keeps serving `strale-frontend`.
- Unchanged: the API at `api.strale.io` and email at `@strale.io`.

## Why

Petter recalled agreeing this when the redesign started; no record of it
existed, so this record states it. Supporting reasons, recorded by the
orchestrator when it recommended the move:

- One name for the brand: the site, the API and email all on `strale.io`.
- One disruption instead of two. The new site already changes most URLs
  (`/capabilities/*` becomes `/tools/*`), so search engines re-index either way.
- The strongest argument against: changing site and domain together means a
  drop in traffic or sign-ups cannot be attributed to one of them. Traffic is
  small enough that a before-and-after comparison would be weak evidence
  anyway.

## State on 2026-11-05

`strale.io` and `www.strale.io` resolve to Vercel and answer HTTP 404
`DEPLOYMENT_NOT_FOUND`: the address on every Strale email leads to an error
page. Until the switch-over it should redirect to `strale.dev`.

## What changes at the switch-over

Session work (tracked in `docs/programs/brand-website/SWITCH-OVER-READINESS.md`):

- `apps/web` site URL (`STRALE_SITE_URL`, which sets canonical links and the
  sitemap) becomes `https://strale.io`.
- API: `FRONTEND_URL` (Stripe return URLs and the host of new audit links) and
  the CORS allow-list (`ALLOWED_ORIGINS` in `apps/api/src/app.ts`) gain
  `strale.io`; `strale.dev` stays on the CORS list while redirected traffic
  drains.
- Every surface that names strale.dev: package READMEs and metadata, registry
  manifests (`server.json`, `smithery.yaml`, `glama.json`, `context7.json`),
  `llms.txt`, the agent and MCP cards, platform facts, and the claims register.

Petter's work:

- DNS for `strale.io` and `www.strale.io` to the new Cloudflare Pages project.
- The `strale.dev` redirect (a Cloudflare redirect rule or bulk redirect on the
  strale.dev zone; Pages `_redirects` cannot redirect a whole domain).
- Search-engine change of address (Google Search Console) after the switch.

## Reversal

Point `strale.io` back at nothing and remove the strale.dev redirect; the old
site stays deployed until it is retired. A 301 is cached by browsers and search
engines, so a reversal after weeks is slow, which is why this was a founder call.
