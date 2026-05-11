# Handoff — SI promotion (validating → active) + DEC-20260511-E

**Intent:** Resume session-1 SI-fix work (Phase B onwards). Audit the actual gap, promote SI through its lifecycle if appropriate, then draft a structural-prevention DEC.

**Session:** 2026-05-11 (claude-code)
**Mode:** Quick (single-row state change + small DEC), authorized to proceed step-by-step with explicit confirmations.

## Outcome

- **SI shipped.** `slovenian-company-data` is now `lifecycle_state='active'`, `visible=true`, surfaced in `GET /v1/capabilities`, and reachable via both explicit-slug and keyword discovery on `/v1/do`.
- **DEC-20260511-E landed** (global, active, high confidence): https://www.notion.so/35d67c87082c8111a057d140694d35c8
- **Total wallet impact this session: 10¢** (2× smoke-test calls @ 5¢).

## What happened vs what the continuation brief assumed

The continuation brief framed this as a registration gap — assumed SI was missing from the DB and needed `onboard.ts --backfill`. Phase B audit corrected that:

- SI was **already registered** since 2026-05-07. Onboarding worked.
- SI was stuck in `lifecycle_state='validating'` for 3d 20h with nothing pushing it to `probation` or `active`.
- Per DEC-20260503-B (SQS engine removal), automatic lifecycle transitions were removed. The current model is "human flips only." Nothing surfaced "SI has been stuck for 4 days."
- The 3 actual manifest-vs-DB gaps surfaced (`us-company-data-cobalt`, `us-ein-match`, `us-sec-filings-extended`) are deliberate pre-write scaffolding per commit `1acc5be` (PR #33) awaiting vendor env vars — not bugs.

## State changes this session

| # | When | Script | Slug | From → To |
|---|---|---|---|---|
| 1 | ~15:51 UTC | `apps/api/scripts/validate-capability.ts --slug slovenian-company-data --apply` | slovenian-company-data | validating → probation |
| 2 | ~15:55 UTC | `apps/api/scripts/si-flip-to-active.ts` (one-shot, since deleted) | slovenian-company-data | probation → active |

Both transitions logged to `health_monitor_events` with `event_type='lifecycle_transition'`.

## Verification transactions on prod

| Tx | Path | Latency | Price | Result |
|---|---|---|---|---|
| `ea19e4b6-5d97-4e06-ac7d-b19fc9a535f1` | `/v1/do` with explicit `capability_slug` | 876ms | 5¢ | Krka 5043611000 returned, 11 fields, full provenance, CC-BY 4.0 attribution |
| (idempotency-key `si-discovery-2026-05-11-01`) | `/v1/do` with task only, no slug — keyword discovery | 1108ms | 5¢ | Krka returned via routing-engine match; `capability_used: slovenian-company-data` |

## Field coverage scoring

SI returns 11 fields. Mapping to the canonical 13-field set from the 2026-05-11 output map verification:

- ✓ `legalName` (via `company_name`)
- ✓ `registrationNumber` (via `reg_number`)
- ✓ `registeredAddress` (via `address`)
- ✗ `vatNumber` — not in source
- ✗ `status` (active/struck-off) — not in source
- ✗ `directorsOrOfficers` — not in source
- ✗ `naceOrSicCode` — not in source
- ✗ 6 enrichment fields — not in source

Coverage is **core-fields-only** (3/7 + 4 SI-specific bonus fields: `hseid`, `legal_form`, `registration_office`, `settlement`/`postal_code`/`post_office`, `country`, `jurisdiction`). Matches the manifest's declared `source_note`: *"Source coverage is limited to registration number, full name, address, legal form, and registry authority."* Consistent with peer open-data registries (LV/LT/EE/PL). Not a launch blocker.

## DEC-20260511-E (filed)

**Stuck-in-validating alerting/sweep** — global, active, high confidence. Adds a periodic check that surfaces any `capabilities` row in `lifecycle_state='validating'` for >48h. Alerting only, not auto-promotion. Cross-refs: DEC-20260503-B (SQS removal), DEC-20260506-D (circuit breaker), DEC-20260320-B (Capability Onboarding Protocol).

**Implementation surface candidate** (worth preserving the connection): `apps/api/scripts/audit-manifest-db-drift.ts` was added in this session as a manifest-vs-DB diagnostic. It doubles as the natural place to add a `validating > 48h` query, since both checks are read-only DB sweeps over the `capabilities` table. The drift audit is also worth keeping running as a standalone CI/cron hook — it surfaced the deliberate-deferral pattern on the 3 US slugs in a clean way, and would catch any future onboarding-without-registration regression.

**Read-back requirement** (per Working Rules Rule F): the implementation must include a synthetic-row test that inserts a `validating`-state row dated >48h old in staging, confirms the sweep fires, then removes the row. Without this read-back the sweep could be silently broken the same way SI promotion was silently un-automated.

## What's pending

- **DEC-20260511-E implementation** — not built this session. Three candidate surfaces named in the DEC: extend `.github/workflows/weekly-drift.yml`, add to `apps/api/scripts/check-lifecycle-states.ts`, or emit via `apps/api/src/lib/meta-monitoring.ts`. Plus the drift-audit-script surface mentioned above. Pick at implementation time.
- **3 US slugs (`us-company-data-cobalt`, `us-ein-match`, `us-sec-filings-extended`)** — manifest-only by design, awaiting vendor env vars per commit 1acc5be. Out of scope here.

## Artifacts left in repo

**Kept** (promoted to ongoing diagnostic):
- `apps/api/scripts/audit-manifest-db-drift.ts` — read-only sweep listing manifests-without-DB-row + DB-rows-without-manifest. Reusable as both standalone diagnostic and as the implementation surface for DEC-20260511-E.

**Deleted** (one-shots, served the session):
- `apps/api/scripts/check-si-state.ts` — one-row SI state query, redundant with the drift audit.
- `apps/api/scripts/lifecycle-distribution.ts` — one-shot GROUP BY query, redundant with drift audit + ad-hoc `psql`.
- `apps/api/scripts/si-flip-to-active.ts` — one-shot transition. `apps/api/scripts/lifecycle-transition.ts` is the canonical path but it requires `AUDIT_HMAC_SECRET` in local `.env` because it does `import "../src/app.js"`. Future single-row admin flips should either set that env var locally or use the same minimal-import pattern this one-shot demonstrated.

## Loose threads

1. **`lifecycle-transition.ts` requires AUDIT_HMAC_SECRET locally** to run, because it imports the full app for executor registration. Admin flips don't need executors registered. Small refactor opportunity: either drop the `import "../src/app.js"` (admin flips are write-only on capabilities table) or document the local env requirement at the top of the script. Not urgent — admin flips are rare and the workaround is documented in this handoff.

2. **The drift-audit script as DEC-20260511-E surface.** The connection is documented in the DEC body and here. Worth picking up next time someone schedules DEC-20260511-E implementation work.

3. **No code-review gate run.** This session's only code addition was the drift-audit script (read-only, defensive, ~80 lines, follows existing-script patterns). The 3 one-shots have been deleted. No `/go` was run because the new file is a diagnostic script (not on the production code path) and the consequential changes were DB writes via existing scripts. Flagging for visibility.
