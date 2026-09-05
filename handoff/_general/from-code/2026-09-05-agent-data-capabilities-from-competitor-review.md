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

## Independent review — FAIL, then fixed

A fresh read-only Claude agent that did not author the batch reviewed PR #582
and returned **FAIL** with five blockers. Four were real; the fifth (a red
`lint:no-unguarded-user-fetch`) had already been fixed while the review ran.
Post-review receipt:
`archive/receipts/2026-09-05-test-run-agent-data-capabilities-post-review.json`

**The one that mattered: refusals were invisible to the health machinery.**
Twenty-two refusal messages — the review counted twelve; the test written to
measure it found twenty-two — were classified `internal_error` and counted by
the circuit breaker. Three agents in a row passing a hallucinated ticker to
`company-fundamentals`, or an `email` to `breach-exposure-check`, would have
opened the breaker on a healthy capability and served every caller
`capability_unavailable`. That is the 2026-08-14 `french-company-data`
incident reproduced exactly, LESSONS families F1 and F9.

The fix is wording, because wording is what survives: the async and x402 paths
persist the message string, not the error object, so `CapabilityRefusalError`
alone would not have carried. Every message is now in the house style
(`'field' must be …`), which `capability-refusal.ts` recognises by shape.
`new-capabilities-refusal.test.ts` puts all 25 refusal sites through the three
consumers, and also asserts a genuine upstream 500 is still counted — without
that, a test proving "refusals are excused" would pass just as well if
everything were excused.

**The verification harness was itself measuring the wrong thing.** It asserted
a refusal matched a regex, never that the platform classifies it as one, so
the first receipt's "8/8 input refusals passed" was not evidence of what it
appeared to be. The harness now runs the three consumers too. Worth
remembering as a general shape: a green check that cannot fail for the reason
you care about is not evidence.

Other blockers: `cert-transparency-search` returned the **oldest**
certificates (Cert Spotter answers ascending) and reported a
`latest_certificate` from the middle of the window; two manifests declared a
`known_rate_limit` against `free_unlimited`, which `check-cost-class-coherence`
forbids — a gate that never ran in CI because the job aborted at the fetch
lint 37 steps earlier; and two fixtures asserted `not_null` on fields their own
reliability map called `common`.

Also taken from the should-fix list: `avg_latency_ms` declared from the
measured run on all eight; every timeout lowered so the worst case fits under
the 15s sync wall (`cert-transparency-search` was 45s, `company-fundamentals`
55s); a 4s ceiling on the DNS resolve that c-ares would otherwise let run
~20s; `isPrivateIpv4` now defers to `url-validator.isBlockedIp` rather than
keeping a second copy of the non-routable list that had already diverged on
multicast; and the mutation script refuses to run on a dirty tree.

**Still open from the review (not blocking):** `company-fundamentals` issues 9
to 13 SEC requests per call at concurrency 5, which can exceed the SEC's 10/s
guidance under concurrent customer calls — there is no cross-request limiter,
and an SEC IP block is not a refusal, so it would open the breaker. Worth a
shared limiter before this capability sees real traffic.

## Verification

Receipt: `archive/receipts/2026-09-05-test-run-agent-data-capabilities-batch.json`
(pre-review) and `…-post-review.json` (after the fixes above).

All eight executed against their real upstreams (not fixtures); all eight input
refusals fire before any upstream call AND are recognised by all three health
consumers; 92 unit tests; 23 planted mutations, 23 caught. Harnesses are committed and rerunnable:
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
