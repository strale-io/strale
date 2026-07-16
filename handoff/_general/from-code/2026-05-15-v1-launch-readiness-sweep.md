# Session handoff — v1 launch readiness sweep — 2026-05-15

**Intent:** Run the full empirical v1 launch readiness sweep across the 20 EU+UK+NO+CH+SG identity capabilities (Phase 1 audit), surface and triage every operational concern that audit uncovered, scout US v1 viability (Phase 3), probe SI Openapi WW-Top integration (Phase 2), and bundle the customer-DX schema-cleanup PR. End with a defensible v1 launch picture and concrete pre-launch work queue.

---

## What shipped

### Phase 1 — Identity field-coverage audit (20 of 20 countries, Phase 1 COMPLETE)

Branch: `docs/identity-field-coverage-2026-05-15`. Final commit: `8eb8c0e`.

- **Batch 1** (`2f991d2`): SE, UK, DE, SI, SG — 5 countries, surfaced DE quota exhaustion (OpenRegister 50/month free tier) and SI structural source gap (data.gov.si lacks status/regdate/NACE/directors/VAT/LEI). UK `vat_number` 0/3 mismatch identified.
- **Batch 2** (`ffc109c`): NO, DK, FR, BE, CZ — surfaced DK quota exhaustion (cvrapi.dk 50/day). **FR is the only country with empirical directors (3/3, capped at 3, true counts 15–20).** BE `industry` 0/3 mismatch flagged.
- **Batch 3** (`ec73c9d`): FI, IE, EE, PL, LV — **CKAN-thinness hypothesis REFUTED** (IE + LV both rich). 5 new schema mismatches (IE/EE/LV vat_number, PL address + regdate). 5 new free-path director-build candidates queued.
- **Batch 4** (`9a5ba15`): CH, GR, HR, LT, SK — 3 of 5 hit outage-class failures during the audit's 15-concurrent burst (CH Zefix, HR Sudreg, LT data.gov.lt Spinta). **SK is the second country with empirical full directors** (3/3 uncapped, free CC-BY 4.0 source). GR memory entry vs manifest mismatch surfaced (memory referenced HELLENiQ via PR #116 but manifest fixture is NBG branch).
- Final picture: **17 v1-ready as certified, 2 quota-managed (DE/DK), 3 transient/outage-class but now empirically working post-triage.**

### FR directors truncation — investigation + fix + ship

- Investigation doc on audit branch (`042589b`): root cause is Strale-side `.slice(0, 3)` at `french-company-data.ts:56`; upstream returns full array; the slice was kept by the 2026-05-09 doctrine sweep as "defensible payload management" but never benchmarked.
- **PR #119 merged** (commit `96ddb40` on main): raises cap to `DIRECTORS_CAP = 50`. Post-deploy verification confirms TotalEnergies SE (`542051180`) now returns 15 directors with `directors_truncated: false`. Wallet cost €0.30 (verification probes).

### LT/CH/HR outage triage — RETRACTS "do not ship LT in v1" flag

Triage doc on audit branch (`dd40aa7`). All three capabilities verified working end-to-end at session end. Root cause: clustered transient incident driven by the audit's 15-concurrent-call pattern saturating Strale's egress pool, compounded by upstream blips on Zefix (~2h) and Sudreg (~30 min). Three different upstream architectures (CKAN Spinta, REST+Basic auth, REST+OAuth2) — failures architecturally independent, shared variable was Strale's egress. **All three ship in v1.** Two operational caveats logged for v1.1+ (capability_health gateway-failure blind spot + parallel-call amplification pattern).

### capability_health blind-spot burst probe — verdict ACADEMIC for v1

Burst-probe doc on audit branch (`335c59c`). Tier 1 (5 concurrent × 3 runs, 15/15 success) + Tier 2 (10 concurrent × 2 runs, 20/20 success) + Tier 3 (15 concurrent, 9/15 + 5 Strale rate-limit 429s + 1 application 500). **The 5 pre-execution 429s did NOT update `capability_health`** — same blind-spot class as the audit's 502s (different visible symptom, same architectural cause: pre-execution failures bypass the executor-level update path). **Verdict: blind spot is academic at production-realistic load. P1 To-do stays P1 as v1.1+ work, NOT v1-launch-gate.** Wallet spend €2.20 (44 successful calls).

### Rate-limit + CA orchestration concurrency verdict

