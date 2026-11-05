# DEC-20261105-A: strale.io is the main website; strale.dev redirects to it

**Decided by:** Petter, in the Strale orchestrator session on 2026-11-05. He
first said that when the website redesign was first discussed, "we also decided
that we would move the website from strale.dev to strale.io and just have
strale.dev point to strale.io". No earlier record of that was found. Asked to
confirm, he said: "yes, make strale.io the main site". **Status:** active.
**Resolves:** FD-20260901-PUBLIC-DOMAIN (`docs/decisions/PENDING.md`).

## Decision

- The public website, built in `apps/web` (DEC-20260902-A), is served at
  **`https://strale.io`**. `www.strale.io` redirects to the apex.
- **`strale.dev` and `www.strale.dev` answer a permanent 301** to the same path
  and query string on `strale.io`. Every link issued on strale.dev keeps
  working, audit links (`/audit/<id>?token=…&expires_at=…`) included. The audit
  token is an HMAC over the transaction id and expiry
  (`apps/api/src/lib/audit-token.ts`), not tied to the host.
- **The strale.dev redirect is permanent.** strale.dev stays registered, renewed
  and redirecting indefinitely. Published npm and PyPI READMEs, issued audit
  links, sent emails and installed MCP and CLI versions carry strale.dev and
  cannot be recalled.
- The move happens **at the website switch-over**, in the same step as the new
  site. Until then strale.dev keeps serving `strale-frontend`.
- The API host (`api.strale.io`) and the mailboxes (`@strale.io`) stay the same.
  Their DNS records move with the strale.io zone (see below).

## Why

The supporting reasons below are the orchestrator's, recorded when it
recommended the move. They are not Petter's words.

- One name for the brand: the site, the API and email all on `strale.io`.
- One disruption instead of two. The new site already changes most URLs
  (`/capabilities/*` becomes `/tools/*`), so search engines re-index either way.
- The strongest argument against: changing site and domain together means a
  drop in traffic or sign-ups cannot be attributed to one of them. Traffic is
  small enough that a before-and-after comparison would be weak evidence
  anyway.

## State on 2026-11-05

- strale.io's DNS is at GoDaddy (nameservers `ns71`/`ns72.domaincontrol.com`);
  strale.dev's is on Cloudflare.
- The strale.io apex answers HTTP 404 `x-vercel-error: DEPLOYMENT_NOT_FOUND`: it
  points at a Vercel project that no longer exists, and strale.io is the address
  on every Strale email. `www.strale.io` was seen both as the same Vercel 404 and
  as an expired certificate depending on the network path; re-check it before
  acting. The apex sends HSTS (`max-age=63072000`), so browsers that visited it
  require valid HTTPS on it.
- The strale.io zone carries live records that must survive any change:
  `api.strale.io` CNAME to Railway plus `_railway-verify.api` TXT; MX to
  Microsoft 365 (`strale-io.mail.protection.outlook.com`), the M365 verification
  TXT and `autodiscover` CNAME; SPF (`include:secureserver.net
  include:send.resend.com -all`); DMARC (`p=quarantine`); Resend's
  `resend._domainkey` TXT and the `send.strale.io` MX and SPF.

## Until the switch-over (Petter)

Fix the dead strale.io page with a **temporary redirect (302 or 307) to
`https://strale.dev`, never a 301**, served over valid HTTPS. GoDaddy forwarding
defaults to a permanent 301. Browsers cache a 301 indefinitely, and once
strale.dev starts redirecting to strale.io at the switch-over, anyone who cached
a strale.io → strale.dev 301 would loop (ERR_TOO_MANY_REDIRECTS).

## At the switch-over

Session work (tracked as item 11 in
`docs/programs/brand-website/SWITCH-OVER-READINESS.md`):

- **The site:** the `apps/web` site URL (`STRALE_SITE_URL`, which sets canonical
  links and the sitemap) becomes `https://strale.io`.
- **API config:** `FRONTEND_URL` becomes `https://strale.io`. It sets Stripe's
  return URLs and the host of new audit links. Confirm `AUDIT_FRONTEND_URL` is
  still unset, or set it to strale.io as well. The CORS allow-list
  (`ALLOWED_ORIGINS` in `apps/api/src/app.ts`) picks up strale.io through
  `FRONTEND_URL`, so no code change is needed there.
- **Every strale.dev reference in API responses, emails and fallbacks:**
  - Response strings and URLs: error `fix`/`docs_url`, free-tier and upgrade
    sign-up links, auth, verify `methodology_url`, OAuth metadata and the
    connector sign-up link, the x402 Bazaar `iconUrl`, `openapi.ts`,
    `welcome.ts`, `a2a.ts`.
  - Transactional email templates.
  - Hard-coded fallbacks: `audit-token.ts`, `dispute.ts`, the test setup, and
    `FRONTEND_URL` in the CI workflows.
- **The outbound User-Agent URL** (`lib/site-access.ts` and per-capability UAs)
  is a deliberate choice. It still resolves through the 301, so it may stay.
- **Published packages and listings:** `packages/*` metadata and strings, 17
  `manifests/*.yaml`, `examples/`, registry manifests (`server.json`,
  `smithery.yaml`, `glama.json`, `context7.json`), `llms.txt`, the agent and MCP
  cards, and `docs/claude-connector-listing.md`.
- **The MCP server's error matcher** (`packages/mcp-server/src/tools.ts`) looks
  for `https://strale.dev/signup` in the API's text. It must accept either
  domain, and be published, before the API text changes. Otherwise installed
  versions show a doubled sign-up sentence.
- **The Terms show "strale.dev/…" as link text.** Changing it is a Terms text
  change and goes with Petter's open Terms decision.

Petter's work:

1. **Move the strale.io zone to Cloudflare.** Cloudflare Pages serves an apex
   domain only from a Cloudflare zone.
   - Export the full GoDaddy zone first.
   - Re-create every record listed under "State" on Cloudflare before switching
     nameservers. `api` must be DNS-only (grey cloud), not proxied, unless that
     is a deliberate choice.
   - Keep a Search Console verification TXT if one exists (none was public on
     2026-11-05); otherwise verify strale.io in Search Console after the move.
   - After the nameserver switch, verify MX, SPF, DKIM, DMARC and the API.
2. **Point `strale.io` and `www.strale.io` at the Pages project.**
3. **Redirect strale.dev on its Cloudflare zone.** Pages `_redirects` cannot
   redirect a whole domain, so use either:
   - a Single Redirect with the dynamic target
     `concat("https://strale.io", http.request.uri.path)` and "Preserve query
     string" on; or
   - a Bulk Redirect with "Subpath matching" and "Preserve query string" on.

   Both are off by default. Without them, audit links lose their token.
4. **After the switch:** `curl -I` a real audit URL on strale.dev and confirm a
   single 301 to the same path and query on strale.io, and that the page loads.
   Then verify both domains in Google Search Console and file the change of
   address.

Old paths take two hops after the switch: `strale.dev/capabilities/x` →
`strale.io/capabilities/x` → `strale.io/tools/x`. That is acceptable. The
`_redirects` map in `apps/web` will implement the second hop on strale.io
(readiness item 4).

## Reversal

1. Remove the strale.dev redirect rule and point strale.dev back at
   `strale-frontend`, which stays deployed until it is retired.
2. **strale.io keeps serving a site itself**: the Pages project, or
   `strale-frontend` too. It never redirects back to strale.dev. Browsers that
   cached the strale.dev → strale.io 301 would otherwise loop.

A 301 is cached by browsers and search engines, so a reversal after weeks is
slow. That is why this was a founder call.
