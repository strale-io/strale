# Resolution report

**Date**: 2026-04-18
**Scope**: end-to-end execution of the 10-step plan from the "Resolve the unfinalized work inventory" session. Four new features/refactors shipped through PRs, four worktrees removed, 20 branches pruned, one untracked-file triage produced and flagged for review.

**Final main SHA**: `172b4de6bf95463fa36b3253ce0a1ae453e6f8c7` — `Merge pull request #17 from strale-io/refactor/eth-rpc-endpoint-pool`.
**Railway deploy**: all four merged PRs triggered deploys. `/health/deep` and `/health` both return 200 in production at the close of the session; `/health/deep` responded in 5 ms.

---

## Per-step results

### Step 1 — `/health/deep` endpoint — ✅ SHIPPED

- **Branch**: `feat/health-deep-endpoint` (branched off `origin/main` @ `3e8703e`).
- **Changes**:
  - `apps/api/src/app.ts` — extracted the `/health/deep` hunk from `stash@{0}` via patch + `git apply`. Handler uses a single CTE (`INSERT … RETURNING id` + `DELETE`) to probe the write path and every index on the `transactions` table. Returns `200 { status: "ok", write_path: "ok", latency_ms }` on success, `503 { status: "degraded", write_path: "failed", error, latency_ms }` on failure.
  - `apps/api/src/routes/health-deep.test.ts` — new unit test. Two cases: healthy DB → 200, DB throws → 503. Uses mocked `getDb()`.
- **Commit**: `60dc2b7 feat(health): add /health/deep endpoint probing DB write-path — resumed from 2026-04-16 outage response`.
- **PR**: #13 — CI green on first try.
- **Merge SHA**: `4ed3e84` (2026-04-18T15:15Z).
- **Prod verification**: `curl https://strale-production.up.railway.app/health/deep` → `200 {"status":"ok","write_path":"ok","latency_ms":5}`.
- **Ops follow-up**: Railway's own healthcheckPath should be pointed at `/health/deep` (one-line setting change in Railway UI — flagged in the PR body, out of scope for the PR itself).
- **REINDEX portion NOT touched** — carried over to Step 2.

### Step 2 — Monthly REINDEX CONCURRENTLY cron — ✅ SHIPPED

- **Branch**: `feat/reindex-transactions-monthly` (off current main).
- **Changes**:
  - `apps/api/src/jobs/reindex-transactions.ts` — new job, 208 LOC. Uses `REINDEX TABLE CONCURRENTLY transactions` (non-locking, PG 12+) instead of plain REINDEX so live writes aren't blocked. Uses the **dedicated-connection advisory-lock pattern** (from `test-scheduler.ts`) because `REINDEX CONCURRENTLY` can't run inside a transaction block, ruling out the xact-scoped pattern every other job uses. Advisory lock ID `20260418`, distinct from the four existing.
  - `apps/api/src/jobs/reindex-transactions.test.ts` — factory + idempotency tests.
  - `apps/api/src/index.ts` — wired into startup sequence after `startIntegrityHashRetry()`.
- **Scheduling approach**: wakes every 24 h + 15 min startup delay, queries `health_monitor_events` for the latest `reindex_transactions_complete` event; skips if last one was < 30 days ago, otherwise acquires lock and runs. Re-checks under the lock to handle two-instance races. Last-run storage via the existing `health_monitor_events` table (no new schema).
- **Commit**: `8812cd5 feat(jobs): monthly REINDEX CONCURRENTLY on transactions table — resumed from stash`.
- **PR**: #14 — CI green.
- **Merge SHA**: `05c8199` (2026-04-18T15:19Z).
- **Post-deploy observability**: expect `reindex-transactions: started` on boot; ~15 min later a `reindex-transactions-complete` or `reindex-transactions-skip-recent` log line depending on whether the 30-day gate triggers.

#### Stash state (step 2 follow-up)

Per the brief: "drop `stash@{0}` IF AND ONLY IF git confirms the stash's tracked changes are now on main."

- Stash's tracked changes verified on main:
  - `app.ts` `/health/deep` hunk — `grep /health/deep` on `origin/main:apps/api/src/app.ts` confirms the handler is present.
  - `db-retention.ts` REINDEX logic — ported into the new `apps/api/src/jobs/reindex-transactions.ts` (safer CONCURRENT version), `REINDEX TABLE CONCURRENTLY transactions` grep confirms.

