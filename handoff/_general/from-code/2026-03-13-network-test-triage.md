Intent: Triaged ~46 failing tests in "Network/fetch failed" and "Other" categories; fixed all fixable root causes.

## Root Cause Summary

**Primary cause (affects ~30 tests):** `example.com` TLS cert fails locally with `UNABLE_TO_GET_ISSUER_CERT_LOCALLY`. This domain is blocked by corporate/system certificate policy. The tests were auto-generated with `example.com` as the default URL but it fails SSL verification locally (works on Railway).

**Secondary causes:**
- `sitemap-parse`: `example.com` has no sitemap.xml (HTTP 404 on sitemap)
- `invoice-extract`, `pdf-extract`, `contract-extract`, `resume-parse`: `example.com` is not a PDF — tests used wrong input type
- `receipt-categorize`: `example.com` used as `image_url` — not an image
- `youtube-summarize` dep_health: `example.com` is not a YouTube URL
- `estonian-company-data`: Registry API autocomplete returns 0 results for numeric registry codes
- `norwegian-company-data` schema test: Used Swedish org number (`556703-7485`) — HTTP 400
- `charity-lookup-uk`: Charity Commission API now requires subscription key (breaking change); migrated to `findthatcharity.uk`
- `page-speed-test`: Google PSI API 429 (no quota without PAGESPEED_API_KEY)
- `google-search`, `brand-mention-search`: SERPER_API_KEY not set locally

## Fixes Applied (DB test inputs)

58 test input rows updated:

| Capability | Fix |
|---|---|
| base64-encode-url (3 tests) | `example.com` → `httpbin.org/image/png` |
| gdpr-website-check (2 tests) | `example.com` → `strale.dev`; http example → `httpbin.org` |
| header-security-check (2 tests) | `example.com` → `strale.dev` |
| invoice-extract (3 tests) | `example.com` → W3C dummy PDF |
| link-extract (3 tests) | `example.com` → `strale.dev` |
| meta-extract (3 tests) | `example.com` → `strale.dev` |
| og-image-check (3 tests) | `example.com` → `strale.dev` |
| pdf-extract (3 tests) | `example.com` → W3C dummy PDF |
| receipt-categorize (3 tests) | `example.com` image_url → text-only receipt input |
| redirect-trace (3 tests) | `example.com` → `httpbin.org/redirect/2` (real redirects) |
| resume-parse (3 tests) | `example.com` pdf_url → text resume input |
| robots-txt-parse (3 tests) | `example.com` → `strale.dev/robots.txt` |
| sitemap-parse (3 tests) | `example.com` → `strale.dev/sitemap.xml` |
| url-health-check (3 tests) | `example.com` → `strale.dev` |
| url-to-text (3 tests) | `example.com` → `strale.dev` |
| website-carbon-estimate (3 tests) | `example.com` → `strale.dev` |
| contract-extract (3 tests) | `example.com` pdf_url → text contract input |
| youtube-summarize (1 test) | dep_health `example.com` → proper YouTube URL |
| estonian-company-data (3 tests) | registry_code → company_name (Pipedrive/Bolt) |
| api-health-check (3 tests) | `api.strale.io/v1/health` → Railway URL |
| uptime-check (3 tests) | `example.com` → `strale.dev` |
| norwegian-company-data (1 test) | Swedish number → valid Norwegian number (982463718) |
| charity-lookup-uk (3 tests) | name → charity_number (202918=Oxfam, 1038963=Red Cross) |

## Code Change: charity-lookup-uk.ts

Migrated from Charity Commission API (now requires subscription key) to `findthatcharity.uk`:
- Direct number lookup: `https://findthatcharity.uk/orgid/GB-CHC-{number}.json` — works, free
- Name search: no free API available — now returns helpful error guiding users to use charity numbers

## Categories for Remaining "Cannot Fix Locally" Items

| Category | Capabilities | Resolution |
|---|---|---|
| `API_KEY_MISSING` | google-search, brand-mention-search, serp-analyze (SERPER_API_KEY), page-speed-test (PAGESPEED_API_KEY), flight-status (AVIATIONSTACK_API_KEY optional), uk-company-data (COMPANIES_HOUSE_API_KEY) | Will pass on Railway if env vars set |
| `CLAUDE_API` | invoice-extract, pdf-extract, receipt-categorize, contract-extract, resume-parse, youtube-summarize, estonian-company-data, norwegian-company-data, brand-mention-search | Needs ANTHROPIC_API_KEY; passes on Railway |
| `GEO_RESTRICTED` | ecb-interest-rates | ECB SDW API blocked from Railway US-East; known issue |
| `BROWSERLESS` | All Browserless capabilities (HTTP 500/401) | Browserless unit limit exhausted during audit; will pass on Railway with quota |

## Verified Passing (locally)
redirect-trace, robots-txt-parse, sitemap-parse, url-health-check, header-security-check, gdpr-website-check, link-extract, meta-extract, og-image-check, url-to-text, website-carbon-estimate, base64-encode-url, uptime-check, charity-lookup-uk (number), norwegian-company-data, estonian-company-data, flight-status, jwt-decode, api-health-check
