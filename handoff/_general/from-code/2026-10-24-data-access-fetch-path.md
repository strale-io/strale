Intent: DEC-20261023-A adoption, work item 1. The shared fetch path and the
customer-URL fetchers stop at a site's block, honour robots.txt and identify
as Strale on every route. (Adoption list: `docs/strategy/2026-10-23-data-access-risk-rule-proposal.md`, "On adoption" items 3 and 7.)

## What changed

- `apps/api/src/lib/site-access.ts` (new): `STRALE_USER_AGENT`, the block
  statuses (401/403/407/429), `SiteAccessRefusedError` (a
  `CapabilityRefusalError`) and `siteAccessRefusal()`. The message carries
  `SITE_BLOCK_MARKER` ("Strale stops at a site's block").
- `apps/api/src/lib/robots-txt.ts` (new): RFC 9309 parser and matcher,
  `assertRobotsAllowed()`, cached per origin (1 h; 5 min for an unreachable
  robots.txt). 4xx means allow; 5xx and 429 mean refuse. A transport failure
  allows the fetch and is not cached; that departure is recorded in the module
  header.
- Health accounting: `isAccessPolicyRefusal()` in `tos-blocklist.ts` is
  checked by `isRefusalMessage()`. The circuit breaker, `quality-capture`
  and `execution-outcome` therefore treat a site block as a refusal, and the
  taxonomy classifies it `tos_policy`, which does not count against the
  quality floor.
- `web-provider.ts`:
  - Robots.txt is checked before the first request.
  - Honest user agent on the plain fetch and on Browserless (`userAgent` in
    the body).
  - A 401/403/407/429 or a challenge page on the plain fetch is a refusal; it
    is no longer passed to the next tier.
  - A 400 is terminal.
  - Browserless's `X-Response-Code` is read, and a block there is refused
    without a retry.
  - **Jina Reader is removed from the chain**, here and in `url-to-markdown`.
    By default the hosted reader retries a non-200 fetch through its own
    rotating proxy pool, and it does not report the target's status. Checked
    in jina-ai/reader `src/api/crawler.ts` on 2026-10-24. It also ran keyless,
    so on the anonymous free tier. It is retired in `dependency-manifest.ts`
    and `config/vendors.yaml`; `jina-reader.ts` and `JINA_API_KEY` are gone.
- Executors:
  - Spoofed Chrome user agents removed: `tech-stack-detect`, `cookie-scan`,
    `email-pattern-discover` (suspended) and `linkedin-url-validate`
    (deactivated). The dead `lib/northdata.ts` was deleted; North Data is a
    never-lane aggregator.
  - Robots.txt and block refusals added to `url-to-markdown`,
    `tech-stack-detect`, `cookie-scan`, `domain-contact-extract`,
    `screenshot-url`, `html-to-pdf` and `company-enrich`.
  - Strale user agent added on the Browserless screenshot and PDF routes, and
    on `company-tech-stack`'s HEAD and `seo-audit`'s robots fetch.
  - `landing-page-roast` reads the page before taking the screenshot, so a
    refused page is never screenshotted.
  - The privacy, terms and return-policy finders stop on a site-wide block
    (`isSiteWideBlock`).
- `estonian-company-data`: removed the Browserless "EU proxy" that retried the
  registry's 403 "to bypass geo-restriction" (never lane, item 2). A block is
  now a refusal. The tool is out of the Browserless hard-require list.

## Independent review (fresh same-provider context, 2026-10-24) and what changed

- **Blocking: ReDoS in robots.txt matching.** Patterns were compiled to
  backtracking RegExps, and `/*a*a*a*b` took about 17 s on a 500-character
  path. Replaced with a linear wildcard walk; the regression test hangs on
  the old code.
- **Production Browserless is v1 (`browserless/chrome:1.61.1`), not v2.**
  Checked against the v1.61.1 source: `schemas.ts` accepts `userAgent` on
  `/content`, `/screenshot` and `/pdf`. `functions/content.js`,
  `screenshot.js` and `pdf.js` all return `x-response-code` and
  `x-response-url`, and `puppeteer-provider.ts` sets them on the response. The
  comments are corrected; no behaviour change was needed.
- **Redirects.** robots.txt is now checked again against the final URL:
  `response.url` for the plain fetch, `X-Response-URL` for Browserless.
- **Screenshots and PDFs of a block page** are now refused via
  `X-Response-Code` instead of being returned and billed. The shared helper is
  `assertRenderedTargetAllowed` in `web-provider.ts`.