However, the stash **also holds 76 untracked files** that are NOT on main, including:
- **4 secrets**: `.mcpregistry_github_token`, `.mcpregistry_registry_token`, and duplicated copies at `packages/mcp-server/.mcpregistry_*`.
- **1 large binary**: `mcp-publisher.exe` (~19 MB).
- **Four submission packages**: `agentic-community-submission/`, `bedrock-agentcore-submission/`, `docker-mcp-submission/`, `ibm-contextforge-submission/`.
- **Growth-ops materials**: `growth-plan/` with 16 PNG graphics + scripts + drafts.
- **12 scratch scripts in `apps/api/scripts/`**.
- **Audit / investigation docs** and handoff files.

**Stash `stash@{0}` was NOT dropped.** Dropping it would destroy all 76 untracked files — and some of them (the secrets) need manual review before disposal, while others (submission packages, growth graphics) are likely material Petter wants to keep somewhere. Flagged for Petter as part of Step 8's review queue.

### Step 3 — x402-gateway-v2 refactor — ✅ SHIPPED

- **Branch**: `refactor/x402-gateway-v2-object-args`.
- **Changes**: the existing uncommitted diff that had been sitting on the main worktree. `recordX402Transaction()` converted from 12 positional args to a single `RecordX402Args` object param. Adds `solutionSlug: string | null` alongside `capabilityId: string | null` (XOR — matches the DB CHECK constraint from migration 0043). Two call sites updated in the same diff.
- **Commit**: `19a8cdb refactor(x402): positional args to object args, add solutionSlug support`.
- **PR**: #15 — CI green.
- **Merge SHA**: `dba63d0` (2026-04-18T15:23Z).

### Step 4 — Digest + cron feature from `claude/practical-maxwell` — ✅ SHIPPED (partial)

- **Branch**: `feat/digest-external-api-calls`.
- **Action**: `git cherry-pick 9a0de14` — clean, zero conflicts despite the 72-commit gap between the practical-maxwell branch point and current main.
- **What landed** (5 files, +158/−1): `apps/api/railway-config.md` documents the new `strale-digest-cron` Railway service; `fetch-platform.ts` adds the "External API calls (last 24h)" query section (transparency-marker filter + email suffix exclusion + per-address allowlist for `petterlindstrom@hotmail.com`); `daily-digest/index.ts` default struct; `render-email.ts` + `types.ts` HTML rendering and type wiring.
- **Deliberately excluded**: the `source` column migration that lived alongside this feature in the worktree — deferred to Session 5 per Petter's decision (migration number collides with main's 0045; `customer/test` values overlap conceptually with the existing `integrity_hash_status` column co-owned by an untracked workflow).
- **Commit SHA (preserves original cherry-pick): `ab1b22d`** (same author, same message as the original `9a0de14`).
- **PR**: #16 — CI green.
- **Merge SHA**: `6a71ebd` (2026-04-18T15:30Z).
- **Ops follow-up flagged in PR**: Petter needs to manually create the `strale-digest-cron` Railway service per the recipe in `railway-config.md` (same image, custom start command, cron `30 5 * * *` UTC, restart policy "Never"). Not automated in this PR.
- **`claude/practical-maxwell` branch INTENTIONALLY PRESERVED** — holds the uncommitted `source` column migration.

### Step 5 — ETH RPC refactor from `claude/recursing-gauss-fb67a1` — ✅ SHIPPED

- **Branch**: `refactor/eth-rpc-endpoint-pool`.
- **Action**: generated a patch from the worktree's uncommitted state (`git diff HEAD` after staging the new `eth-rpc-endpoints.ts`), applied via `git apply --3way` on the fresh branch. Six files applied clean; one mechanical conflict in `apps/api/src/capabilities/ens-resolve.ts` (F-0-006 Bucket D comment block merged with the new shared-endpoints import line). Resolved by keeping the comment, adopting the new import.
- **Changes** (8 files, +242/−70):
  - `apps/api/src/lib/eth-rpc-endpoints.ts` NEW — shared `getEthRpcEndpoints()` (Alchemy-first when `ALCHEMY_API_KEY` is set, then a 4-endpoint free pool) + `rpcEndpointHost()` (strips API key from URL before provenance output).
  - `ens-resolve.ts` / `ens-reverse-lookup.ts` — iterate the shared list instead of hardcoded PRIMARY/FALLBACK constants.
  - `dependency-manifest.ts` — registers an `alchemy-eth` provider with the same pool as fallbackBaseUrls.
  - `dependency-health.ts` — reshape to use shared-pool pattern.
  - `index.ts` — new startup warning for unauthenticated free-tier providers with no fallback pool (enforces the publicnode 429 incident lesson).
  - `situation-assessment.ts`, `upstream-health-gate.ts` — minor adjustments for the new provider name.
