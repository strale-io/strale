---
date: 2026-05-13
type: verification-report
session-intent: Verify whether Tech stack page Backend "Known quirks" drizzle-kit lines are stale per DEC-20260511-C
worktree: strale-research (read-only)
status: SUPERSEDED — see correction below
---

# Drizzle "Known quirks" verification (Tech stack page)

## CORRECTION (added 2026-05-13 after session-close audit)

**The Outcome below is WRONG.** Correct outcome is **A — fully executed**.

This report was produced from the `strale` trunk worktree, which is checked out on branch `feat/dec-20260511-e-stuck-validating-sweep` (HEAD `03e3b64`). That branch was created **before PR #89 merged** and was never rebased onto main. As a result the working tree there still has the pre-PR-#89 `apps/api/drizzle/` directory with 65 SQL files, the dead `db:migrate` script in `package.json`, and the `drizzle-kit` devDep — but **none of these exist on main** as of 2026-05-11.

PR #89 (commit `3e60d5d`, merged 2026-05-11) shipped the entire deletion: `apps/api/drizzle/` directory, `apps/api/drizzle.config.ts`, `apps/api/scripts/check-migration-prefixes.mjs`, `apps/api/scripts/verify-migration-rename.ts`, the three `db:*` scripts, the `drizzle-kit` devDep, the CI step, and the wording rewordings in `schema.ts` + `schema-validator.ts`. Verified later this session by checking the strale-work worktree (on main) and reading PR #89's file stat (86 files changed).

DEC-20260511-C is **fully executed**, not partially. The Working rules page header softening that this report triggered (2026-05-13) should revert; the Tech stack page Backend "Known quirks" follow-up that this report triggered should be re-scoped to the small residual cleanups noted in the DEC-20260511-C halt report.

**Lesson for future state-verification reports:** always confirm the worktree HEAD against `origin/main` before producing an "is X currently on main?" verdict. Branch-local working trees can show pre-merge state and produce false negatives.

The original (incorrect) Outcome B analysis follows below for forensic completeness. Do not act on it.

---

## Outcome (SUPERSEDED — see correction above)

**Outcome B — partially executed.** The in-TS startup-migrations mechanism described in the Working rules header is **live and load-bearing** (verified in code). However, the `apps/api/drizzle/` directory has **not** been removed — it still contains 65 historical migration files (0000–0099) and the journal. The Working rules header's claim that the directory is "retired" is aspirational, not yet reality.

Net effect on the two "Known quirks" lines on the Tech stack page:

