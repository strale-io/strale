# In-TS startup-migrations adopted as schema-change convention (PR #88 Phase 3 Harden)

**Intent.** Phase 3 Harden of the PR #88 deploy-failure bug fix. Phases 1 (Contain) and 2 (Understand) shipped earlier in the day; this session codifies the in-TS-block convention that was already running in prod, retires the misleading Drizzle SQL surface, and closes the deploy-order regression class.

## Landed

- **Block 0066 owns the column.** [apps/api/src/lib/startup-migrations.ts](apps/api/src/lib/startup-migrations.ts) — block renamed to `runMigration0066_ensureEligibilityColumnAndReconcile` and the SQL now starts with `ALTER TABLE test_suites ADD COLUMN IF NOT EXISTS scheduled_testing_eligible BOOLEAN NOT NULL DEFAULT FALSE` before the reconciliation UPDATE. Idempotent on existing prod (column already there from PR #88 Phase 1 manual recovery); functional on fresh DBs (local dev, staging, restored snapshots).
- **Drizzle surface removed.** `apps/api/drizzle/` (63 SQL files + meta/ + README.md), `apps/api/drizzle.config.ts`, `apps/api/scripts/check-migration-prefixes.mjs`, `apps/api/scripts/verify-migration-rename.ts`, the `check-migration-prefixes` step in `.github/workflows/ci.yml`, and the `db:generate` / `db:migrate` / `db:push` scripts in `apps/api/package.json` are all gone. `drizzle-kit` removed from devDependencies.
- **Misleading hints fixed.** [apps/api/src/lib/schema-validator.ts](apps/api/src/lib/schema-validator.ts) `fix` message now points at startup-migrations.ts blocks (was: `npx drizzle-kit migrate`). schema.ts `integrity_hash_status` external-managed comment reworded (was referencing `drizzle-kit generate` proposing DROP).
- **Tests.** [apps/api/src/lib/startup-migrations.test.ts](apps/api/src/lib/startup-migrations.test.ts) BLOCKS-list assertion updated to the new block name.

## Verification

- Type-check clean (pre-existing `routes/mcp.ts` `strale-mcp/tools` errors unchanged).
- vitest: 540 passing / 11 skipped / 1 pre-existing failure (`app.classify-error.test.ts`, unrelated).
- BLOCKS-list canonical test passes with renamed block.

## Audit-phase correction

Previous session's Phase 2 finding (Journal `35d67c87082c815da2ead8ff87c638e2`) stated `drizzle.__drizzle_migrations` doesn't exist in prod. This was wrong — the table DOES exist under the `drizzle` schema (not `public`); previous SSH query only checked `public`. Corrected understanding: the table has 60 historical entries with last applied ~April 4, 2026. `drizzle-kit migrate` was used historically (manually via `npm run db:migrate`) but stopped being run after early April. In-startup-migrations.ts blocks have been doing the work since then. The conclusion (Drizzle SQL files are not part of the deploy pipeline, in-TS is the working convention) is correct; only the reason for the conclusion was wrong. The corrected understanding actually strengthens the case for Option B (codifying in-TS) — leaving the SQL files around was a manual-run footgun (anyone running `npm run db:migrate` against prod would have hit non-idempotent DDL errors).

## Drift inventory

Per Step 4, scanned schema.ts for columns that lack matching `IF NOT EXISTS` startup-migration blocks. None found that needed action this PR — the in-TS blocks register every column-add through 2026-05-11 except those added in the original schema baseline (block 0029 onwards covers the post-baseline additions). Any future PR that adds a column adds a block by convention; this PR does not retroactively backfill the pre-block schema state.

## Phase-3 design choice notes

The prompt offered two placements for the column ADD (option A: modify block 0066; option B: insert a lower-numbered block). Picked A. Reasoning: block 0066 already owns the eligibility-from-cost reconciliation; co-locating the schema fact and the data-fact in the same block makes "this block is the lifecycle owner of `scheduled_testing_eligible`" explicit and matches the existing single-responsibility-per-column pattern (e.g. block 0029 owns `actual_cost_cents`, block 0060 owns `marketplace_eligible*`).

**PR B implication.** The existing PR B follow-up To-do says block 0066 will be removed when INSERT sites are forced explicit. With this Phase 3 change, "remove block 0066" needs adjustment: PR B must either retain the ADD COLUMN portion or move it to a dedicated lower-numbered block (e.g. 0066a or 0067) before deleting the reconciliation UPDATE. The PR B To-do at [35d67c87082c8102ba48fff997d5fdcf](https://www.notion.so/35d67c87082c8102ba48fff997d5fdcf) needs updating to reflect this; flagged for the next session to handle.

## Skill-files note

The cc-prompts skill's `closing-steps-checklist.md` lives in two places: (a) the chat-environment `/mnt/project/SKILL.md` family (not reachable from this Claude Code env) and (b) Petter's local `C:/Users/pette/Downloads/closing-steps-checklist.md`. The Downloads copy was updated this session with the Rule 8 rewrite. The chat-environment files will need a re-sync from the Notion canonical home or from the Downloads snapshot. The canonical home for Rule 8 is now DEC-20260511-C; the canonical Working rules page at [33c67c87082c81ca91c7f5bfdccea5a2](https://www.notion.so/33c67c87082c81ca91c7f5bfdccea5a2) has been updated with the pointer.

## Links

- DEC-20260511-C: https://www.notion.so/35d67c87082c810eb79dd5ad25e3b65f
- Journal course-correction (PR #88 failure): https://www.notion.so/35d67c87082c815da2ead8ff87c638e2
- P1 To-do (closed by this PR): https://www.notion.so/35d67c87082c810bbe04e597c38f6d89
- PR #88 (the original failure): https://github.com/strale-io/strale/pull/88
- This PR: <number on PR open>
- DEC-20260420-A (hand-written discipline, preserved): in Decisions DB
- DEC-20260420-B (schema.ts sync, preserved): in Decisions DB
- DEC-20260511-B (PR A decoupling, the change that surfaced the broken pipeline): in Decisions DB