- **Commit**: `3b367f3 refactor(eth-rpc): centralize Ethereum mainnet RPC endpoint pool` — original author preserved (`petterlindstrom79 <petter@stridemacro.com>`).
- **PR**: #17 — CI green.
- **Merge SHA**: `172b4de` (2026-04-18T15:34Z) — **this is the current main tip.**
- **Worktree**: `git worktree remove --force` succeeded at the metadata level but Windows refused to delete the physical directory (file held open by another process). **`git branch -d claude/recursing-gauss-fb67a1` succeeded.** The orphan dir at `C:/Users/pette/Projects/strale/.claude/worktrees/recursing-gauss-fb67a1` is still on disk with no git state attached. **Flag for Petter**: close any editor/IDE window pointed at that path, then `rm -rf`.

### Step 6 — Three plugin submission worktrees removed — ✅ DONE

For each, `git status --short` showed zero tracked modifications (the submission content is untracked and already live upstream per `PRE_RESOLUTION_INVESTIGATION.md`). Safe to discard.

| Worktree | Upstream check | Removal | Branch deletion |
|---|---|---|---|
| `agent-a5dbdc21` (Flowise) | PR #6209 at FlowiseAI/Flowise OPEN, MERGEABLE | `git worktree remove --force` ✅ | `git branch -D worktree-agent-a5dbdc21` (was `1950234`) ✅ |
| `agent-add49769` (LangFlow) | PR #12678 at langflow-ai/langflow OPEN, MERGEABLE | `git worktree remove --force` ✅ | `git branch -D worktree-agent-add49769` (was `1950234`) ✅ |
| `agent-af5f800e` (Windmill Hub) | `hub.windmill.dev/resource_types/374/strale` HTTP 200 (live) | `git worktree remove --force` ✅ | `git branch -D worktree-agent-af5f800e` (was `1950234`) ✅ |

All three physical directories deleted as part of worktree removal. No traces.

### Step 7 — Reply Radar worktree deleted — ✅ DONE

**Audit trail (captured before deletion)**:
- Worktree path: `C:/Users/pette/Projects/strale/.claude/worktrees/adoring-cerf`
- Branch: `claude/adoring-cerf`
- HEAD SHA: `837d6ab8e1a51f460a0eab59d183d287a8e05419`
- Last commit: 2026-04-15 13:26:53 +0200 — `fix(x402): return 402 on empty-body crawler requests, not 400` (already on main)
- Uncommitted content deleted:
  - `apps/api/package.json` modification (adds `puppeteer-core ^24.41.0` to devDependencies)
  - `package-lock.json` (875-line lockfile update from the new dep)
  - `apps/api/scripts/reply-radar.ts` (new — Reply Radar MVP, Twitter/X monitor via Nitter RSS)
  - `apps/api/scripts/reply-radar-output.md` (captured output from a local run)
  - `apps/api/scripts/graphics/` (new dir — associated assets)

**Removal**: `git worktree remove --force` (metadata) + `git branch -D claude/adoring-cerf` + `rm -rf` (physical dir). All clean.

### Step 8 — Untracked files triage — ⚠ FLAGGED FOR PETTER REVIEW

Brief specified: report only, do NOT delete. All items below are untouched on disk.

#### 8a. Secrets — FLAGGED FOR REVIEW

Where they live: **inside `stash@{0}`'s untracked half**, not the main worktree (the main worktree `git status` shows zero secret-like files, verified by `grep -iE "token|secret|credential|\.env|\.key|\.pem|\.p12"`).

| File (in stash@{0}) | Likely purpose | Recommendation |
|---|---|---|
| `.mcpregistry_github_token` | MCP registry publish auth (GitHub OAuth) | Revoke and delete — never live in git tree. The MCP publisher CLI writes it on login; re-login when needed. |
| `.mcpregistry_registry_token` | MCP registry JWT issued by the publisher after GitHub OAuth | Same — delete, regenerate on next publish. |
| `packages/mcp-server/.mcpregistry_github_token` | Duplicate of above, written into the subpackage dir | Delete; `.mcpregistry_*` should be in `.gitignore` at root to prevent reappearance. |
| `packages/mcp-server/.mcpregistry_registry_token` | Same | Same. |

None of these are production secrets the API depends on — production auth lives in Railway env vars. These four are local dev-machine credentials for the npm-registry publishing step. Safest action: once Petter has signed off, pop the stash, `rm -f` the four files, `git stash drop`, then `echo '.mcpregistry_*' >> .gitignore` and commit the gitignore.

#### 8b. 19 MB binary — FLAGGED FOR REVIEW

