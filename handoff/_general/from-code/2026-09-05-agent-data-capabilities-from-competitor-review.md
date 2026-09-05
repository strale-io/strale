# Eight agent-data capabilities from the Working Machines catalogue review

**Intent:** Research workingmachines.dev as a competitor, then add the capabilities
that review identified as genuine gaps in Strale's catalogue.

Date: 2026-09-05
Branch: `feat/agent-data-capabilities`
Worktree: `C:\Users\pette\Projects\strale-wt-capabilities`

## What the competitor review concluded

Working Machines is an agent-to-SaaS **action** layer (the Composio / Pipedream
Connect category), not a data platform. Their published catalogue is 1,409 apps
and 14,799 action contracts, and analysing it settles the strategic question:
**1,389 of the 1,409 apps require the customer's own API key or OAuth token.**
Only 20 work without one. They sell a hand; Strale sells a source.

Scanning all 14,799 action descriptions for our vertical's vocabulary returned
**zero** actions for sanctions, PEP, AML, UBO, adverse media, LEI, insolvency and
director disqualification. Company registry: two actions, both Chinese
(Tianyancha, Qichacha). The KYB and compliance wedge is untouched by them.

Traction is not visible and there is no evidence it exists: no web-search
footprint, 0 stars/forks/watchers on their GitHub plugin, no npm package, no
named customers, "verified execution reports" that are one founder-run Codex
session, and a trust centre listing SOC 2, ISO 27001, pen tests and DPAs as
*not claimed*. It is Klei Aliaj (founder/CEO of Dialogo AI, Albania/Italy).

Full teardown: https://claude.ai/code/artifact/9c79b5f1-b629-4921-8d8f-8b02d4852411

## What shipped

Eight capabilities, all credential-free — no vendor account, no new env var, no
`env-manifest.yaml` row.

| Slug | Upstream | Price | Category |
|---|---|---|---|
| `clinical-trials-search` | ClinicalTrials.gov API v2 | 3c | data-extraction |
| `doi-resolve` | Crossref, DataCite fallback | 2c | data-extraction |
| `citation-graph` | OpenAlex | 3c | data-extraction |
| `cert-transparency-search` | Cert Spotter, crt.sh fallback | 5c | security |
| `host-exposure-lookup` | Shodan InternetDB | 5c | security |
| `breach-exposure-check` | Have I Been Pwned (keyless) | 5c | compliance |
| `fda-safety-search` | openFDA drug/device/food | 5c | data-extraction |
| `company-fundamentals` | SEC XBRL company-concept | 10c | financial |

## Three decisions inside the batch

**Semantic Scholar was rejected for `citation-graph`.** It was the obvious
source and its keyless pool returned HTTP 429 on the first live verification
run — in production that trips the circuit breaker. Rebuilt on OpenAlex, which
already backs `paper-details` and `academic-paper-search`, so no new upstream
dependency enters the platform.

**`company-fundamentals` uses the SEC directly**, not Financial Modeling Prep or
Alpha Vantage as the original recommendation suggested. Official API beats
vendor under the DEC-20260813-A preference order, it is free and keyless, and
the provenance is primary. Concept tags resolve through fallback chains because
filers migrate — Apple stopped reporting under `Revenues` in 2018.

**`breach-exposure-check` refuses `email`, `password` and `account` inputs.**
See the finding below; the refusal is covered by a test.

## Finding: capability inputs are persisted, and one manifest denied it

`transactions.input` is `jsonb NOT NULL` and `do.ts` writes `input:
executionInput` verbatim on every execution path. There is no write-time
redaction anywhere in the platform; inputs are redacted on the 90-day schedule.

`manifests/password-strength.yaml` described itself as "Password is NOT stored."
That was false for the whole life of the capability. Corrected in this batch by
narrowing the description to what is true — computed in-process, never sent to a
third party — and adding a limitation that states the retention plainly.
Narrowing demonstrably inaccurate public copy is DEC-20260822-A part 2.

This is also why `breach-exposure-check` covers only the domain endpoint. The
HIBP per-account endpoint and the Pwned Passwords range API both take a personal
identifier or a secret, and neither belongs on a rail that records its inputs.

**Follow-up worth opening: a write-time input-redaction mechanism** (a manifest
flag marking fields that must never reach `transactions.input`). Without it,
Strale cannot offer any capability whose input is itself sensitive. `pii-redact`
has the same exposure today.

## Verification

Receipt: `archive/receipts/2026-09-05-test-run-agent-data-capabilities-batch.json`

All eight executed against their real upstreams (not fixtures); all eight input
refusals fire before any upstream call; 57 unit tests; 13 planted mutations, 13
caught. Harnesses are committed and rerunnable:
`apps/api/scripts/verify-new-capabilities.ts` and
`apps/api/scripts/mutation-check-new-capabilities.mjs`.

Two upstreams signal a *result* with HTTP 404 and are handled as results rather
than faults, so a valid query cannot trip the breaker: openFDA no-match, and
InternetDB for an address it has never observed.

`tsc --noEmit` clean. `env:check`, `models:check`, `claims:check`,
`receipts:check` all pass. Manifest gates pass; all 350 manifests parse; all
eight auto-register.

## Not done, and why

**DB onboarding has not run.** `apps/api/scripts/onboard.ts` writes to the
capabilities table and no session write grant exists (`DATABASE_URL_WRITE` is
absent). The manifests and executors are complete and the pipeline is the only
remaining step:

```
cd apps/api && npx tsx scripts/onboard.ts --discover --manifest ../../manifests/<slug>.yaml
```

for each of the eight, then `npx tsx scripts/smoke-test.ts --slug <slug>`.
Until that runs the capabilities are not routable and not billable.

**Two of the ten recommended capabilities are not built.** Both need a vendor
account, which is founder-only under DEC-20260815-A:

- `passive-dns-history` — SecurityTrails (paid). No free source gives real
  historical resolution data; HackerTarget's free tier is day-limited and
  returns current records only, so shipping it would have been hollow.
- `url-threat-scan` — VirusTotal, urlscan.io and AbuseIPDB all need keys.
  URLhaus now returns 401 without one.

CT-log subdomain discovery, which was part of the original passive-DNS
rationale, is covered by `cert-transparency-search`.

## Next

1. Run the onboarding pipeline for the eight slugs (needs a write grant).
2. Founder decision on the two credential-gated capabilities.
3. Consider the input-redaction mechanism above.
4. Optional: the teardown also flags a distribution idea — Strale is exactly the
   kind of `api_key` provider their catalogue lists, and their 536-app Data
   category has nothing in compliance.
