# Unfinalized work inventory — strale-io/strale

**Date**: 2026-04-18
**Scope**: read-only walk of every location where work-in-progress can hide
— stashes, uncommitted worktree changes, local-only branches, remote
branches without PRs, sibling repos, loose files.

No state was changed. No stash pop, no commit, no push, no branch delete,
no checkout. One document was written (this one).

---

## Summary

| Category | Count | Notable |
|---|---|---|
| Stashes | **1** | Stash holds 2 tracked mods (health/deep endpoint + REINDEX maintenance) + 76 untracked scratch files |
| Main-repo tracked modifications (uncommitted) | **1** | Mid-refactor of `x402-gateway-v2.ts` (positional args → object, + solutionSlug support) |
| Main-repo untracked files (real, not session artifacts) | **14** | 11 diag scripts, 1 untracked dir (`capability-sources/`), 1 prior-session triage doc, 1 cross-session handoff |
| Local branches | **42** | 35 already merged, 3 diverged, 4 special (see below) |
| Worktrees with uncommitted work | **7** | Three of them contain substantial feature-in-flight code |
| Remote branches | **9** (+ main) | All 8 non-main branches fully merged to origin/main |
| Remote branches without PRs | 7 old `feat/*` + `fix/sprint-9-credibility` | All merged; no un-integrated remote work |
| Sibling repos with open PRs | **0** | Across all 7 checked `strale-io/*` repos |
| WIP markers in code (`WIP`, `DO NOT MERGE`, etc.) | **0** | Zero code-level marker matches |
| Loose scratch files (`*.draft.*`, `wip-*`, etc.) | **0** | Naming-convention scan is clean |

### The three items that most look like "Petter started something and never finished"

1. **`claude/practical-maxwell` worktree + branch** — 1 committed digest feature (`9a0de14`) + uncommitted `source` column migration that **collides with main's 0045** filename. This is real WIP and the migration number conflict will bite if resumed naïvely.
2. **`claude/adoring-cerf` worktree** — Reply Radar MVP (Twitter/X reply-worthy-tweet monitor). +`puppeteer-core` dep, new script, output + graphics. Branch tip is already on main, so the uncommitted work was started *after* the last branch commit got absorbed into the deploy.
3. **`stash@{0}` tracked half** — `/health/deep` endpoint on app.ts (DB write-path probe, designed for Railway health checks) and `REINDEX TABLE transactions` maintenance in db-retention.ts. The stash message references "a full outage on 2026-04-16" — this looks like a real operational fix that got deferred when Phase C closeout took priority, and the REINDEX hunk is built on the *pre-hotfix* db-retention.ts so it conflicts with the xact-lock version now on main.

Plus three plugin-submission worktrees (Flowise / LangFlow / Windmill Hub) that are each a complete-looking package of source files sitting uncommitted in a worktree branch that itself is merged to main — these are either "done, just waiting to be pushed upstream" or "forgotten."

---

## Stashes

### `stash@{0}` — "On main: pre-phase-c-closeout-session"

- **Age**: stashed 2026-04-17 21:22 (≈18 hours ago as of writing).
- **Tracked modifications (2 files, +46 / −3)**:
  - `apps/api/src/app.ts` — adds a `/health/deep` endpoint (CTE-based
    write-path probe via `INSERT INTO transactions ... RETURNING id`
    immediately `DELETE`d; 200 on success, 503 on failure). Intended for
    Railway health checks to catch index corruption, disk-full, and
    pool-exhaustion classes of failure.
  - `apps/api/src/jobs/db-retention.ts` — adds `REINDEX TABLE transactions`
    as preventive index maintenance after the daily prune. Comment
    references "B-tree page split corruption that caused a full outage on
    2026-04-16." Patch is built on the **pre-hotfix** version of this
    file (still contains the session-scoped `pg_advisory_unlock` in the
    finally block), so it **will conflict** with the current xact-lock
    pattern on main.