Verdict doc on audit branch (`7862a00`). **NO PRE-V1 ACTION REQUIRED.** Three findings: (a) 10 req/sec per API key is a deliberate production setting per DEC-21, not stale dev default; (b) CA-style orchestration internalises capability fan-out inside a single HTTP request via solution-executor's `Promise.all` — rate-limit gates HTTP request count, NOT internal parallelism; (c) 429s ARE logged structurally via `request-complete` Pino log line, just not metricized. Optional pre-v1 10-min win: add rate-limit-specific log emit in `lib/rate-limit.ts`.

### US Topograph 14-state scout — Phase 3

New branch `docs/us-topograph-scout-2026-05-15` (commit `34036a0`). 14 states + SAM.gov classified:
- **Free API (2):** NY (Socrata SODA), SAM.gov (free key, 1-4w lead time).
- **Free bulk download (4):** CO, FL (Sunbiz SFTP), MA, WA (CCFS CSV).
- **Mixed (1):** TX (free Comptroller API + paid SOSDirect).
- **Paid signup required (8):** DE, GA, IL, MN, NV, NJ, PA, WY.

**Total Tier 1 direct candidates: 7 of 15. Tier 2 via Cobalt: 8 of 15.** Critical: DE is the most-incorporated US state — Cobalt's DE coverage must be verified before v1 sign-off. SAM.gov key registration takes 1-4 weeks — start NOW if v1 <4w away.

### SI Openapi WW-Top probe — Phase 2

Verdict doc on audit branch (`8eb8c0e`). **Openapi does NOT close the SI directors gap.** Response schema for the 2 SI entities Openapi has (Petrol + Mercator) lacks directors/officers/representatives/shareholders fields. SI catalog coverage is partial — 5 of 7 well-known SI VATs returned 204 No Content, including Krka (canonical fixture). UTF-8 mojibake on `nativeCompanyName`. 10× slower than CKAN (~6.6s). **Verdict: KEEP CKAN as Tier-1; consider Openapi as Tier-2 enrichment for non-directors fields only (LEI, NACE, balance sheets, status, regdate).** Env var is `OPENAPI_COM_API_TOKEN_PROD` + `OPENAPI_COM_EMAIL` (not `OPENAPI_API_KEY` as prompt assumed); auth uses OAuth scope-exchange via `oauth.openapi.it/token`.

### Schema cleanup — PR #120 (awaiting chat review)

Branch `fix/schema-cleanup-eu-audit-2026-05-15`. **7 of 10 audit mismatches fixed in PR; 2 non-issues; 1 deferred:**
- UK / IE / EE `vat_number` — manifest-remove (c). Companies House / CRO / Äriregister don't return VAT.
- LV `vat_number` — added `deriveVatLV` helper, populate from regcode. `LV` + 11-digit.
- EE `business_type` — extended legalForms map to handle legacy code `"1"` = AS (audit caught Bolt + Tallink returning numeric `"1"` while Pipedrive returned label).
- PL `address` + `registration_date` — reliability downgrade `guaranteed → common` (manifest example itself shows null, was lying about reliability).
- FI manifest additive — declare `vat_number` + `website` + `industry_description` (handler returned more than manifest declared).
- BE `industry` — non-issue, already declared `rare`.
- FI "undercount" — non-issue, inverted (handler returned more); fixed via additive.
- SK `vat_number` (DIČ) — deferred (RPO `identifiers` array shape needs upstream investigation).

`npx tsc --noEmit` passes. `npx vitest run` = 665 passed, 33 skipped, 0 failed. No self-merge per Rule 16 carve-out — chat reviews customer-facing schema PR.

---

## What's open / next session priorities

1. **Chat review + merge PR #120** (schema cleanup). Post-merge verify LV Air Baltic returns `vat_number: "LV40003245752"` and EE Bolt returns `business_type: "AS (Public limited company)"`.
2. **SK DIČ surfacing** — separate prompt. Needs RPO `identifiers` array shape investigation (does it have a type field?). Pre-fix probe confirms gap exists.
3. **Notion follow-ups across 4 docs:**
   - Capability × Country Coverage Matrix — update 6 country rows for schema-cleanup, plus FR directors-cap status, plus US Topograph state classifications.
   - Active Vendor Stack — add Openapi as Tier-2 enrichment with partial-SI-coverage caveat; add SAM.gov / state SOS sources for US.
   - Internals → incident retrospective — log the parallel-call amplification pattern for future audits.
   - GR fixture/memory mismatch reconciliation.
4. **DEC-20260513-F supersession input:** all three deferred verdict docs (LT/CH/HR triage + burst probe + rate-limit) feed chat's drafting of a successor DEC. Empirically defensible "17 + 2 quota + 3 transient = 22/20 ship-able" picture.
5. **SAM.gov API key registration** — start NOW if v1 launch is <4 weeks away (1-4 week approval lead time).
6. **DE OpenRegister quota triage** — pull the May 2026 call log to determine whether the 50/month was burned by customer traffic vs health probes. DK cvrapi.dk same question (daily reset = lower stakes).
7. **PL `address` + `registration_date` picker rewrite** — moderate-scope follow-up to restore reliability to `guaranteed`. Out of scope for v1 launch.

