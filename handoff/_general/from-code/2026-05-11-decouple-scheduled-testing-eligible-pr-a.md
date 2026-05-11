# Decouple `scheduled_testing_eligible` from `external_cost_cents` (PR A)

**Intent:** Ship PR A of the structural decoupling that retires the implicit billing/scheduling coupling at the root of the May 2026 Haiku token spike (PRs #84/#85/#86/#87). PR #88 merged 2026-05-11.

## Landed

- Schema: `test_suites.scheduled_testing_eligible BOOLEAN NOT NULL DEFAULT FALSE` added in [apps/api/src/db/schema.ts](apps/api/src/db/schema.ts).
- Migration [apps/api/drizzle/0063_decouple_scheduled_testing_eligibility.sql](apps/api/drizzle/0063_decouple_scheduled_testing_eligibility.sql): adds column + backfills `eligible = TRUE WHERE external_cost_cents = 0` + post-condition DO block asserts parity between the two filters.
- Scheduler swap (3 readers in [apps/api/src/jobs/test-scheduler.ts](apps/api/src/jobs/test-scheduler.ts)): `findOverdueCapabilities`, `countOverdueCapabilities`, `countPaidSkipped` now filter on `scheduled_testing_eligible`.
- Script swap: [apps/api/scripts/investigate-singapore.ts:128](apps/api/scripts/investigate-singapore.ts#L128).
- Startup block `0066_reconcileEligibilityFromCost` added in [apps/api/src/lib/startup-migrations.ts](apps/api/src/lib/startup-migrations.ts), registered in `BLOCKS`. Re-derives eligibility from cost at every boot — interim bridge until PR B forces INSERT sites to declare explicitly.
- Test: BLOCKS-list assertion in [apps/api/src/lib/startup-migrations.test.ts](apps/api/src/lib/startup-migrations.test.ts) updated 8 → 9 blocks.

## Decisions

- **Migration number 0063** — fills gap. Drizzle migrations and in-startup-blocks are different mechanisms; cross-numbering with startup block 0064/0065/0066 doesn't collide.
- **PR A deliberately does NOT touch the 12 INSERT call sites** (`capability-persistence.ts`, `capability-onboarding.ts`, all `db/generate-*-tests.ts`, `onboard.ts`, etc.). Deferred to PR B.
- **Block 0066 added** rather than modifying blocks 0064/0065 — 0066 reconciles every row at boot; modifying 0064/0065 would only cover their specific slugs.
- New DEC: [DEC-20260511-B](https://www.notion.so/35d67c87082c812c864dfeaa2b9afaff). Refines DEC-20260503-B without superseding.

## Verification

- Type-check: clean (pre-existing `routes/mcp.ts` `strale-mcp/tools` errors unchanged).
- vitest: 540 passing / 11 skipped. Pre-existing `app.classify-error.test.ts` failure noted in prompt; unrelated.
- CI on PR #88: green in 54s.

## Follow-ups

- **PR B** ([Notion To-do](https://www.notion.so/35d67c87082c8102ba48fff997d5fdcf)): force `scheduledTestingEligible: boolean` explicit at 12 INSERT sites, remove block 0066, rewrite the CI assertion in `llm-capability-costs.test.ts` to check the eligibility flag directly. P2.
- **Post-deploy verification** (next Railway deploy): `\d test_suites` shows new column; `SELECT COUNT(*) WHERE eligible = TRUE` must equal `SELECT COUNT(*) WHERE external_cost_cents = 0`; next hourly dispatch logs same cap set as pre-deploy.

## Related

- [DEC-20260511-B](https://www.notion.so/35d67c87082c812c864dfeaa2b9afaff)
- [PR B Notion To-do](https://www.notion.so/35d67c87082c8102ba48fff997d5fdcf)
- [Structural follow-up source To-do](https://www.notion.so/35d67c87082c81148ee4fc88f1671776) — moved to In progress
- PR #88: https://github.com/strale-io/strale/pull/88
- PR #85 (containment): https://github.com/strale-io/strale/pull/85
- PR #87 (residual cleanup): https://github.com/strale-io/strale/pull/87