- Line 1 (`drizzle-kit migrate` is broken; use raw SQL via `postgres`): **stale**. The "broken drizzle-kit" framing is structurally outdated and the prescribed workaround (raw SQL via the `postgres` package, as in `apps/api/scripts/apply-migrations.ts`) is dead — that file was replaced by PR #51 and the convention is now in-TS startup-migration blocks.
- Line 2 (Railway does not auto-apply migrations; manual step required): **stale**. Railway *does* auto-apply migrations at API boot via `runStartupMigrations()` wired into [apps/api/src/index.ts:73-74](apps/api/src/index.ts#L73-L74). No manual migrate step exists.

DEC-20260511-C itself is not referenced anywhere in the committed repo (no handoff file, journal entry, or commit message contains the literal string `DEC-20260511-C`). The convention it codifies, however, is plainly executed in code via PR #51 (2026-05-04) and reinforced by PR #89 (`refactor: adopt in-ts startup-migrations as schema convention`).

## Evidence

### 1. Current migration mechanism in code

The live mechanism is `runStartupMigrations()` in [apps/api/src/lib/startup-migrations.ts](apps/api/src/lib/startup-migrations.ts).

- Wired into API boot at [apps/api/src/index.ts:73-74](apps/api/src/index.ts#L73-L74):

```ts
const { runStartupMigrations } = await import("./lib/startup-migrations.js");
await runStartupMigrations();
```

- The file's docstring (lines 1-37) explicitly documents:
  - **Blocking, not fire-and-forget.** A failed migration aborts API startup.
  - **Runs BEFORE `validateSchema()`** in `index.ts`.
  - **Runs BEFORE the API listens, BEFORE any scheduler / job boots.**
  - **Every block is idempotent** — `IF NOT EXISTS` for DDL, `WHERE <filter>` for DML.
  - **Per-block structured logging** so Railway log-grep can distinguish "ran and changed N rows" from "skipped" from "threw and aborted boot."

- Block roster (current `BLOCKS` array at [startup-migrations.ts:348-355](apps/api/src/lib/startup-migrations.ts#L348-L355)):
  ```
  runMigration0029_actualCostCents
  runMigration0030_complianceColumns
  runMigration0031_testResultsCompositeIdx
  runMigration0060_marketplaceEligible
  runMigration0062_paidVendorCosts
  runMigration0063_invoiceExtractCostReclassify
  ```

- The retired-by-replacement file [`apps/api/scripts/apply-migrations.ts`](apps/api/scripts/apply-migrations.ts) is no longer the deploy path. PR #51 (`0b157c2 fix(deploy): wire startup migrations into API boot — replaces dead apply-migrations.ts`) was the structural fix.

### 2. `apps/api/drizzle/` directory state

**Present.** 65 SQL files + `README.md` + `meta/` (drizzle journal). Contents include:

- `0000_damp_mastermind.sql` through `0063_…` continuous, then jumps to `0099_suggest_log.sql` (the renamed-out 0046 collision documented in `drizzle/README.md`).
- `meta/_journal.json` is the authority for which file runs and in what order under `drizzle-kit`.

The directory is **historical / generator artifact**, not the live migration substrate. Inspection of recent merged PRs (#88, #89, #95, #98–#103) shows new schema work going into `runMigrationXXXX_…` blocks in `startup-migrations.ts` rather than new `apps/api/drizzle/*.sql` files. PR #89's title is the explicit convention shift: `refactor: adopt in-ts startup-migrations as schema convention`.

The Working rules header's claim that the directory is "retired" is therefore **partially true** (new work doesn't go there) but **factually overstated** (the directory still exists and `drizzle-kit generate` would still write into it).

### 3. Railway deploy command

**No `railway.toml` / `railway.json` in the repo.** Railway uses the Dockerfile at the repo root. From [Dockerfile:34](Dockerfile#L34):

```
CMD ["node", "apps/api/dist/index.js"]
```

That's the entire deploy command. No separate migrate step. The API entry point calls `runStartupMigrations()` before doing anything else. PR #51's commit message and PR #52's "single source of truth" follow-up confirm this is the design intent.

### 4. `package.json` legacy scripts

[apps/api/package.json:20-22](apps/api/package.json#L20-L22) still has:
```
"db:generate": "drizzle-kit generate",
"db:migrate": "drizzle-kit migrate",
"db:push": "drizzle-kit push"
```

These remain because `drizzle-kit generate` is still a useful local tool for snapshotting schema changes into the `drizzle/meta/` journal even when the live mechanism is in-TS blocks. `db:migrate` is no longer the production path and isn't invoked in the Dockerfile or by any CI workflow that I could see.

### 5. Recent PR history confirms the pattern

Last ~20 schema-touching PRs in the branch graph:

```
1e1636a fix(a0c-1.v3): include cost_class + last_customer_call_at … (#103)
0455230 feat: classify final non-Anthropic visible caps … (#102)
… (Phase B classification PRs, #98–#101) …
4c3573d feat: cost_class taxonomy + dispatcher gate + budget enforcement (#95)
99159a9 feat: scheduler reads cost_class for eligibility (block 0069)
941c22e feat: classify DE/DK/SK cost_class (manifest + block 0068)
5a74936 feat: cost_class taxonomy schema (blocks 0067, 0070)
3e60d5d refactor: adopt in-ts startup-migrations as schema convention (#89)
cb4e8c1 refactor: introduce scheduled_testing_eligible column (#88)
…
0b157c2 fix(deploy): wire startup migrations into API boot (#51)
```

The "block 0067/0068/0069/0070" naming in commit messages is the same in-TS startup-migrations convention. (Note: these are *newer* block numbers than the rev `BLOCKS` array currently shows — branch `feat/dec-20260511-e-stuck-validating-sweep` may not yet contain main's most-recent merges of these blocks; the count of registered blocks on prod may differ slightly. The convention, however, is unambiguous.)

## Recommended Notion edit

Replace the two "Known quirks" lines with a single, accurate description plus a pointer to DEC-20260511-C. Suggested replacement text for the Backend → Known quirks section:

> **Schema changes use in-TS startup-migrations blocks (DEC-20260511-C).** Each block is a `runMigrationXXXX_<name>` function in [`apps/api/src/lib/startup-migrations.ts`](https://github.com/strale-io/strale/blob/main/apps/api/src/lib/startup-migrations.ts) registered in the `BLOCKS` array, and uses `IF NOT EXISTS` / `WHERE <filter>` for idempotency. `runStartupMigrations()` runs blocking at API boot **before** `validateSchema()` and **before** the API listens, so Railway deploys auto-apply new schema with no manual step. Don't write new SQL files into `apps/api/drizzle/` — that directory is the historical record + drizzle-kit generator output, not the live migration substrate. The `db:migrate` script (`drizzle-kit migrate`) in `apps/api/package.json` is a local tool only; it's not invoked by the Dockerfile or CI and is not the production deploy path. Pattern reference: PR #51 (the structural fix) and PR #89 (codifies the convention).

If the Working rules header's claim that the `drizzle/` directory is "retired" is intended literally, the followup work is to delete the directory (or move it under a `legacy/` prefix) and remove the `db:migrate` / `db:generate` / `db:push` scripts from `package.json`. As of 2026-05-13, neither has happened, so the Tech stack page should describe what is, not what is planned.

## Worktree / process notes

- Read-only verification, no code changes, no PR.
- Report saved here and `git add`-ed per Rule G (decision-rationale handoff promoted to tracked).
- DEC-20260511-C text could not be retrieved from the local repo. If Notion is reachable, fetching the DEC body would let the Tech stack edit quote the exact retirement wording rather than inferring intent from the Working rules header. Flag for the Claude chat editor.
- Outcome label is **B**, not A — the Working rules header's claim is **factually overstated** on the directory-retired point, even though the mechanism it describes is fully live. Recommend the chat editor either softens the Working rules wording or schedules the cleanup PR that deletes `apps/api/drizzle/` and the dead `db:migrate` script.
