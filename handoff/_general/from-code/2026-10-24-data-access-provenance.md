Intent: DEC-20261023-A adoption, item 2: acquisition method and the rule's lane on every answer.

# Data-access lane and acquisition method in provenance

## What changed

- New `apps/api/src/lib/data-access.ts`: the lanes (`preferred`,
  `allowed_with_checks`, `not_applicable`), the acquisition methods (the five
  from DEC-20260428-A plus `vendor_api`, `customer_directed_fetch`,
  `public_page_read`, `computed`), `parseDataAccess`, a registry, and
  `stampDataAccess`.
- On `allowed_with_checks`, each block also says `checks: recorded | pending`.
  The rule allows that lane only once its checks are recorded, so an answer
  never claims more than has been verified. `recorded` needs a `checks_note`
  with evidence. **All 115 rows on this lane are `pending`.**
  - Three review rounds each found `recorded` claims that the tool's own code
    did not support (redirect targets, challenge pages on rendered routes,
    links followed off-host, the rule's other vendor conditions).
  - A tool moves to `recorded` only in a PR that reviews every fetch it
    makes and tests it. Each pending row's `checks_note` says what is
    missing.
  - HIBP's and Alternative.me's resale terms are now `permitted` records in
    `vendor-terms.ts`; the rule's other vendor conditions remain open.
  - A call is `recorded` only when it took the path the record covers.
    Another method or vendor lowers it to `pending`, and an executor's own
    claim cannot raise it; on a lane without checks it is removed.
- Guards:
  - a vendor-backed `recorded` claim needs a `permitted` record in
    `vendor-terms.ts` for that tool (an allowlist);
  - a customer-URL `recorded` claim needs the checked fetch path in the
    executor's code, ignoring comments.
- Each active manifest (321) carries a `data_access` block. The 29
  deactivated manifests carry none: a capability in the never lane is
  switched off, not labelled.
- `auto-register` reads the block at startup. `getExecutor` stamps
  `acquisition_method`, `data_access_lane`, `upstream_vendor` and
  `data_access_checks` onto provenance where the executor left them unset. The executor wins.
- The provenance schema takes both lists from `data-access.ts`, so the enum
  cannot drift. `validateManifest` checks the block when present, and
  `data-access-manifests.test.ts` requires it on every active manifest.
- Executor labels fixed:
  - five executors used `official_api`, which is not in the enum, and now use
    `direct_api`;
  - `uk-cop-check` used `vendor_mediated_scheme` and now uses `vendor_api`
    with `upstream_vendor: esortcode`;
  - `german-company-data` said `direct_api` but calls OpenRegister, so it now
    says `vendor_aggregation` with `upstream_vendor: openregister`;
  - `email-auth-check` now says `primary_source`, since it reads DNS;
  - `keyword-rank-check`, `serp-analyze` and backlink's fallback claimed
    `source: google.com`, which Strale never calls, and now say
    `google-serper`;
  - `google-news-search` and `serp-related-questions` claimed `direct_api`
    and now say `vendor_api`/`serper`;
  - `adverse-media-check` and `backlink-check` label each path (Dilisense or
    Serper; CommonCrawl or Serper).
- The design study `design/brand-kit/quiet-material/opening` hashes three
  capability manifests. Its `manifest.json`, browser evidence and two
  screenshots were regenerated with its own unchanged build and verifier,
  on the pre-installed Chromium through Playwright's `chrome` channel. The
  measurements are identical. Any manifest edit to swedish-company-data,
  invoice-extract or email-validate will trip `design:check` again; that
  coupling is for the design session to decide.

## Classification calls worth a second look

- Vendor-mediated registry wrappers (CBEAPI, ReceitaWS, cvrapi, OpenRegister,
  Openapi, OpenMercantil, Cobalt) are `allowed_with_checks`, not
  `preferred`. The rule's preferred lane is official sources and licensed
  data, and none of these vendors' resale terms is recorded.
- Every vendor in the path means `allowed_with_checks`, `uk-cop-check` (eSortcode) included.
- DNS, WHOIS and TLS answers are `primary_source`.
- Bundled open reference lists (SPDX, UN/LOCODE) are `licensed_bulk`.
  `iban-to-bank`'s table of unrecorded origin is `computed`.

## Correction to #733

The DPIA re-review notes merged in #733 said Dilisense's "documented
redistribution licence" met the rule's vendor condition. The April research
note (`docs/research/2026-04-28-payee-assurance-build-vs-buy.md`) records
only an informal starter arrangement with vendor-granted grace; the reseller
agreement is not signed. Both DPIAs now carry a same-day correction, and
sanctions-check, pep-check and adverse-media-check are `checks: pending`.
Signing the reseller agreement is a vendor-contract decision for Petter.

## Follow-ups found (not acted on)

From the third review, all in the fetch path (adoption item 1):
- `allabolag.se` and `northdata.com` are not in `tos-blocklist.ts`, although
  never lane item 5 names them.
- Browserless redirects are re-checked for robots.txt
  (`assertRenderedTargetAllowed`) but not against the blocklist; `safeFetch`
  checks every hop.
- `screenshot-url`, `html-to-pdf` and `web-extract` read only the status
  Browserless reports, so a challenge page served with 200 is rendered.
- `domain-contact-extract`'s contact-page fetch skips the redirect and
  challenge checks its homepage fetch has; it returns phone numbers and
  social links unfiltered (check against never item 3).
- `privacy-policy-analyze` and `terms-of-service-extract` follow links to
  other hosts, with no cap.
- `html-to-pdf` with caller markup renders whatever the markup loads.

- `email-pattern-discover` returns same-domain addresses found on a homepage
  and name-based address patterns (`processes_personal_data`). Check it
  against never lane item 3; `domain-contact-extract`'s manifest calls it
  "currently suspended", but it is not in `DEACTIVATED`.
- Recordable with work:
  - Cert Spotter/crt.sh (the audit says "OK" without a clause);
  - Alchemy (the per-tool "additional functionality" judgement;
    `wallet-transactions-lookup` is closest to a pass-through);
  - Cobalt: founder email, plus the rule's no-login and no-litigation
    conditions;
  - Google PageSpeed Insights.
- `cookie-scan`'s direct fetch follows redirects without a robots check on
  the target.

- `email-deliverability-check` treats any blocklist answer as "listed",
  including Spamhaus's 127.255.255.x error codes for public-resolver
  queries, and any lookup error as "not listed". Spamhaus's free DNSBL
  terms limit commercial use; not recorded.
- `stock-quote` and `ticker-lookup` (unofficial Yahoo Finance endpoints),
  `weather-lookup` (Open-Meteo free tier), `postal-code-lookup`
  (Zippopotam) and `barcode-lookup` (Open Food Facts): terms not recorded
  in `vendor-terms.ts`.
- `domain-reputation`'s manifest `data_source` says "threat intelligence
  feeds". The executor does DNS checks plus a HEAD request to the caller's
  domain outside the checked fetch path.
- 32 customer-URL tools fetch outside the checked path, so they have no
  robots.txt or block handling. Among them: meta-extract, link-extract,
  url-to-text, uptime-check, og-image-check, the document and image
  extractors, and domain-reputation. All are `checks: pending`.
- Six executors put the source body itself in `upstream_vendor` (World Bank,
  DILA, Companies House, The Gazette, CPSC) next to `direct_api`.
- `country-trade-data`'s `data_source` says "static database", but it calls
  the World Bank API.
- CLAUDE.md's manifest template does not show `data_access` (governance
  session).