Where it lives: **inside `stash@{0}`'s untracked half**, specifically `mcp-publisher.exe` at the repo root (19,797,504 bytes ≈ 19 MB).

- **Likely purpose**: the Windows binary for the MCP registry publisher CLI. It appears alongside the `.mcpregistry_*` tokens — those tokens are written by this tool. Used once per `strale-mcp` version bump, not a running process.
- **Recommendation**: delete. Binaries don't belong in the repo tree. If Petter wants the tool available, install it globally (`npm -g` or scoop) and keep the repo clean.
- **Not deleted**: waiting on Petter's signoff per step rules.

#### 8c. 11 ad-hoc diagnostic scripts — FLAGGED FOR REVIEW

These live in the **main worktree** at `apps/api/scripts/`. None are in git.

| Script | What it does | Recommendation |
|---|---|---|
| `check-suggest-log.ts` | `SELECT COUNT(*) FROM suggest_log` | **Delete** — single count; easier to re-type than keep around. |
| `check-uk-all.ts` | Iterates UK capabilities; prints state + suites count per slug | **Delete** — UK rollout done; one-off diagnostic. |
| `check-uk-suites.ts` | Same intent, focuses on test_suites rows per UK capability | **Delete** — same vintage as above. |
| `check-uk-suspend.ts` | UK capability suspend-state probe | **Delete**. |
| `count-x402.ts` | Counts active capabilities with `x402_enabled = true` | **Delete** — trivial one-liner. |
| `diag-cz-state.ts` | Czech-capability rollout diagnostic (CZ wave 1 / 1.5 shipped to main) | **Delete** — done, rollout complete. |
| `window-users.ts` | Users created between two ISO timestamps (argv) | **Promote to `apps/api/scripts/`** — reusable ops tool for any future window query. Commit as a tracked file. |
| `window-x402.ts` | Same shape, x402 transactions | **Promote** — same reusoning. |
| `x402-audit-inspect.ts` | SELECT on `transactions` joined with `capabilities` to see x402 audit trail | **Promote** — useful for x402 incidents. |
| `x402-detail.ts` | Single-row detail fetcher for an x402 txn | **Promote** — useful for x402 incidents. |
| `x402-payer-history.ts` | History of all x402 calls from a payer address | **Promote** — useful for KYC / abuse investigations. |

Suggested structure for the promoted ones: commit them verbatim to `apps/api/scripts/`. The four to delete can stay deleted.

#### 8d. Other untracked items in main worktree (for completeness)

| Path | Status | Recommendation |
|---|---|---|
| `PRE_RESOLUTION_INVESTIGATION.md` | tracked? no | Session artifact from 2026-04-18 pre-resolution investigation. **Keep or archive** — Petter's call. |
| `PR_BACKLOG_TRIAGE.md` | not tracked | Session artifact from 2026-04-18 P1 session. **Keep or archive**. |
| `UNFINALIZED_WORK_INVENTORY.md` | not tracked | Session artifact that kicked off this entire resolution run. **Keep or archive**. |
| `RESOLUTION_REPORT.md` | not tracked (yet) | This file. **Will be committed at the end of this session.** |
| `capability-sources/` (dir) | not tracked | 3 `.md` files with alternative-source research for EU / non-EU company data capabilities. Petter seems to use these as working notes. **Commit as reference material** or keep local. |
| `handoff/_general/from-code/2026-04-18-capability-source-audit.md` | not tracked | Session handoff from a parallel session. **Commit** per handoff-folder convention. |
| `handoff/_general/from-code/2026-04-18-cz-notion-todos-queued.md` | not tracked | Same. |

---

## Branches preserved intentionally

| Branch | Reason |
|---|---|
| `claude/practical-maxwell` | Holds the uncommitted `source` column + migration 0045_transaction_source.sql work. Deferred to Session 5 per the design-decision brief: migration number collides with main's 0045 and the `customer/test` values overlap conceptually with the existing prod-only `integrity_hash_status` column that's co-owned by an untracked Retool workflow. See `PRE_RESOLUTION_INVESTIGATION.md` §1. |
| `claude/infallible-murdock-8d0bc1` | Phase B + C branch per brief's explicit "do NOT touch" rule. Kept for historical reference (Phase B/C/D sprint). |

---

## Active worktrees still on disk

