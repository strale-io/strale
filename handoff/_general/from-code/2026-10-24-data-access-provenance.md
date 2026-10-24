Intent: DEC-20261023-A adoption, item 2: acquisition method and the rule's lane on every answer.

# Data-access lane and acquisition method in provenance

## What changed

- New `apps/api/src/lib/data-access.ts`: the lanes (`preferred`,
  `allowed_with_checks`, `not_applicable`), the acquisition methods (the five
  from DEC-20260428-A plus `vendor_api`, `customer_directed_fetch`,
  `public_page_read`, `computed`), `parseDataAccess`, a registry, and
  `stampDataAccess`.
- Each active manifest (321) carries a `data_access` block. The 29
  deactivated manifests carry none: a capability in the never lane is
  switched off, not labelled.
- `auto-register` reads the block at startup. `getExecutor` stamps
  `acquisition_method`, `data_access_lane` and `upstream_vendor` onto
  provenance where the executor left them unset. The executor wins.
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
- `uk-cop-check` is `preferred` (Pay.UK scheme via a licensed participant).
- DNS, WHOIS and TLS answers are `primary_source`.
- Bundled open reference lists (SPDX, UN/LOCODE) are `licensed_bulk`.
  `iban-to-bank`'s table of unrecorded origin is `computed`.

## Follow-ups found (not acted on)

- `email-deliverability-check` treats any blocklist answer as "listed",
  including Spamhaus's 127.255.255.x error codes for public-resolver
  queries, and any lookup error as "not listed". Spamhaus's free DNSBL
  terms limit commercial use; not recorded.
- `stock-quote` and `ticker-lookup` (unofficial Yahoo Finance endpoints),
  `weather-lookup` (Open-Meteo free tier), `postal-code-lookup`
  (Zippopotam) and `barcode-lookup` (Open Food Facts): terms not recorded
  in `vendor-terms.ts`.
- `domain-reputation`'s manifest `data_source` says "threat intelligence
  feeds"; the executor does DNS checks only.
- CLAUDE.md's manifest template does not show `data_access` (governance
  session).
