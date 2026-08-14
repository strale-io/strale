Intent: empirically map Strale's identity-leg ("company-data") production output across the 20 live-in-production country integrations, score each against the canonical Counterparty Assurance 13-field schema, and close the "does Strale return directors?" v1-launch question definitively per country.

## What shipped

20 production calls against `https://strale-production.up.railway.app/v1/do` using the repo test API key; ~€0.95 from the test wallet (16 × ~€0.05 success + 3 retries; failures didn't debit). Artifacts at `c:\tmp\strale-output-map\`.

- **16 of 20 returned 200 with usable data.** Tier distribution: 2 CLEAR (FR, GR), 5 THIN-USABLE+ (SE, NO, FI, CZ, HR), 4 THIN-USABLE (UK, IE, BE, CH), 5 THIN-RISKY (PL, EE, LV, LT, SG).
- **4 of 20 failed** in distinct ways — see §"Open" below.
- **Directors question definitively answered:** **2 of 16 return directors today (FR, GR). 13 are fixable via executor-output mapping. 1 (SG) is not on the free path (requires paid BizFile+ API).**

## Open (require Petter)

Four failure modes, two of them v1-launch blockers as currently advertised:

1. **DE (BLOCKER):** OpenRegister free-tier (50 req/mo) quota exhausted. 402 Payment Required. **DE is currently 100% broken in production until next quota cycle or paid-tier upgrade.** [smoke-test.md §2](c:\tmp\strale-output-map\smoke-test.md).
2. **SI (BLOCKER):** capability file + manifest both exist in repo (`apps/api/src/capabilities/slovenian-company-data.ts`, `manifests/slovenian-company-data.yaml`, not in DEACTIVATED list) but the slug is NOT in the production DB. `no_matching_capability` error on /v1/do. Onboarding pipeline never ran. Fix: `npx tsx scripts/onboard.ts --backfill --manifest manifests/slovenian-company-data.yaml`.
3. **DK (architectural, non-blocking):** cvrapi.dk quota exceeded, surfaces as `execution_failed` + structured details. **NOT the documented circuit-breaker fail-fast shape** per DEC-20260506-D — there's no `capability_unavailable` error_code, no `circuit_state: open`, no `next_retry_at`. The breaker storage (`capability_health`) exists but the DK handler isn't checking it. User isn't charged, so this isn't a wallet-integrity issue, but downstream orchestrators relying on `capability_unavailable` won't catch this.
4. **SK (post-launch fix):** `api.statistics.sk` upstream timeout at 15s, surfaces as generic `internal_error` with no upstream context. Same issue affects GR on rate-limit-collision (one of the GR calls also returned `internal_error` after 15s before retry-200). Structured `upstream_timeout` / `upstream_unavailable` error codes are needed per the DEC-19 stable error-code enum.

## Non-obvious learnings

- **Response envelope is `{ result: { output, provenance, … }, meta: { audit } }`** — NOT `{ output }` as I initially assumed. `result.output` is the country-specific payload. Took me one tool call to discover this empirically after my scorer matched zero fields on all 16 responses.
- **No shared schema across country handlers.** Only `company_name` is universal. Every other canonical field uses a different key name per country (`org_number` / `business_id` / `company_number` / `cro_number` / `siren` / `enterprise_number` → wait, BE uses `registration_number` / `krs_number` / `ico` / `registry_code` / `reg_number` / `company_code` / `oib` / `uen` / `uid` / `gemi_number` + `afm`). Strale's Counterparty Assurance normalizer must implement a 20-row mapping table. Same is true for address shape (structured object SE/SG; flat string everywhere else).
- **`directors` is mostly in the upstream source already, just not mapped to output.** 13 of 14 currently-empty country integrations could surface directors with executor-output mapping (most countries already have the data in the upstream response; HR for example appears to fetch but not surface — verify). Aggregate effort ~3-5 engineering days for the full sweep.
- **PL has a registeredAddress mapping bug.** Address comes back as empty in the canonical response despite the upstream KRS API returning it. Pure output-mapping bug, not a source gap.
- **LT is the thinnest live country (3/7 required fields).** Address missing entirely; no NACE, no VAT, no directors. Worth a focused executor-fix sprint if LT matters for v1.
- **GR `internal_error` masked a rate-limit hit.** The `greek-company-data.ts` executor has explicit "GEMI API rate limit exceeded (8 req/min)" error mapping, but the exception didn't propagate through; got caught as generic `internal_error`. Bug to track down.

## Side-agent failure mode (worth recording)

I spawned a `feature-dev:code-explorer` agent in parallel to write `c:\tmp\strale-output-map\discovery.md`. Per the task transcript, it completed all 60+ required file reads (full architecture mapped correctly) but then entered a 700-second prose-about-calling-the-Write-tool loop without ever issuing an actual Write tool call. Completed with status `completed`, zero output files produced.

I produced the discovery.md myself from the data the agent surfaced in its loop-text body. **Process-level finding:** when delegating "research + write the artifact," the brief should include an explicit success criterion ("after writing, list the file") AND distinguish research-tool-call budget from write-tool-call budget. The 40-call cap in my brief was consumed by reads; agent had no headroom-visibility on the deliverable.

Documented in `c:\tmp\strale-output-map\discovery.md §8`.

## Cost

- 20 base + 3 retries = 23 calls against `/v1/do`.
- ~€0.95 from test wallet (~€0.05/call × 19 billable; failures didn't charge).
- External pay-per-use: €0 (all sources are free open-data or already-paid quota-bound free tiers).
- Test wallet balance post-run: ~€11.45 (started €12.45).

## Files produced

- `c:\tmp\strale-output-map\coverage-matrix.md` — 16-country × 13-field matrix + enrichment table + tier distribution
- `c:\tmp\strale-output-map\smoke-test.md` — 4 failures characterized + recommended fixes + critical-vs-post-launch classification
- `c:\tmp\strale-output-map\directors-availability.md` — per-country directors answer + 13-country fix list (prioritized by effort)
- `c:\tmp\strale-output-map\gaps.md` — per-country missing-field analysis + cross-cutting observations (LEI/contacts/VAT)
- `c:\tmp\strale-output-map\discovery.md` — persistent infrastructure findings (invocation pattern, response envelope, name-lookup support, error shapes, DK breaker behavior, methodology rule 2 extension to prompt content, side-agent failure mode)
- `c:\tmp\strale-output-map\discovery.json` — structured form
- `c:\tmp\strale-output-map\{cc}\` — raw response JSON per country (16 successes + 3 retries + 4 failure-payloads)

## Suggested next steps (Petter's call)

1. **Before v1 launch comms:** resolve DE OpenRegister quota (paid tier or circuit-breaker pattern), run SI onboarding pipeline. Both are required for the audit doc to honestly claim 20 live.
2. **Optional but high-leverage pre-launch:** the 13-country directors-mapping sweep (~3-5 engineering days; most are pure output-mapping fixes). Otherwise v1 ships with "directors available for FR and GR only, on request for others" framing.
3. **Architectural follow-up (post-launch acceptable):** wire DK quota-exceeded through the documented circuit-breaker pattern so subsequent calls fail-fast as `capability_unavailable`. Same pattern for SK + GR `internal_error` → structured `upstream_timeout` / `upstream_unavailable`.
4. **PL address-mapping bug fix:** small, isolated, worth fixing before v1 launch (PL is currently THIN-RISKY 4/7 mostly because of this bug — fixing it elevates to THIN-USABLE+).
5. **LT thin-data sprint:** if LT matters for v1, executor-side work to surface address + NACE + directors from the Spinta data source.
