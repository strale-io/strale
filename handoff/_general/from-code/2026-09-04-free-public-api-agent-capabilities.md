Intent: Add eight keyless, free-upstream capabilities that the platform's largest x402 buyer
currently purchases from other x402 sellers (scholarly search, developer and public-record
lookups), so that demand can be served here. Directed by Petter 2026-09-04 in session after the
customer trace (see the same day's revenue investigation: the buyer's wallet ran dry; its
off-platform basket was mapped from on-chain payment amounts against the Bazaar price lists).

## What changed

New executors in `apps/api/src/capabilities/` and manifests in `manifests/`:

| slug | upstream (official, no key) | price |
|---|---|---|
| `academic-paper-search` | OpenAlex works search (polite pool via `mailto`) | 3c |
| `paper-details` | OpenAlex work by DOI / OpenAlex id | 2c |
| `arxiv-search` | arXiv API (Atom, parsed without an XML library) | 2c |
| `pubmed-search` | NCBI E-utilities esearch + esummary | 3c |
| `hacker-news-search` | Hacker News Search by Algolia | 2c |
| `sec-edgar-filings` | SEC EDGAR submissions + ticker index (24h in-memory cache) | 3c |
| `cve-details` | NIST NVD CVE API 2.0 | 3c |
| `usgs-earthquake-search` | USGS FDSN event service | 2c |

- `apps/api/src/lib/dependency-manifest.ts`: seven new `tier: "free"` providers with cheap
  200-probes (openalex, arxiv, ncbi-eutils, hn-algolia, sec-edgar, nvd, usgs-earthquake).
- Tests: `arxiv-search.test.ts`, `academic-paper-search.test.ts`, `sec-edgar-filings.test.ts`,
  `free-public-api-capabilities.test.ts` (fetch stubbed; parsers, refusal paths, URL construction,
  output shapes). Receipt: `archive/receipts/2026-09-04-test-run-free-public-api-capabilities.json`.
- Every executor: fixed host, `AbortSignal.timeout`, `readJsonWithLimit` / `readTextWithLimit`
  from `resource-limits.ts`, structured errors, refusal before any upstream call, provenance.
- `cve-details` is deliberately not `cve-lookup`: that slug already exists (OSV, package-version
  exposure). The first draft overwrote it; restored from HEAD before commit.

## Dropped on evidence

- DefiLlama protocol detail: the per-protocol payload is 10 MB per call.
- Stack Overflow: 300 keyless requests/day, which the hourly harness alone would exhaust.
- Google Trends (the buyer's second-largest spend): the official API is still an application-gated
  alpha; every other route scrapes a Google property, forbidden under DEC-20260427-H-4. Applying to
  the alpha is a founder call (account + vendor relationship).
- Exa-style neural search: licensed vendor, needs an account (founder call).

## Verified

- Live execution of all eight via the direct registry from this machine: correct shapes,
  refusals return before upstream. Sample outputs are the manifests' `output_schema.example`.
- `tsc` clean (after `npm --workspace=packages/mcp-server run build` in the worktree).
- Gates run locally: fetch-timeout coverage, manifest guaranteed consistency, PII, tier coverage,
  cost-class coherence (quota_cap set to each vendor's derived 1-hour ceiling), no-unguarded-user-
  fetch, no-bare-catch, no-new-console, no-direct-getexecutor-in-scripts, ssrf inventory — all pass.
- `check-output-schema.ts` and `validate-capability.ts` read the database and were not run.

## Not done — needs a database write grant (AUTHORIZATION_UNAVAILABLE)

Nothing inserts a manifest into `capabilities` at boot; the only path is
`apps/api/scripts/onboard.ts`, which opens `openOperatorWriteDrizzle(autonomousAuthority(...))`
even for `--dry-run`, and no `DATABASE_URL_WRITE` exists on this machine or in the Railway
service variables. After merge, someone holding the grant runs, per slug:

    cd apps/api && npx tsx scripts/onboard.ts --discover --strict --manifest ../../manifests/<slug>.yaml

then `npx tsx scripts/validate-capability.ts --slug <slug>`. Rows land dark
(`visible=false`, `x402_enabled=false`, `lifecycle_state=validating`); the daily
`capability-promotion` job lifts them after a green week when `CAPABILITY_PROMOTION_ENFORCE=true`.

## Discovery and pricing notes surfaced by the same investigation

- Bazaar presence is earned, not configured: exactly the resources with a settled payment in the
  trailing 30 days are listed (174 of 271 today; `docs/company/coinbase-bazaar-email.md` already
  records this). Coinbase's validator accepts 262/271 v2 resources; the 9 rejected are
  `sanctions-check`, `pep-check`, `image-resize`, `c2pa-inspect`, `json-to-zod`, `json-to-typescript`,
  `json-to-pydantic`, `json-schema-validate`, `flatten-json` (all POST-body capabilities) — worth a
  look at their body-schema shape.
- x402scan and x402all both take a URL submission (`x402scan.com/resources/register`,
  `x402all.com/register`); listing there is a public act and stays founder-gated.
- The buyer pays a competitor $0.03 for plain SERP results at ~3,000 calls/month while paying
  Strale €0.10 for `google-search` at ~300; a cheaper plain-results tier is the largest pricing
  lever inside the existing catalogue.

## Independent review (fresh read-only Claude agent, 2026-09-04)

Round 1: FAIL. Must-fix, both confirmed and fixed: (1) `paper-details` built the OpenAlex path from
the raw DOI, so `10.1038/x?select=id&mailto=…` appended parameters to the upstream request — the DOI
grammar now stops at `?#&` and each path segment is percent-encoded, with a regression test;
(2) one `sec-edgar-filings` test depended on the module-level ticker cache left by the previous test —
a test seam resets it and the test seeds its own fixtures. Should-fix, both applied: the ticker index on
`www.sec.gov` is now its own health-probed provider, and the manifest declares `anyOf: [ticker | cik]`
so the route-level structured 400 fires. Receipt after fixes:
`archive/receipts/2026-09-04-test-run-free-public-api-capabilities-r2.json`.

Round 2 (fresh agent): FAIL on one remaining must-fix in the same code path — a DOI with `.`/`..`
segments (`10.1000/../../../../etc/passwd`) was collapsed by URL dot-segment normalisation and
reached the wire as `GET /works/etc/passwd` on the OpenAlex host. Fixed: a DOI is refused when any
`/`-separated segment is empty, `.` or `..`, or the id exceeds 200 characters; regression test covers
those inputs and keeps dotted suffixes like `gkab1049.v2` allowed. Round-1 items confirmed fixed.
Receipt: `archive/receipts/2026-09-04-test-run-free-public-api-capabilities-r3.json`.