- **Strale-chosen sources.**
  - A block on a source Strale chose is a `SourceBlockedError`. Its wording
    makes it count as `upstream` and lets it open the breaker, so a dead
    source cannot stay listed unnoticed.
  - `fetchCompanyPage` always uses it.
  - Marked with `source: "strale"`: the seven live readers
    `container-track`, `customs-duty-lookup`, `eu-trademark-search`,
    `gdpr-fine-lookup`, `japanese-company-data`, `price-compare` and
    `youtube-summarize`, plus the deactivated `australian-company-data`.
- **Latency.** A robots.txt transport failure is cached for 5 min, and
  concurrent checks for one origin share one request.
- **RFC 9309 fixes:** `Sitemap:` lines no longer split groups; matching
  percent-decodes both sides (the RFC's own example now matches); a BOM is
  stripped.
- **Missed fetchers.**
  - `page-speed-test` now checks robots.txt before directing Google's
    Lighthouse fetch.
  - `email-pattern-discover` checks robots.txt.
  - `domain-contact-extract` detects challenge pages.
  - `youtube-summarize` no longer falls back to Browserless after YouTube
    refuses the direct fetch.
- **Every non-block 4xx is terminal.** This is deliberate and now stated in
  `site-access.ts`. A 400 stays an ordinary "URL returned HTTP 400" failure,
  not a refusal (tested).

## Second independent review (fresh context, on the fix commit)

Nothing blocking. Fixed:
- Percent-decoding is now done per run of escapes. One invalid escape had
  switched all decoding off, so `/%73earch?q=%E9` got past
  `Disallow: /search`.
- YouTube's HTTP-200 "confirm you're not a bot" page is treated as a block,
  and the direct fetch now checks robots.txt and challenge pages.
- The URL checked against robots.txt is capped at 4,096 characters, and
  patterns are compiled once per origin. This bounds the rules × path
  matching cost: about 750 ms measured with 20,000 adversarial rules and an
  8 KB path.
- A robots.txt body that stalls after the headers is cached as a transport
  failure.
- `domain-contact-extract` now releases the body when a redirect is refused.
- The trust surfaces label a `SourceBlockedError` `upstream_error`, not
  `internal_error`.
- `container-track` says the carrier refused Strale when it did.

Documented rather than changed:
- The redirect re-check runs after the transport has followed the redirect.
  The disallowed page is requested once, but its content is never used.
- A block on a Strale source whose message carries "HTTP 403" trips the
  breaker immediately, the same as a plain HTTP 403 did before.
- `container-track` still degrades to a successful validation-only answer
  when tracking fails, so a carrier block there does not count against the
  capability. That is the product's existing design.

## Tests

- New: `lib/robots-txt.test.ts`, `capabilities/lib/web-provider-access.test.ts`
  and `capabilities/site-access-executors.test.ts`. The last includes a guard
  against any browser-engine user-agent literal under `capabilities/` or
  `lib/`.
- Fail-before check: against `origin/main` source, 35 of the 42 new
  fetch-path and executor tests fail. The 7 that pass both ways are positive
  and negative controls.
- Updated: `web-provider-limits`, `caller-url-read-limits`,
  `browserless-dependency-drift` (Jina tier gone, Estonian out of the
  hard-require set). Five suites stub `robots-txt.js`, because they test byte
  bounds, not robots.

## Open / follow-up

- **`youtube-summarize` needs a decision.** The proposal says "official API, or
  off" for YouTube. It still reads the public watch page, now with an honest
  user agent and no fallback after a refusal. Deactivating a live tool is a
  catalogue decision. The YouTube Data API's `captions.download` works only
  for a video's owner, so arbitrary videos have no official-API route.
  Recommendation: switch it off, or limit it to transcripts the caller
  supplies.

- **Not measured: which Strale-chosen sources now refuse.** EUR-Lex used to
  be rescued by Browserless after a 400 or challenge to datacenter IPs
  (`eu-regulation-search`); it now fails with the honest answer. The
  compliant route is the EUR-Lex web service or CELLAR SPARQL. The Estonian
  registry may refuse Railway's US egress; the compliant routes are an
  EU-hosted deployment or RIK open data. This sandbox could not reach
  production or the sites, so after deploy, read `tos_policy` failures per
  capability over 7 days.
- `domain-contact-extract` still returns `published_personal_addresses`. That
  needs checking against never lane item 3; it is in the social-profile-check
  PR's scope.
- Other caller-URL fetchers outside the proposal's table (meta-extract,
  link-extract, url-to-text, og-image-check, redirect-trace, page-exists and
  more) send honest Strale user agents. They do not yet check robots.txt or
  refuse on a block. Next batch.
- Screenshots and PDFs: Browserless's /screenshot and /pdf do not report the
  target's status, so a blocked page comes back as an image of the block page.
  This is one request on one route, so nothing is retried, and robots.txt is
  checked first.
