# strale.dev switch-over readiness

Written 2026-11-04, after the new site merged into `main` as one PR (strale-io/strale#892,
`3a0e2229`). Merging published nothing: no workflow deploys `apps/web`, and strale.dev still
serves `strale-frontend`. The switch-over itself is Petter's call (FD-20260901-PUBLIC-DOMAIN).

**Verdict: not ready to switch today.** The design and copy are approved; what is missing is
plumbing. Sign-up, top-up, the execution record, Terms and Privacy (items 1 and 2) are built on
`feat/web-functional-pages` and wait for review and merge. `/guides` and the rest of the list
are still missing.

## Must exist before the switch (build work, no decision needed)

| # | Item | State today |
|---|---|---|
| 1 | `/signup`, `/topup` and `/audit/:id` in the new site, same behaviour, new look | **Built, not merged** (branch `feat/web-functional-pages`): `apps/web/src/pages/signup.astro`, `topup.astro` and `audit.astro`, with small browser scripts in `src/scripts/` and the tested logic in `src/lib/wallet.ts` and `src/lib/audit-record.ts`. The endpoints, request bodies, error messages, stale-response guards, sessionStorage key handling and Stripe return handling are the same as in strale-frontend. The deliberate differences are all fixes. The audit page forwards `expires_at`: the old page sent only `token`, which the API refuses for every link it issues now. It also shows its own states for a record still being prepared (202) and an expired link (410), and "—" for a step with no latency. Signup shows the balance the API returns (`wallet_balance_cents`) and says when the trial credit was withheld; the old page always said €2.00. "Download PDF" became "Save as PDF", which uses the browser's print dialogue and a print stylesheet instead of a bundled PDF library. `/audit/:id` needs the rewrite in item 8. |
| 2 | `/terms` and `/privacy`, content unchanged | **Built, not merged** (same branch): `apps/web/src/pages/terms.astro` and `privacy.astro`. The text is word for word, checked word by word against the old pages, and the retention periods are still read from platform facts. One link target changed: the Terms link reading "strale.dev/capabilities" points at `/tools`. The Terms' own "we do not offer a contractual uptime SLA" tripped `claims:check`, so the `sla-commitment` row now excepts exactly that disclaimer. Some text is stale, and changing it is Petter's call: Terms §2 "Payee Assurance product"; §2 "Section 12" (the changes clause is §11); §7 "public quality endpoint" (deleted with the SQS engine); and Privacy's Voyage AI row (search no longer uses embeddings, DEC-20261026-A). |
| 3 | `/guides/*` (today's `/learn/*` and `/guides/*`, merged, seven pruned) | Missing; the footer links to `/guides`. |
| 4 | 301 redirects from today's URLs: `/capabilities/:slug` → `/tools/:slug`, `/trust*` → `/security`, `/integrations` → `/docs`, `/learn/*` → `/guides/*` | Not written (SITE-STRUCTURE "Today's site → new site"). |
| 5 | `sitemap.xml` and `robots.txt` generated from the catalogue | Not generated yet. |
| 6 | `strale.dev/llms.txt`, `/.well-known/agent.json` and `/.well-known/mcp.json` | Not in the new site. The old ones carry retired trust framing and a false "all capabilities via x402" line, so they are rewritten, not copied. |
| 7 | Umami analytics tag | Not in the new site; without it the switch-over has no before/after numbers. |
| 8 | Hosting: a Cloudflare Pages project (root `apps/web`, `npm run build`, output `dist`, Node 22) and a scheduled rebuild so prices and tool lists stay fresh | Not set up. Creating the project is free; it needs the Cloudflare account. **The host also needs one rewrite for execution records.** The static build has a single page for every record (`dist/audit.html`), so the host must rewrite `/audit/*` to it while keeping the address, not redirect it: on Pages, the `_redirects` line `/audit/*  /audit  200`. The API issues links of the form `https://strale.dev/audit/<id>?token=…&expires_at=…` (`apps/api/src/lib/audit-token.ts`). Without the rewrite those links 404; the page also reads `/audit?id=<id>&token=…` as a fallback. **CORS:** signup and wallet calls are allowed only from `https://strale.dev` and `https://www.strale.dev` (`apps/api/src/app.ts`). On a Pages preview domain they fail unless that origin is added to `FRONTEND_URL` or the allow-list. |
| 9 | The API surfaces that still quote the old headline switch to "New tools for your agent. No new accounts." (`openapi.ts`, `welcome.ts`, `llms-txt.ts`, `ai-catalog.ts`, `skill.ts`, `mcp-server-card.ts`) | Waits for the switch, by design (MESSAGING-LEVELS L1). |

Items 1 to 7 and 9 are session work. Item 8's build settings are session work; the
Cloudflare project and the domain are below.

## Petter's part

- **Cloudflare:** a Pages project connected to `strale-io/strale`, or a scoped API token so a
  session can create it. Free tier.
- **The switch itself:** point strale.dev at the new project. One-way and public, so it stays
  his click. Rollback is pointing it back at `strale-frontend`, which stays deployed.
- **Two open page decisions** from SITE-STRUCTURE: whether About names the founder, and whether
  the Terms change so "For platforms" can be published (it stays unpublished until then).

## After the switch (session work)

Check every old URL in today's sitemap answers 200 or 301, run a free tool call from the site's
docs, compare Umami visits and sign-ups for two weeks against the fortnight before, then retire
`strale-frontend` to maintenance.