- **Untracked captured files (76 items)**: the stash dumped `-u` so it
  captured a large zoo of scratch artifacts and session-era docs that
  were sitting in the working tree at stash time, including:
  - **Secrets (sensitive)**: `.mcpregistry_github_token`,
    `.mcpregistry_registry_token`, and duplicated copies at
    `packages/mcp-server/.mcpregistry_*`. These shouldn't round-trip onto
    disk via a stash pop without review.
  - **Audit / investigation docs**: `AUDIT-SOLUTION-GRADES.md` (207 LOC),
    `DIAGNOSTIC-SQS-INCONSISTENCY.md` (370 LOC),
    `STRATEGIC-ANALYSIS.md` (273 LOC), plus the four
    `strale-*-audit-2026-04-08.md` files.
  - **Submission packages**: `agentic-community-submission/`,
    `bedrock-agentcore-submission/`, `docker-mcp-submission/`,
    `ibm-contextforge-submission/` — one whole submission per directory
    tree. Complete-looking, never pushed.
  - **Scratch scripts** (12 in `apps/api/scripts/`): `daily-ext.ts`,
    `diag-filter-check.ts`, `diag-null-context.ts`,
    `diag-url-to-markdown.ts`, `inspect-free-tier.ts`, `last24h-ext.ts`,
    `retest-polish.ts`, `since-last-ext.ts`, `spike-browserless.ts`,
    `today-signups.ts`, `today-users.ts`, `today-x402.ts`,
    `who-called.ts`, `window-users.ts`.
  - **Growth materials**: `growth-plan/` (HTML digest preview, 15+ PNGs,
    tweets-v2.md, typefully drafts, upload-graphics.sh).
  - **Large binaries**: `mcp-publisher.exe` (19.8 MB),
    `growth-plan/current-og-image.png` (258 KB) and other PNGs. These
    shouldn't be in a stash long-term either way.
  - **Handoff files**: five dated `handoff/_general/from-code/2026-04-*`
    markdowns from pre-Phase-C sessions.
  - **One-off scratch**: `bosch-kyb-response-final{,-v2,-v3}.json`,
    `digest-preview.html`, `gate4b-retrospective-report.md`,
    `gate5-retrospective-report.md`, `capability-inventory.md`,
    `capability-sources/01-eu-company-data.md`,
    `x402-gateway-design.md` (738 LOC).
