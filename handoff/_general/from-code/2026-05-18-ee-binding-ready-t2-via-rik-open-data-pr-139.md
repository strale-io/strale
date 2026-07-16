Intent: Re-investigate HR / EE / BE Phase 2/3 "blocked" classifications via 8-path DEC-20260518-E enumeration, then ship the EE outcome (binding-ready T2 via RIK Ariregister CC BY 4.0 bulk-JSON ingest) end-to-end.

## What shipped

**PR #139 — feat(t2): EE binding-ready T2 via RIK Ariregister Open Data** (squash-merged at `644c1c5`, 2026-05-18 16:32 UTC).

- New Drizzle tables `ee_directors` (PK `kirje_id`, indexes on `entity_reg_code` + `last_synced_at`) and `ee_directors_sync` (singleton row tracking upstream `Last-Modified` for idempotent re-runs).
- Migration Block 0079 in `apps/api/src/lib/startup-migrations.ts`, idempotent (`CREATE TABLE IF NOT EXISTS` + `pg_constraint` lookup before `ALTER TABLE ADD CONSTRAINT`). Behavioral tests added per DEC-20260504-A.
- Nightly ingest job `apps/api/src/jobs/ingest-ee-directors.ts`. Streams the ~45 MB ZIP → 1 GB JSON without `JSON.parse` on the whole file via a custom `JsonArrayObjectStreamer` (depth + string-state tokenizer, trim-on-yield). Uses `unzip -p` via `child_process.spawn` to avoid a Node ZIP dep — `apt-get install unzip` added to the Dockerfile. Session-scoped advisory lock 20260518 for cross-replica dedup; 1000-row batched UPSERT in per-batch transactions; sweep `DELETE WHERE last_synced_at < sync_start`. HEAD-probes `Last-Modified` to skip on no-op days. 10-min startup delay + 24h interval.
- Handler `apps/api/src/capabilities/estonian-company-data.ts` queries the cache, emits canonical `legal_representatives[]` per DEC-20260518-A. Cache miss is non-fatal (tier_1 unaffected; surfaces `tier_2_available: false` with explicit cache-not-ready reason). PIDs + DOB are documented as redacted-upstream-since-2024-11-01.
- Manifest: `cost_class: paid_prepaid` → `free_unlimited`; 6 new fields in `output_field_reliability` + matching `output_schema.properties` entries (per DEC-20260513-B consistency rule); 2 freshness/PID limitations.
- Coverage matrix: EE Tier-2 3/5 → 5/5, sourcing_pattern "Free open data", DEC-20260518-E/F/A doctrine references.
- Tier-coverage fixture hand-updated to reflect new tier_2 fields (PII scrubbed).
- 16 unit tests for the building blocks (parseEeDate, JsonArrayObjectStreamer multi-chunk + escape + braces-in-strings, shapeRow filter + edge cases) — all passing.
- `apps/api/scripts/smoke-ee-directors-parse.ts` for local/CI parse-only verification against the real dump.

**PR #140 — docs: Phase 4 exhaustive source enumeration SE + DK** (squash-merged at `c7e6ee9`, 2026-05-18 20:33 UTC). Single docs commit from worktree `agent-a9020b4c2f1bd73cd` adding `audit-output/exhaustive-enumeration-se-dk-2026-05-18.md` (590 lines). Same 8-path shape as the HR/EE/BE artifact.

**Research artifact (uncommitted on this branch but written to `audit-output/`):**
- `audit-output/exhaustive-enumeration-hr-ee-be-2026-05-18.md` — DEC-20260518-E enumeration that motivated PR #139. All three Phase 2/3 "blocked" classifications overturned:
  - HR → viable-v1 via Topograph (per-call, RFQ-required, DEC-20260428-A vendor-attestation needed).
  - EE → viable-v1 via Path 5 (bulk Open Data, FREE, no contract). Shipped in PR #139.
  - BE → viable-v1 via KBO SOAP at €0.025/call prepaid topup (NOT a monthly subscription — Phase 3 misread the pricing).

EU30 binding-ready T2: **7 → 8**.

## Smoke evidence

Parse-only smoke against real 1 GB dump (`smoke-ee-directors-parse.ts`):
- 372,041 entities streamed in 14 seconds (~26 k entities/sec, bounded memory).
- 517,355 representative rows kept post-filter.
- Bolt Technology OÜ (12417834): 2 active board members — Markus Villig (JUHL, since 2013-02-07) + Ahto Kink (JUHL, since 2021-08-06). Matches public RIK profile exactly.
- Role-code histogram: JUHL 443k, FIE 23.5k, KISIK 13.8k, LIKV 8.6k, PROK 2k. OSAN / ASUTAJA / FOOMETS filtered at ingest.

