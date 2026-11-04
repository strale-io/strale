# strale.dev switch-over readiness

Written 2026-11-04, after the new site merged into `main` as one PR (strale-io/strale#892,
`3a0e2229`). Merging published nothing: no workflow deploys `apps/web`, and strale.dev still
serves `strale-frontend`. The switch-over itself is Petter's call (FD-20260901-PUBLIC-DOMAIN).

**Verdict: not ready to switch today.** The design and copy are approved; what is missing is
plumbing. The new site links to five pages it does not have yet, so switching now would break
sign-up and top-up for every visitor.

## Must exist before the switch (build work, no decision needed)

| # | Item | State today |
|---|---|---|
| 1 | `/signup`, `/topup` and `/audit/:id` in the new site, same behaviour, new look | Missing. The header, pricing, docs and use-case pages all link to `/signup`; the footer links to `/topup`. |
| 2 | `/terms` and `/privacy`, content unchanged | Missing; the footer links to both. |
| 3 | `/guides/*` (today's `/learn/*` and `/guides/*`, merged, seven pruned) | Missing; the footer links to `/guides`. |
| 4 | 301 redirects from today's URLs: `/capabilities/:slug` → `/tools/:slug`, `/trust*` → `/security`, `/integrations` → `/docs`, `/learn/*` → `/guides/*` | Not written (SITE-STRUCTURE "Today's site → new site"). |
| 5 | `sitemap.xml` and `robots.txt` generated from the catalogue | Not generated yet. |
| 6 | `strale.dev/llms.txt`, `/.well-known/agent.json` and `/.well-known/mcp.json` | Not in the new site. The old ones carry retired trust framing and a false "all capabilities via x402" line, so they are rewritten, not copied. |
| 7 | Umami analytics tag | Not in the new site; without it the switch-over has no before/after numbers. |
| 8 | Hosting: a Cloudflare Pages project (root `apps/web`, `npm run build`, output `dist`, Node 22) and a scheduled rebuild so prices and tool lists stay fresh | Not set up. Creating the project is free; it needs the Cloudflare account. |
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