- **Conflict with current main**:
  - `app.ts` textually touches import section and the `/health` area;
    the hotfix did not modify those ranges, so a pop should succeed
    cleanly or with a minor merge. Verified via `git merge-tree` output
    (`changed in both` but hunks don't overlap).
  - `db-retention.ts` **will conflict**. The stash builds on the old
    session-scoped advisory-lock finally-block which is gone from main
    — the REINDEX hunk cannot be applied without hand-porting into the
    new `db.transaction(async (tx) => ...)` shape.

**Recommendation (tracked half)**: **Resume** the two tracked
modifications, but surgically — don't pop the whole stash as one unit.
Extract `app.ts` patch → apply → commit. Manually re-write the
`db-retention.ts` REINDEX hunk on top of the current xact-lock code
(move the REINDEX inside the `db.transaction` callback, drop the `.catch(() => {})`
which the lint guard forbids anyway) → commit.

**Recommendation (untracked half)**: **Ask Petter**. 76 items spanning
secrets, four submission packages, growth collateral, scratch scripts,
and a 19 MB binary is not something to pop blindly. Petter has the
context to say which items should graduate into tracked files (likely:
submission packages, some growth docs), which should be .gitignore'd
forever (the .mcpregistry tokens, mcp-publisher.exe), and which should
just be discarded.

---

## Uncommitted worktree changes

### A — Main repo working tree (`C:/Users/pette/Projects/strale`, on `claude/phase-d-p2-medium-fixes`)

**Tracked modifications (real code, not artifacts)**:

| File | LOC change | Description |
|---|---|---|
| `apps/api/src/routes/x402-gateway-v2.ts` | +65 / −36 | Refactor: positional-args `recordX402Transaction(...)` → object-param `recordX402Transaction({...args})`. Introduces a `RecordX402Args` interface with **`solutionSlug: string \| null`** alongside `capabilityId: string \| null` (XOR semantics — exactly one is set). Two call sites updated in the same diff. This is a mid-refactor toward first-class solution support in the x402 flow. |
| `package-lock.json` | +1 | Adds `"peer": true` to the `pino` entry. npm-normalization byproduct from a later `npm install`; no actual dep change. |

**Untracked files — real work (not session artifacts)**:

| Path | Type | Evidence of intent |
|---|---|---|
| `apps/api/scripts/check-suggest-log.ts` | diagnostic | SELECT COUNT on `suggest_log` table |
| `apps/api/scripts/check-uk-all.ts` | diagnostic | UK capability state query |
| `apps/api/scripts/check-uk-suites.ts` | diagnostic | UK test_suites query |
| `apps/api/scripts/check-uk-suspend.ts` | diagnostic | UK capability suspend query |
| `apps/api/scripts/count-x402.ts` | diagnostic | `x402_enabled` counter |
| `apps/api/scripts/diag-cz-state.ts` | diagnostic | Czech capability state probe |
| `apps/api/scripts/window-users.ts` | diagnostic | windowed user query |
| `apps/api/scripts/window-x402.ts` | diagnostic | windowed x402 query |
| `apps/api/scripts/x402-audit-inspect.ts` | diagnostic | x402 audit-trail spelunker |
| `apps/api/scripts/x402-detail.ts` | diagnostic | x402 row detail |
| `apps/api/scripts/x402-payer-history.ts` | diagnostic | x402 per-payer history |
| `capability-sources/` | 3 × .md | `01-eu-company-data.md`, `02-eu-company-data-batch2.md`, `03-non-eu-company-data.md` — source notes for capability onboarding |

**Untracked files — session artifacts (expected)**:

| Path | Notes |
|---|---|
| `PR_BACKLOG_TRIAGE.md` | From the previous P1 session (this repo already triaged as zero-backlog) |
| `handoff/_general/from-code/2026-04-18-capability-source-audit.md` | Parallel session's handoff — convention is that these live here |

**Recommendation**:
- `x402-gateway-v2.ts`: **Resume**. Call-site fixes are already in the
  diff; once reviewed and committed it's a tidy refactor that opens up
  solution support on x402 paths. Small PR.
- `package-lock.json`: **Discard** (don't commit the `peer: true`
  normalization on its own — it'll reappear on the next `npm install`
  if needed and shouldn't be a standalone commit).
- 11 diagnostic scripts: **Ask Petter**. These look like ad-hoc queries
  from recent investigations. Options: (a) promote a few into the
  tracked `audit/` tree as reusable ops tools, (b) move to a gitignored
  `apps/api/scratch/` dir, (c) delete after use.
- `capability-sources/`: **Ask Petter**. Looks intentional (onboarding
  reference material) but isn't tracked yet.

### B — Worktree `claude/adoring-cerf` (already-merged branch; worktree retains uncommitted post-merge work)

5 uncommitted items on top of a branch that's fully on main:

- `apps/api/package.json` — adds `puppeteer-core: ^24.41.0` to
  devDependencies.
- `package-lock.json` — 875 lines of lockfile updates from the new dep.
- `apps/api/scripts/reply-radar.ts` (new) — **Reply Radar MVP**. Monitors
  X/Twitter accounts across 5 tiers for reply-worthy tweets via Nitter
  RSS, filters by Strale-relevant keywords, scores, outputs top 15.
  No authentication required.
- `apps/api/scripts/reply-radar-output.md` — captured output from a
  local run.
- `apps/api/scripts/graphics/` (new dir) — presumably associated assets.

**Recommendation**: **Resume**. This is a focused growth-ops MVP that
looks shippable. Needs: fresh branch off `main`, move the three new
files + package.json/lock update onto it, write a short README-style
comment on the script, commit, PR. Not urgent but clearly intended work.

### C — Worktree `claude/practical-maxwell` (WIP branch — 1 committed, several uncommitted)

The committed half (`9a0de14 feat(digest): add external API calls
section + document cron service`, 2026-04-14) is substantive but never
landed on main:
- `apps/api/railway-config.md` — new; documents a `strale-digest-cron`
  Railway one-shot service at 05:30 UTC.
- `apps/api/src/lib/daily-digest/fetch-platform.ts` — +81/−1; adds
  "External API calls (last 24h)" section (counts only rows with
  `transparency_marker != 'algorithmic'`, excludes internal `@strale.io`
  / `@strale.dev` / `@strale.internal` / `@example.com` / founder
  personal emails).
- `apps/api/src/lib/daily-digest/index.ts` — +1 (wire-up).

The uncommitted half (also in this worktree) adds a **`source` column**
to the `transactions` table and the migration to create it:

- `apps/api/src/db/schema.ts` — +6; adds
  `source: varchar("source", { length: 16 })` to the `transactions`
  table, with values `'customer'` / `'test'` / `'retry'` / NULL.
- `apps/api/drizzle/0045_transaction_source.sql` (new) — migration
  creates the column, backfills `'test'` for rows owned by
  `system@strale.internal`, backfills the rest as `'customer'`, adds
  `transactions_source_created_at_idx`.
- `apps/api/scripts/run-migration-0045.ts` (new) — runner.
- `apps/api/check-db.ts` (new) — sanity check script.
- `digest-preview.html` (new) — rendered digest for review.

**Critical conflict**: `0045_transaction_source.sql` collides with main's
`0045_baseline_invalidation_trigger.sql` (the migration number is
already taken — same pattern that forced the Phase C renumber). The
`source` column idea also overlaps conceptually with the existing
prod-only `integrity_hash_status` column (which uses
`'customer'` / `'test'` values for exactly the same purpose, per
`PHASE_C_COLUMN_INVESTIGATION.md`). Before resuming, decide whether to
consolidate on the existing column, rename this to `0048_*`, or
abandon.

**Recommendation**: **Ask Petter**. The digest + cron service commit is
likely resume-worthy on its own (small, isolated, useful). The schema
change is the one that needs a design call before anything happens —
there are now three possible workflows on this conceptual "source"
tag (existing prod `integrity_hash_status`, Phase C's
`compliance_hash_state`, and this proposed `source`), and merging
blindly would create a fourth.

### D — Worktree `claude/recursing-gauss-fb67a1` (already-merged branch; worktree retains 8 uncommitted changes)

- `apps/api/src/lib/eth-rpc-endpoints.ts` (new) — "Shared list of
  Ethereum mainnet JSON-RPC endpoints. Single source of truth used by:
  ENS capability executors (ens-resolve, ens-reverse-lookup), alchemy-eth
  dependency health probe." Alchemy first when env var present, then
  public RPC fallbacks.
- `apps/api/src/capabilities/ens-resolve.ts` — refactored to use the
  shared endpoints pool.
- `apps/api/src/capabilities/ens-reverse-lookup.ts` — same.
- `apps/api/src/lib/dependency-health.ts` — +126/−42 (major reshape to
  pick up the shared endpoint list).
- `apps/api/src/lib/dependency-manifest.ts` — +52/−2 (register the new
  alchemy-eth provider).
- `apps/api/src/lib/situation-assessment.ts` — +14/−1.
- `apps/api/src/lib/upstream-health-gate.ts` — +1.
- `apps/api/src/index.ts` — +17/−0.

**Recommendation**: **Resume**. This is a coherent, well-scoped refactor
that centralizes ETH RPC endpoint selection and hooks dependency-health
into it. Needs: fresh branch off `main`, move the changes on, verify
typecheck + tests still green, PR. Medium-sized.

### E — Worktrees `worktree-agent-a5dbdc21` / `-add49769` / `-af5f800e`

Each is a single-directory untracked addition on a merged branch, and
each looks like a complete-looking integration package:

- **`a5dbdc21`** → `packages/components/nodes/tools/Strale/{core.ts, Strale.ts, strale.svg}` — Flowise plugin (`packages/components/nodes/tools/` is Flowise's plugin convention).
- **`add49769`** → `src/lfx/src/lfx/components/strale/{__init__.py, strale.py}` — LangFlow plugin (Python).
- **`af5f800e`** → `windmill-hub-submission/f/strale/{check_quality, execute_capability, get_wallet_balance, search_and_execute, search_capabilities}.{ts, script.yaml}` + `folder.meta.yaml` — Windmill Hub submission.

All three worktree branches (`worktree-agent-a5dbdc21`,
`worktree-agent-add49769`, `worktree-agent-af5f800e`) point at the
same commit `1950234 docs: final session handoff — 19 commits, 6 new
capabilities, 1 solution` (from 2026-04-12). That commit is on main.
The uncommitted submission packages sit on top.

**Recommendation**: **Ask Petter**. These are plausibly:
1. "Done, ready to submit upstream to Flowise / LangFlow / Windmill"
   and never did.
2. "Drafted, abandoned when upstream docs changed."
3. "Kept local for a reason" (likely not — submission packages are
   usually public).

Petter decides which bucket each falls in; until then they shouldn't
be committed or deleted.

### F — Worktree `claude/infallible-murdock-8d0bc1` (Phase B/C/D session worktree)

9 uncommitted items, all expected session artifacts:
- `FIX_PHASE_A_verification.md`, `PHASE_C_DEPLOY_OBSERVATIONS.md`,
  `REVIEW_FINDINGS_0_baseline.md` — sprint reports that lived in the
  worktree during the sprint; final versions were already committed to
  main from the repo root.
- 6 investigation scripts in `apps/api/scripts/` (`apply-phase-c-migrations.mjs`,
  `investigate-hash-status.mjs`, `phase-c-damage-estimate.mjs`,
  `phase-c-db-archaeology.mjs`, `verify-0047-state.mjs`,
  `verify-locks.mjs`). `verify-locks.mjs` was copied to main and shipped
  in PR #5bc5d33; the others are single-session diagnostics.

**Recommendation**: **Discard** the worktree contents (worktree is a
sprint byproduct; scripts are either shipped already or were single-use
read-only diagnostics). Don't delete the worktree directory without
Petter's go-ahead since he may want one last look.

---

## Local-only branches

**42 branches total**, dominated by Claude-session-named `claude/*`
and `worktree-agent-*` branches from prior agent runs. Classification:

### Merged branches (35) — Discard

All of these have `ahead=0` vs `origin/main`, i.e. every commit is
already on main. Deleting them would be a no-op for content but a
cleanup win.

| Branch | Last commit | Upstream |
|---|---|---|
| `chore/seed-ci-workflow` | 2026-04-17 | origin/chore/seed-ci-workflow [gone] |
| `claude/adoring-cerf` | 2026-04-15 | origin/main (tracks main) |
| `claude/agitated-pascal-2f675c` | 2026-04-15 | origin/main |
| `claude/amazing-noether` | 2026-04-15 | origin/main |
| `claude/awesome-gates-8322b5` | 2026-04-15 | origin/main |
| `claude/busy-mccarthy-68fedd` | 2026-04-17 | origin/main |
| `claude/crazy-bhabha` | 2026-04-15 | origin/main |
| `claude/crazy-curran` | 2026-04-15 | origin/main |
| `claude/dazzling-mclean` | 2026-04-15 | origin/main |
| `claude/distracted-mayer-514f37` | 2026-04-15 | origin/main |
| `claude/dreamy-neumann-d272fc` | 2026-04-15 | origin/main |
| `claude/festive-villani` | 2026-04-15 | origin/main |
| `claude/frosty-dubinsky` | 2026-04-15 | origin/main |
| `claude/gallant-zhukovsky-156785` | 2026-04-17 | origin/main |
| `claude/infallible-murdock-8d0bc1` | 2026-04-17 | origin/claude/infallible-murdock-8d0bc1 |
| `claude/kind-black` | 2026-04-15 | origin/main |
| `claude/naughty-shtern-e28b1c` | 2026-04-15 | origin/main |
| `claude/nervous-borg` | 2026-04-15 | origin/main |
| `claude/nifty-napier` | 2026-04-15 | origin/main |
| `claude/pensive-colden` | 2026-04-15 | origin/main |
| `claude/pensive-noether` | 2026-04-15 | origin/main |
| `claude/recursing-gauss-fb67a1` | 2026-04-15 | origin/main |
| `claude/vigilant-blackwell` | 2026-04-15 | origin/main |
| `claude/xenodochial-chebyshev` | 2026-04-01 | (no upstream) |
| `claude/zen-snyder` | 2026-04-15 | origin/main |
| `feat/ati-phase-a` | 2026-03-17 | (no upstream) |
| `feat/pipeline-phase-1` | 2026-03-17 | origin/feat/pipeline-phase-1 |
| `feat/quality-aggregation` | 2026-03-03 | origin/feat/quality-aggregation |
| `feat/quality-capture` | 2026-03-03 | origin/feat/quality-capture |
| `feat/solutions` | 2026-03-02 | origin/feat/solutions |
| `feat/test-suite-runner` | 2026-03-03 | origin/feat/test-suite-runner |
| `feat/trust-pipeline` | 2026-03-03 | origin/feat/trust-pipeline |
| `fix/low-sqs-audit` | 2026-03-14 | (no upstream) |
| `fix/sprint-9-credibility` | 2026-03-14 | origin/fix/sprint-9-credibility |
| `worktree-agent-a5dbdc21` / `-add49769` / `-af5f800e` | 2026-04-12 | (no upstream) |

Some of these back active worktrees (see "Uncommitted worktree changes"
above) — deleting the branch requires removing the worktree first. Most
don't.

### Ahead of origin/main (3) — mixed

| Branch | Ahead | Behind | Notes |
|---|---|---|---|
| `claude/festive-aryabhata-997e22` | 2 | 44 | Both commits have subjects identical to commits already on main (`f37d401` "unreliable-VAT-payer check (Batch 1.5)" / `82e6456` "Czech capability wave 1"). Rebased-then-merged under different SHAs; **content is on main**. |
| `claude/phase-d-p2-medium-fixes` | 0 | 1 vs local stale `main` | Current checkout. Fully on `origin/main` as merge commit `3e8703e`. Local `main` branch is just out-of-date. |
| `claude/practical-maxwell` | **1** | 72 | **Real WIP**: `9a0de14 feat(digest): add external API calls section + document cron service`. See worktree analysis above. |

**Recommendations**:
- `claude/festive-aryabhata-997e22`: **Discard**. Content is on main;
  branch is a dangling twin. Same for its worktree.
- `claude/phase-d-p2-medium-fixes`: **Resume** is already done; branch
  can be discarded now that the PR is merged. Will happen naturally via
  GitHub's branch cleanup if enabled.
- `claude/practical-maxwell`: **Ask Petter**. The committed feature is
  isolated and could ship; the uncommitted schema change needs a design
  decision before it's safe to merge (see Worktree C).

---

## Remote branches

| Branch | Commits ahead of origin/main | PR status | Merged to origin/main |
|---|---|---|---|
| `origin/claude/infallible-murdock-8d0bc1` | 0 | #8 MERGED, #10 MERGED | ✅ |
| `origin/claude/phase-d-p2-medium-fixes` | 0 | #12 MERGED | ✅ |
| `origin/feat/pipeline-phase-1` | 0 | none (pre-PR era) | ✅ |
| `origin/feat/quality-aggregation` | 0 | none | ✅ |
| `origin/feat/quality-capture` | 0 | none | ✅ |
| `origin/feat/solutions` | 0 | none | ✅ |
| `origin/feat/test-suite-runner` | 0 | none | ✅ |
| `origin/feat/trust-pipeline` | 0 | none | ✅ |
| `origin/fix/sprint-9-credibility` | 0 | none | ✅ |

**No remote branch has commits not on `origin/main`.** The pre-PR-era
`feat/*` branches are cruft on the remote but not un-integrated.

**Recommendation**: **Discard** (recommend deletion of all 7 old
`feat/*` + `fix/sprint-9-credibility` remotes once the local cleanup
matches). No action item for unfinished work; nothing is.

---

## Sibling repos (brief)

All seven checked repos in `strale-io/`:

| Repo | Open PRs | Closed PRs | Default branch | Last push |
|---|---|---|---|---|
| `strale-io/strale` | 0 | 12 total | main | 2026-04-18 13:06Z |
| `strale-io/strale-frontend` | 0 | 0 | main | 2026-04-18 12:32Z |
| `strale-io/strale-x402-starter` | 0 | 0 | master | 2026-04-16 14:23Z |
| `strale-io/n8n-nodes-strale` | 0 | 0 | master | 2026-04-05 10:05Z |
| `strale-io/strale-beacon` | 0 | 0 | master | 2026-04-01 14:45Z |
| `strale-io/strale-examples` | 0 | 0 | main | 2026-03-26 14:51Z |
| `strale-io/agent-skills` | 0 | 0 | main | 2026-03-20 00:26Z |

Additionally, the local `strale-frontend/` directory (a git clone of
`strale-io/strale-frontend` nested inside the main strale repo) is
clean: working tree clean, no local branches besides `main`, no stash,
zero commits ahead of `origin/main`.

**Recommendation**: no WIP in any sibling repo. Not an area to chase.

---

## Loose files and WIP markers

**Naming-convention scan** (`*.draft.*`, `*-wip.*`, `WIP-*`, `scratch-*`,
`draft-*`, `DRAFT-*`): zero matches.

**Code WIP markers** (`WIP`, `FIXME.*urgent`, `DO NOT MERGE`,
`TODO.*SHIP`, `TODO.*URGENT`, `NOCOMMIT`): zero matches in
`apps/api/src/**/*.ts`. The only `XXX` hits are legitimate format-string
constants in `swift-validate.ts` / `bank-bic-lookup.ts` / `isbn-validate.ts`
(BIC branch-code convention, not WIP markers).

**Root-level loose markdowns**:

| File | Tracked? | Age | Purpose |
|---|---|---|---|
| `AUDIT-SOLUTION-SQS.md` | tracked | 2026-03-23 | Audit report |
| `AUDIT-TESTING-GAP.md` | tracked | 2026-03-23 | Audit report |
| `audit-backend-report.md` | tracked | 2026-03-16 | Older audit |
| `BAKE_MONITORS.md` | tracked | 2026-04-17 | Phase C close-out (current) |
| `FIX_PHASE_B_report.md`, `FIX_PHASE_B_ssrf_migration_todo.md`, `FIX_PHASE_C_P1_high_v2.md`, `FIX_PHASE_C_report.md`, `FIX_PHASE_D_report.md` | tracked | 2026-04-17 / 18 | Sprint reports (current) |
| `PHASE_C_COLUMN_INVESTIGATION.md`, `PHASE_C_DEPLOY_OBSERVATIONS.md` | tracked | 2026-04-17 | Sprint reports (current) |
| `PR_BACKLOG_TRIAGE.md` | **untracked** | 2026-04-18 | Previous session artifact |
| `SESSION_5_CARRY_FORWARD.md` | tracked | 2026-04-17 | Phase C close-out (current) |
| `context7.json`, `glama.json`, `server.json`, `smithery.yaml` | tracked | various | Directory submissions (not WIP) |

No loose files at root look abandoned. The tracked audit docs from
March are historical reports (fine to keep). The untracked
`PR_BACKLOG_TRIAGE.md` is just the previous session's output sitting in
the worktree.

**Loose directories**:
- `strale-frontend/` — nested git clone of `strale-io/strale-frontend`.
  Clean, up-to-date. Not WIP; just a dev convenience. Leave alone.
- `bedrock-agentcore-submission/` — only `__pycache__/` on disk. The
  actual submission files (README, agent-example.py, gateway-config.json)
  are in `stash@{0}`. Rendered empty on disk.
- `capability-sources/` — 3 .md files, untracked (reported above).

---

## Recommendations per item (summary)

| Item | Recommendation | Rationale |
|---|---|---|
| Stash@{0} tracked half (`/health/deep` + REINDEX) | **Resume** — surgically | Operational fixes from a real outage; REINDEX needs hand-porting onto new xact-lock code |
| Stash@{0} untracked half (76 files incl. secrets, submissions, scratch) | **Ask Petter** | Too mixed to triage blindly; includes .mcpregistry tokens + a 19 MB .exe |
| Uncommitted `x402-gateway-v2.ts` refactor | **Resume** | Clean mid-refactor; call sites already updated |
| Uncommitted `package-lock.json` (peer:true) | **Discard** | npm-normalization; don't commit alone |
| 11 untracked diag scripts in `apps/api/scripts/` | **Ask Petter** | Likely ad-hoc ops queries; promote, move to scratch, or delete |
| Untracked `capability-sources/` | **Ask Petter** | Looks intentional onboarding material |
| Worktree `adoring-cerf` — Reply Radar MVP | **Resume** | Shippable MVP; needs fresh branch + commit + PR |
| Worktree `practical-maxwell` digest commit | **Resume** (after cleanup) | Isolated, useful; separate from the schema change |
| Worktree `practical-maxwell` uncommitted schema + 0045 migration | **Ask Petter** | Migration number collision + conceptual overlap with 3 existing columns |
| Worktree `recursing-gauss-fb67a1` — ETH RPC + ENS refactor | **Resume** | Coherent refactor; medium PR |
| Worktree `a5dbdc21` — Flowise plugin submission | **Ask Petter** | Complete-looking; unclear if still relevant |
| Worktree `add49769` — LangFlow plugin submission | **Ask Petter** | Same |
| Worktree `af5f800e` — Windmill Hub submission | **Ask Petter** | Same |
| Worktree `infallible-murdock-8d0bc1` — sprint artifacts | **Discard** | Phase B/C/D sprint byproducts; shipped content is already on main |
| 35 merged local branches | **Discard** (don't delete yet) | All content on main; deletion is cleanup, not action |
| `claude/festive-aryabhata-997e22` branch + worktree | **Discard** | Commits already on main with different SHAs |
| Remote branches without PRs | **Discard** (cleanup only) | All merged |
| Sibling repos | (no action) | Zero WIP anywhere |
| Nested `strale-frontend/` clone | (no action) | Clean sibling-repo checkout |

---

## Safe-to-act-on-autonomously vs needs-Petter

**Claude can execute without signoff** (all "Resume" items that are
isolated and well-scoped):

- `x402-gateway-v2.ts` refactor → new branch, commit, push, PR. Small.
- `claude/adoring-cerf` Reply Radar → new branch, commit the 4 new
  items + the package.json/lock update, push, PR. Small.
- `claude/recursing-gauss-fb67a1` ETH RPC refactor → new branch, commit
  the 7 mods + 1 new file, verify tests, push, PR. Medium.
- Stash@{0} `app.ts` `/health/deep` hunk → extract, apply on a fresh
  branch, commit, push, PR. Small.

**Needs Petter's signoff**:

- Stash@{0} `db-retention.ts` REINDEX hand-port (two sensible
  implementations: inside the xact-lock transaction vs. a separate
  non-tx REINDEX step; the choice affects locking behavior).
- Stash@{0} untracked content — 76 items, mixed triage call including
  secret files that should probably never be committed.
- `claude/practical-maxwell` schema change (`source` column +
  `0045_transaction_source.sql`). Migration number collision and
  conceptual overlap with the existing `integrity_hash_status` workflow.
  This is exactly the SCF-3 "untracked workflow modifies production
  schema" pattern showing up from the other direction.
- Three plugin-submission worktrees (`a5dbdc21` / `add49769` /
  `af5f800e`). Petter knows whether upstream partners are still live.
- Untracked ops scripts (`apps/api/scripts/check-*`, `window-*`, `x402-*`,
  `diag-cz-state.ts`, `count-x402.ts`). Promotion vs. deletion is a
  taste call.

---

## Commands used (all read-only)

```
git stash list
git stash show --stat stash@{0}
git stash show --stat -u stash@{0}
git stash show -p stash@{0}        # read-only diff extraction
git status --porcelain
git diff --stat
git diff --stat --cached
git branch -vv
git branch --merged main
git branch --no-merged main
git for-each-ref --format=... refs/heads/
git fetch origin --prune
git branch -r
git rev-list --count origin/main..<branch>
git log --oneline origin/main..<branch>
git log -1 --format=... <branch>
git log --oneline origin/main --grep=... --since=...
git merge-tree --trivial-merge HEAD stash@{0}^1 stash@{0}
git worktree list [--porcelain]
for each worktree:
  git -C <wt> status --porcelain
  git -C <wt> diff --stat
  git -C <wt> rev-parse --abbrev-ref HEAD

gh pr list --state all --head <branch>
gh api repos/strale-io/<repo>/pulls?state=open
gh api repos/strale-io/<repo>/branches
gh api repos/strale-io/<repo>
gh repo list strale-io

find . -name '<pattern>' (read-only walk)
grep -rE '<pattern>' (read-only content scan)
ls, stat (read-only)
```

No writable git operation (`commit`, `push`, `merge`, `rebase`,
`checkout <branch>`, `stash pop`, `branch -d`, `stash drop`) was run.
No `gh pr create`, `gh pr merge`, `gh pr close`, `gh pr comment` was
run. Only file written: this inventory.