---

## Non-obvious learnings

- **The 24h canary green-rate that DEC-20260513-F's v1-ready verdict rests on is trustworthy at production-realistic load** (proven by burst probe Tier 1 + Tier 2). The capability_health blind spot only fires at 15+ concurrent — not a real customer pattern.
- **Internal capability fan-out inside `/v1/solutions/.../execute` does NOT consume rate-limit budget.** The rate-limit middleware gates HTTP request count, not internal `Promise.all` parallelism. This single architectural fact closes the entire "CA orchestration concurrency" concern.
- **Manifest authoring needs a "honest reliability" pass.** PL was the canary — example output itself showed null for `address`/`registration_date` while the manifest declared `guaranteed`. Manifest was self-contradictory and shipped. Worth a coordinated reliability audit across all 290+ capabilities at some point.
- **Openapi WW-Top SI coverage is partial.** Krka — Slovenia's largest pharma, publicly traded — is NOT in their catalog. Don't assume vendor coverage matches catalog claims; probe specific entities before committing.
- **Auth schemes vary per Openapi product.** Their unified API uses OAuth scope-exchange (basic auth on `oauth.openapi.it/token` → scoped Bearer for the actual API). The env var naming we had (`OPENAPI_COM_API_TOKEN_PROD` + `OPENAPI_COM_EMAIL`) was correct; the prompt's `OPENAPI_API_KEY` assumption was wrong.
- **Memory drift is a real risk after PRs.** GR fixture memory entry referenced HELLENiQ via PR #116, but the actual manifest fixture is NBG branch. Treat manifests as authoritative over memory for capability-fixture questions.
- **The "free public API for US state SOS" framing was too narrow.** Reality is 4 categories (free API / free bulk / paid signup / mixed). 7 of 15 states are Tier-1-shippable, but only 2 via "free API" — 4 more via "free bulk download" require an ingest-and-index pattern (similar to LV/SI CKAN).

---

## Cost

- Phase 1 audit Batches 1-4: **€2.30** (46 successful calls)
- FR truncation verification probes: **€0.30** (6 calls during deploy poll loop — note: future fix prompts should use non-charging health endpoints to avoid this)
- LT/CH/HR triage re-probes: **€0.15** (3 calls)
- capability_health burst probe: **€2.20** (44 successful calls)
- SI Openapi WW-Top: **~€0.24-€1.08 Openapi-side** (depends on whether 204s are billed); €0 Strale-side
- US Topograph scout: **€0** (direct HTTP, no Strale calls)
- Rate-limit verdict: **€0** (read-only code investigation)
- Schema cleanup PR: **€0.05** (1 SK pre-fix probe)

**Total Strale wallet spend: ~€5.00. Total Openapi spend: ~€1.08 max.** Wallet at start: €33.99. Wallet at end: ~€29.

---

## Artifacts produced

8 docs on `docs/identity-field-coverage-2026-05-15`:
1. `apps/api/docs/identity-field-coverage-2026-05-15.md` — Phase 1 audit (4 batches)
2. `apps/api/docs/fr-directors-truncation-2026-05-15.md` — FR fix investigation
3. `apps/api/docs/lt-ch-hr-outage-triage-2026-05-15.md`
4. `apps/api/docs/burst-probe-capability-health-blind-spot-2026-05-15.md`
5. `apps/api/docs/rate-limit-and-ca-orchestration-concurrency-2026-05-15.md`
6. `apps/api/docs/si-openapi-wwtop-probe-2026-05-15.md`

1 doc on `docs/us-topograph-scout-2026-05-15`:
7. `apps/api/docs/us-topograph-state-scout-2026-05-15.md`

1 doc on `fix/schema-cleanup-eu-audit-2026-05-15`:
8. `apps/api/docs/schema-cleanup-2026-05-15.md`

2 PRs:
- PR #119 (FR directors cap fix) — **MERGED** at `96ddb40`
- PR #120 (schema cleanup, 7 fixes) — **OPEN**, awaiting chat review

3 branches awaiting chat decision on merge timing:
- `docs/identity-field-coverage-2026-05-15` (6 docs)
- `docs/us-topograph-scout-2026-05-15` (1 doc)
- `fix/schema-cleanup-eu-audit-2026-05-15` (1 PR open)