`git worktree list` currently reports 21 worktrees (1 main + 20 still-attached Claude-session worktrees). These are all backing branches that are already merged to main — their content is safe — but removing them wasn't in this session's scope (Step 9 only pruned the *branches* that don't back a worktree). Petter's call whether to clean them up as a separate maintenance sweep.

Special case: the physical directory at `C:/Users/pette/Projects/strale/.claude/worktrees/recursing-gauss-fb67a1` is **orphaned** — git worktree metadata was successfully removed and the branch was deleted, but Windows refused to delete the physical directory because a file was held open. Close any editor/IDE pointed at that path, then `rm -rf` will succeed.

---

## Branch pruning (Step 9 summary)

- **Candidates**: 37 local branches merged to `origin/main`.
- **Excluded**: 17 that back active worktrees (skipped per brief's "worktree takes precedence" rule), plus `main` itself and explicit exclusions `claude/practical-maxwell` + `claude/infallible-murdock-8d0bc1`.
- **Deleted (20)**: `chore/seed-ci-workflow`, `claude/busy-mccarthy-68fedd`, `claude/crazy-bhabha`, `claude/distracted-mayer-514f37`, `claude/pensive-colden`, `claude/phase-d-p2-medium-fixes`, `feat/ati-phase-a`, `feat/digest-external-api-calls`, `feat/health-deep-endpoint`, `feat/pipeline-phase-1`, `feat/quality-aggregation`, `feat/quality-capture`, `feat/reindex-transactions-monthly`, `feat/solutions`, `feat/test-suite-runner`, `feat/trust-pipeline`, `fix/low-sqs-audit`, `fix/sprint-9-credibility`, `refactor/eth-rpc-endpoint-pool`, `refactor/x402-gateway-v2-object-args`.
- **Refused**: 0. Every `git branch -d` succeeded on first try — no unmerged work was held by any of the deleted branches.

---

## Current state of main

- **Local HEAD**: `172b4de6bf95463fa36b3253ce0a1ae453e6f8c7` (== `origin/main`).
- **Recent commits** (most recent first):
  - `172b4de` Merge #17 — ETH RPC refactor
  - `6a71ebd` Merge #16 — digest + cron
  - `dba63d0` Merge #15 — x402 refactor
  - `05c8199` Merge #14 — REINDEX cron
  - `4ed3e84` Merge #13 — `/health/deep`
  - (plus Phase C/D merges before this session)
- **Railway deploy**: all four merged PRs triggered Railway deploys in sequence. Current deploy status per `railway status --json`: commitHash `172b4de`, status `SUCCESS`.
- **Live smoke**:
  - `GET /health` → 200 `{"status":"ok"}`
  - `GET /health/deep` → 200 `{"status":"ok","write_path":"ok","latency_ms":5}` ← the new endpoint is live and working.

---

## Summary for Petter

**Shipped to prod during this session (in order)**:
1. `/health/deep` DB write-path probe.
2. Monthly REINDEX CONCURRENTLY cron (advisory lock 20260418, dedicated-connection pattern, `health_monitor_events`-backed scheduling).
3. x402-gateway-v2 positional→object args refactor + `solutionSlug` support.
4. Daily-digest external-API-calls section + `strale-digest-cron` Railway service documentation.
5. Centralized ETH RPC endpoint pool with Alchemy support.

**Still in the working tree, flagged for your review (Step 8 deliverables)**:
- 4 secret files inside `stash@{0}` (`.mcpregistry_*`).
- 1 × 19 MB `mcp-publisher.exe` inside `stash@{0}`.
- 11 untracked diagnostic scripts (4 to delete, 5 to promote, 2 more CZ/UK one-offs to delete per the 8c table).
- 3 untracked session-artifact markdowns at repo root.
- `capability-sources/` dir with 3 `.md` research notes.
- 2 handoff markdowns in `handoff/_general/from-code/`.

**Preserved intentionally**:
- Branch `claude/practical-maxwell` (Session 5 `source` column decision pending).
- Branch `claude/infallible-murdock-8d0bc1` (Phase B+C reference).
- `stash@{0}` (still holds the 76 untracked files called out above; dropping it would destroy the audit-investigation docs and submission packages among other things).

**Ops follow-ups for Petter**:
- Point Railway's `healthcheckPath` at `/health/deep` (UI setting, one-line).
- Create the `strale-digest-cron` Railway service per `railway-config.md` recipe.
- Set `ALCHEMY_API_KEY` on Railway if you want Alchemy as the primary ETH RPC.
- Close any editor window on `C:/Users/pette/Projects/strale/.claude/worktrees/recursing-gauss-fb67a1`, then `rm -rf` the orphan directory.
- Decide on Step 8 items: secrets/binary deletion, diagnostic-script promotion or deletion.

No code changes were made outside the scope of each step. No state changes to upstream (Flowise / LangFlow / Windmill) repos or to Notion. Only files written during this session are the four PRs, their per-fix commits, and `RESOLUTION_REPORT.md`.