Live ingest vs prod DB explicitly deferred to post-deploy smoke per DEC-20260504-C (Block 0079 wired into verified `runStartupMigrations()` boot path; running un-merged migrations against prod from a dev session would create schema state that doesn't match deployed code).

## What's open

- **Post-deploy verification (next session, ~10 min after Railway deploy)**: curl `/v1/do` against `estonian-company-data` for Bolt Technology (12417834) and expect `tier_2_available: true` + 2 active board members. The first ingest tick fires 10 min after deploy. Check Railway logs for `ingest-ee-directors-success` with entity-count ≥ 370k and `rows_upserted` ≥ 500k.
- **HR build to-do** — `36467c87-082c-8172-a15f-db57c045bb0a`: should be flipped from "Class C" to "Topograph onboarding + DEC-20260428-A vendor attestation" per the research artifact. Chat-side decision required.
- **BE paid-vendor-onboarding to-do** — `36467c87-082c-8116-8a67-e03462235a24`: should be flipped to "KBO SOAP procurement (€50 prepaid topup, 7-day activation)". The Phase 3 "blocked" classification was a misread; the SOAP fee is a prepaid topup, not a subscription. Chat-side decision required.
- **EE RIK contract to-do** — `36467c87-082c-812c-b60d-dceca91f645f`: remains open as v1.1 upgrade path (real-time SOAP + non-redacted PIDs).
- **Active Vendor Stack page** (Notion `35367c87082c812e88d1dc6bdbfbd4f5`): needs RIK Ariregister Open Data added as active source with CC BY 4.0 attribution. Chat-side.
- **Memory entry 25**: T2 7/30 → 8/30. Could be updated.

## Non-obvious learnings

1. **The €50/2000 KBO SOAP fee is a prepaid topup, not a subscription.** FPS Economy's own wording: *"Each package entitles you to 2,000 requests and costs 50 euro."* Order packages as needed; no recurrence. Effective rate €0.025/call, passthrough-compatible per Petter's cost directive. Phase 3 had classified BE blocked on this misread. Lesson: always parse vendor pricing pages literally; "you pay X for Y requests" is per-call equivalent unless explicit recurrence wording exists.
2. **RIK redacts PIDs in open data files since 2024-11-01.** `isikukood_registrikood` and `synniaeg` are always null in the dump; only the hashed UUID `isikukood_hash` survives. Documented this in the manifest limitations and `tier_2_available_reason` so consumers don't expect DOB. Field kept null in the canonical shape for parity with NO/CZ.
3. **The upstream JSON dump is 1 GB uncompressed.** A naïve `JSON.parse` would spike Node's heap to ~3 GB and likely OOM on Railway. The custom streaming tokenizer (~50 LOC with multi-chunk + escape + brace-in-string handling) is essential. 16 unit-test cases lock down the state machine. The smoke shows the parser handles 372k entities at ~26k/sec with bounded memory.
4. **`node:20-slim` doesn't ship `unzip`.** Adding `apt-get install unzip` to the Dockerfile is required before this PR's ingest job will start. The lesson surfaced when I considered Node ZIP libs vs system unzip: shell-out is cheaper and matches the "no new npm dep" preference, but only if the base image has the tool.
5. **`makeStub` queue in startup-migrations.test.ts is positional, not call-targeted.** The migration block calls `execute()` 6 times; queue responses are consumed in order regardless of which call needs which response. To seed call #5's response, the queue needs 4 null/placeholder entries before the real response. Tripped me on first attempt at Block 0079 tests.
6. **CI gate stack on this repo is dense — 4 fix-ups required after first push.** F-0-009 `lint:no-bare-catch` (cleanup `.catch(() => {})` must `logError`); DEC-20260513-B `check-manifest-guaranteed-consistency` (every `guaranteed` field must be in `output_schema.properties`); `validate-coverage-matrix` enum (sourcing_pattern is closed-set); COVERAGE.md regen (must exclude untracked YAMLs to match CI's tracked-file scan). Recipe for future T2 PRs: run all four locally first.
7. **The Wise Estonia registry code 10947145 from the prompt's smoke target does not exist in the dump.** That was a stale reg-code, not a coverage gap. Bolt smoke is definitive. Lesson: prompt-supplied verification entities should be re-verified before treating their absence as a bug signal.
8. **`gh run watch --exit-status` falsely returned exit 1 on the first CI run** even though the `check` job ultimately succeeded — my memory note `feedback_gh_run_watch_exit_status_unreliable.md` captures this. Always re-verify with `gh run view --json conclusion`. Bit me twice this session; pattern holds.

## Cost

- Parse smoke: $0 (local Node process; no external API calls beyond the 1 GB GET from RIK CDN).
- 4 CI re-runs after fix-ups: standard.
- No paid-LLM calls; no new vendor subscriptions; no schema rollbacks needed.

## Doctrine touched

DEC-20260518-E (exhaustive enumeration — implemented for EE; HR + BE outcomes documented for future PRs); DEC-20260518-A (canonical legal_representatives[] shape — EE achieves parity with NO #136 + CZ #137); DEC-20260518-F (attribution — CC BY 4.0 preserved in handler provenance); DEC-20260428-A (Tier 1 — direct first-party government open data); DEC-20260504-A (test coverage — Block 0079 + ingest building blocks both have regression tests); DEC-20260504-B (bulk-op safety — batched UPSERT + bounded DELETE); DEC-20260504-C (deploy-mechanism — Block 0079 on the verified `runStartupMigrations()` import graph); DEC-20260513-B (manifest guaranteed-consistency — output_schema.properties added for the new tier_2 fields).
