# strale.dev switch-over readiness

Written 2026-11-04, after the new site merged into `main` as one PR (strale-io/strale#892,
`3a0e2229`). Merging published nothing: no workflow deploys `apps/web`, and strale.dev still
serves `strale-frontend`. The switch-over itself is Petter's call.

**Domain (DEC-20261105-A, 2026-11-05):** the new site goes live on **`strale.io`**, and
`strale.dev` 301-redirects every path and query to it, in the same switch-over. Item 11 below
carries the domain work.

**Status, checked 2026-11-11: switched over.** The switch-over ran on 2026-11-05 at about 22:35
Swedish time: https://strale.io serves the new site, and strale.dev answered 302 that night and answers 301 now (curl, 2026-11-11) to strale.io with
path and query kept. What remains is under "After the switch" at the end of this file; the rest
of the file is the pre-switch record. The pre-switch verdict was: not ready to switch today; the
design and copy were approved and what was missing was plumbing. Sign-up, top-up, the execution record, Terms and Privacy (items 1 and 2) merged in
strale-io/strale#895. `/guides` and the rest of the list were still missing.

## Must exist before the switch (build work, no decision needed)

| # | Item | State today |
|---|---|---|
| 1 | `/signup`, `/topup` and `/audit/:id` in the new site, same behaviour, new look | **Merged** (strale-io/strale#895): `apps/web/src/pages/signup.astro`, `topup.astro` and `audit.astro`, with small browser scripts in `src/scripts/` and the tested logic in `src/lib/wallet.ts` and `src/lib/audit-record.ts`. The endpoints, request bodies, error messages, stale-response guards, sessionStorage key handling and Stripe return handling are the same as in strale-frontend. The deliberate differences are all fixes. The audit page forwards `expires_at`: the old page sent only `token`, which the API refuses for every link it issues now. It also shows its own words for a record still being prepared (202), an expired link (410) and a link that could not be loaded (400, 401, 503 or a network failure), never the API's message, and keeps "Transaction not found" for a 404. A step with no latency shows "—", and a data-source link is drawn only for an http(s) address. Top-up follows `checkout_url` only when it is https; the old page followed any value. Signup shows the balance the API returns (`wallet_balance_cents`) and says when the trial credit was withheld; the old page always said €2.00. "Download PDF" became "Save as PDF", which uses the browser's print dialogue and a print stylesheet instead of a bundled PDF library. `/audit/:id` needs the rewrite in item 8. |
| 2 | `/terms` and `/privacy`, content unchanged | **Merged** (strale-io/strale#895): `apps/web/src/pages/terms.astro` and `privacy.astro`. The text is word for word, checked word by word against the old pages, and the retention periods are still read from platform facts. One link target changed: the Terms link reading "strale.dev/capabilities" points at `/tools`. The Terms' own "we do not offer a contractual uptime SLA" tripped `claims:check`, so the `sla-commitment` row now excepts exactly that disclaimer. The four stale passages (Terms §2 "Payee Assurance product" and "Section 12", §7 "public quality endpoint", Privacy's Voyage AI row) were corrected on 2026-11-05 under DQ-45, which Petter approved as written. |
| 3 | `/guides/*` (today's `/learn/*` and `/guides/*`, merged, seven pruned) | **Built**: 48 guides at `/guides/<slug>` plus an index, ported from `/learn/*` and `/guides/*` with false or retired claims corrected; seven pruned and five country guides linked from their country pages (SITE-STRUCTURE §11). The guide redirects in `_redirects` are generated from `apps/web/src/content/guide-fates.ts` and a test keeps them equal. |
| 4 | 301 redirects from today's URLs: `/capabilities` → `/tools` (the bare path too: the Terms print "strale.dev/capabilities"), `/capabilities/:slug` → `/tools/:slug`, `/trust*` → `/security`, `/integrations` → `/docs`, `/learn/*` → `/guides/*` | **Built** (`apps/web/public/_redirects`): every route and sitemap URL of the old site ends in a page or a 301, tested; `/openapi.json` 301s to `api.strale.io`; the guide rules come from `guide-fates.ts` (item 3). Not observed on a real Pages deployment: check with `curl -I` on a preview (an audit URL must keep its query; `/capabilities/x?y=1` must 301 with the query). |
| 5 | `sitemap.xml` and `robots.txt` generated from the catalogue | **Built**: `sitemap.xml` and `robots.txt` are generated from the catalogue at build; preview builds disallow everything and carry noindex; canonical URLs match the sitemap (no `.html`). |
| 6 | `strale.dev/llms.txt`, `/.well-known/agent.json` and `/.well-known/mcp.json` | **Built**: `apps/web` emits `/llms.txt` (a short llmstxt.org-style pointer to `api.strale.io/llms.txt`, the catalogue, platform facts, OpenAPI, MCP and x402), `/.well-known/agent.json` and `/.well-known/mcp.json` (old schema kept, retired framing and the universal-x402 line removed, site host from config), and a 301 for `/.well-known/agent-card.json` to the API card. The root `claims:test` scans the rendered text against the claims register. After the first Pages deploy, `curl -I` each file and confirm `Content-Type` and a single `Access-Control-Allow-Origin: *`. |
| 7 | Umami analytics tag | **Built**: the Umami tag ships only in live builds, with `data-exclude-search` (audit tokens never reach Umami) and `data-domains` set to the site host. |
| 8 | Hosting: a Cloudflare Pages project (root `apps/web`, `npm run build`, output `dist`, Node 22) and a scheduled rebuild so prices and tool lists stay fresh | **Project created** 2026-11-05 by Petter: `strale-web`, live at https://strale-web.pages.dev, set up as instructed in session (production branch `main`, root `apps/web`, `npm run build`, output `dist`, `NODE_VERSION=22`; those settings live in Cloudflare, not in this repository). No custom domain yet: attaching strale.io is the switch-over. The `_redirects`, `_headers` and `/audit/*` rewrite were checked on that deployment with `curl` the same day. **Daily rebuild:** `.github/workflows/web-daily-rebuild.yml` calls the project's deploy hook daily at 04:17 Swedish time (05:17 in summer); the hook URL is the repository secret `CF_PAGES_DEPLOY_HOOK`. The site ships a `404.html` (`apps/web/src/pages/404.astro`), so Pages answers unknown paths, retired tool pages included, with a real 404; without it Pages serves the homepage with status 200. **The host also needs one rewrite for execution records.** The static build has a single page for every record (`dist/audit.html`), so the host must rewrite `/audit/*` to it while keeping the address, not redirect it: on Pages, the `_redirects` line `/audit/*  /audit  200`. The API issues links of the form `<FRONTEND_URL>/audit/<id>?token=…&expires_at=…` (`apps/api/src/lib/audit-token.ts`). Without the rewrite those links 404; the page also reads `/audit?id=<id>&token=…` as a fallback. **CORS:** signup and wallet calls are allowed only from the origins in `ALLOWED_ORIGINS` in `apps/api/src/app.ts` (`https://strale.dev`, `https://www.strale.dev`, `https://strale.io`, `https://www.strale.io` and the value of `FRONTEND_URL`), so they fail on a Pages preview domain. To test there, add the preview origin to the `ALLOWED_ORIGINS` array in code. **Never change `FRONTEND_URL` for a preview:** it also sets the Stripe success and cancel URLs (`apps/api/src/routes/wallet.ts`) and, unless `AUDIT_FRONTEND_URL` is set, the host of every new audit link (`apps/api/src/lib/audit-token.ts`). |
| 9 | The API surfaces that still quote the old headline switch to "New tools for your agent. No new accounts." (`openapi.ts`, `welcome.ts`, `llms-txt.ts`, `ai-catalog.ts`, `skill.ts`, `mcp-server-card.ts`) | Prepared in branch `feat/switchover-strale-io-references`; merges on switch-over day (the six surfaces already carry the L1 line there). |
| 10 | `npm run test:browser` (the `/topup` wiring in Chromium, `apps/web/test-browser/`) runs in the CI `web` job after the preview build, preceded by `npx playwright install --with-deps chromium` | **Built**: a blocking step in the CI `web` job after the preview build, preceded by `npx playwright install --with-deps chromium` (the live review step reuses that install). Passes locally; not yet observed in CI. |
| 11 | The domain move (DEC-20261105-A). Every class of strale.dev reference listed under "At the switch-over" in `docs/strategy/2026-11-05-canonical-domain-decision.md`: the `apps/web` site URL; `FRONTEND_URL` (Stripe returns and audit-link host; confirm `AUDIT_FRONTEND_URL` is unset); API response strings, OAuth metadata and email templates; hard-coded fallbacks and CI env; package, manifest, example and registry metadata; `llms.txt` and the agent and MCP cards. The MCP server's sign-up matcher must accept both domains, and be published, before the API text changes. | Prepared in branch `feat/switchover-strale-io-references`; merges on switch-over day. Inventory and classes: [SWITCHOVER-REFERENCES.md](SWITCHOVER-REFERENCES.md). Still outside the branch (class c): Railway `FRONTEND_URL` (and confirm `AUDIT_FRONTEND_URL` unset), the Cloudflare zone, Pages and strale.dev redirect work, registry listings and npm/PyPI pages (refresh only on release), the sibling `strale-frontend` `llms.txt`, re-recording fixture-bound manifests after the switch, and the Terms pricing link text. Package releases follow the merge. |
| 12 | Brand assets still from the old site: `og-image.png` (share card; reads "Verified data for AI agents", retired framing, and strale.dev) and `apple-touch-icon.png` (old four-point star) need Open Flow versions with the L1 line and strale.io. Keep a file at `/og-image.png`: `manifests/image-resize.yaml` uses it as a test input. | **Built** (2026-11-05, branch `feat/web-og-image-and-icon`): `og-image.png` (1200x630: Open Flow wordmark, the L1 headline read from `positioning.ts`, strale.io, token colours, Space Grotesk and Instrument Sans) and `apple-touch-icon.png` (180x180, the flowing A cut from the wordmark, white on `brand.deep-violet`, chosen by Petter 2026-11-05; the favicon set uses the same mark and replaces the retired S) are rendered from code by `apps/web/scripts/render-brand-assets.mjs`; provenance and hashes in `apps/web/scripts/brand-assets.provenance.json`. `favicon-32x32.png`, used by the x402 Bazaar listing, now carries the same flowing-A icon (the retired S mark is no longer used on the site). |
| 13 | HSTS `includeSubDomains` on strale.io, and `npm run test:built` (the built-output checks in `apps/web/test-built/`) in the CI `web` job | HSTS ships without `includeSubDomains` until every strale.io subdomain is confirmed HTTPS-only (not done). `test:built` is **Built**: a blocking step in the CI `web` job after the preview build. Passes locally; not yet observed in CI. |

Items 1 to 7 and 9 to 13 are session work. Item 8's build settings are session work; the
Cloudflare project and the domain are below.

## Petter's part

- **Cloudflare:** a Pages project connected to `strale-io/strale`, or a scoped API token so a
  session can create it. Free tier.
- **strale.io now:** the strale.io apex points at a Vercel project that no longer exists (HTTP 404
  `DEPLOYMENT_NOT_FOUND`, checked 2026-11-05), and strale.io is the address on every email.
  Until the switch-over, send it to `https://strale.dev` with a **temporary (302 or 307)
  redirect, never a 301**, over valid HTTPS. GoDaddy forwarding defaults to 301, and a cached
  301 would loop once strale.dev redirects to strale.io.
- **At the switch-over** (full steps in `docs/strategy/2026-11-05-canonical-domain-decision.md`):
  - Move the strale.io zone from GoDaddy to Cloudflare. Export it first and re-create every
    record before switching nameservers: `api` (DNS-only), MX, SPF, DKIM, DMARC, M365 and
    Resend records, and any Search Console TXT. Then verify mail and the API.
  - Point strale.io and www at the Pages project.
  - Redirect strale.dev on its zone. Either use a Single Redirect with a dynamic target and
    "Preserve query string" on, or a Bulk Redirect with subpath matching and query
    preservation on. Both settings are off by default.
  - Afterwards, check an audit link with `curl -I`, and file the Search Console change of
    address.
- **Two open page decisions** from SITE-STRUCTURE: whether About names the founder, and whether
  the Terms change so "For platforms" can be published (it stays unpublished until then).
- **Stale legal text:** decided 2026-11-05 (DQ-45, approved as written). The four stale sentences are corrected in `apps/web`.

## After the switch (session work)

Check every old URL in today's sitemap ends, after following redirects, in a 200 (14 retired tools may end in a 404 by design), run a free tool call from the site's
docs, compare Umami visits and sign-ups for two weeks against the fortnight before, then retire
`strale-frontend` to maintenance.

Upstream recordings that fetch strale.dev (base64-encode-url, og-image-check,
page-exists) were re-captured through the 301 on 2026-11-11 so weekly-drift
stays green. The six fixture-bound manifests still on strale.dev (those three,
plus cert-transparency-search, meta-extract and url-to-text) move to strale.io
together with an `onboard.ts --backfill` against the DB and a re-capture of
any recorded slug among them; a manifest edit alone desyncs the DB test rows.
