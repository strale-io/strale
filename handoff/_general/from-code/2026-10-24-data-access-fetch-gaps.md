Intent: close three fetch-path gaps of DEC-20261023-A adoption item 1 that the third review of #734 found.

# Fetch-path gaps closed

- **Commercial aggregators blocked on the customer-URL route.** `allabolag.se`,
  `northdata.com` and `northdata.de` are in `tos-blocklist.ts` (never lane
  item 5: "even per call"). Strale stopped calling them itself under
  DEC-20260427-I. Until this change a caller could still point any of the
  URL tools at them.
- **Browserless redirects are held to the blocklist.** Chrome follows
  redirects itself, so `safeFetch`'s per-hop blocklist never saw them.
  `assertRenderedTargetAllowed` now checks `X-Response-URL` with
  `assertTargetAllowed`, alongside the existing robots.txt check.
- **Rendered routes with no plain tier look first.**
  - Chrome can run a JavaScript challenge to completion before the page is
    read, which is getting around a block.
  - `assertPlainPreflightAllowed` makes a plain, ranged GET
    (`bytes=0-8191`) with the Strale user agent. It refuses a block status,
    a challenge (on any status) and a robots-disallowed redirect, and leaves
    transport failures to the render.
  - It runs before Browserless when tier 1 did not: `skipFallback`
    (web-extract) or a non-default `waitUntil`. `screenshot-url`,
    `html-to-pdf` (URL mode) and `company-enrich` call it too.
  - It follows redirects as Chrome does (up to 20), so a long chain ending
    on a challenge is seen.
  - On the `fetchPage` route a non-block 4xx is terminal, as in tier 1,
    except 416, which a ranged GET can draw by itself. The preflight itself
    refuses only blocks and challenges, so a screenshot or PDF of a 404 page
    behaves as before.
  - Any undici transport failure ("fetch failed": DNS, connect, TLS, a
    malformed response) and any timeout is left to the render. Strale's
    own refusals are plain Errors and are passed on. A connection-time
    SSRF refusal is rethrown as its cause, so its "restricted address"
    message reaches the failure taxonomy.
  - Cost: one plain request per call on those routes, no vendor cost.
- **Tests.** Six regression tests, each failing with its fix reverted. Two
  suites that queue Browserless responses on the global `fetch` mock
  (`web-extract-resilience`, `screenshot-url`) answer the ranged preflight
  separately.

Still open from the same review:
- `domain-contact-extract`'s contact-page fetch skips redirect and challenge
  checks, and it returns phone numbers and social links unfiltered (never
  item 3).
- `privacy-policy-analyze` and `terms-of-service-extract` follow off-host
  links.
- `cookie-scan`'s redirect target has no robots check.
- `email-pattern-discover` needs a never item 3 decision.
