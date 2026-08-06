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

---

# Follow-up session — 2026-04-18 (later) — Step 8 close-out

Three batches executed after the initial resolution run. Removed the Step 8 "flagged for review" queue by executing Petter's triage decision, cleared the stash, and verified Railway ops follow-ups.

## Batch 1 — Script cleanup — ✅ SHIPPED

- **Branch**: `chore/script-cleanup`
- **PR**: #18
- **Merge SHA**: `33ee499` (2026-04-18T18:01Z)

### Deleted (6 one-off diagnostics)

| File | Why |
|---|---|
| `apps/api/scripts/check-suggest-log.ts` | Single-line `SELECT COUNT FROM suggest_log` — easier to re-type than keep around |
| `apps/api/scripts/check-uk-all.ts` | UK-rollout diag; rollout done |
| `apps/api/scripts/check-uk-suites.ts` | Same vintage |
| `apps/api/scripts/check-uk-suspend.ts` | Same vintage |
| `apps/api/scripts/count-x402.ts` | Trivial `x402_enabled` counter |
| `apps/api/scripts/diag-cz-state.ts` | CZ-rollout diag; rollout done |

### Promoted to tracked (5 operational tools)

Each gets a one-line header comment explaining what it does and usage. Contents otherwise preserved exactly.

| File | Purpose |
|---|---|
| `apps/api/scripts/window-users.ts` | External (non-internal) user activity in a time window |
| `apps/api/scripts/window-x402.ts` | x402 transactions in a time window |
| `apps/api/scripts/x402-audit-inspect.ts` | Audit-trail JSON for the 5 most-recent x402 completions |
| `apps/api/scripts/x402-detail.ts` | One-line summary of x402 txns since a hardcoded date |
| `apps/api/scripts/x402-payer-history.ts` | Find x402 txns by payer-address fragment (KYC / abuse investigation) |

Narrow slice of F-0-012 (dead-code Session 0 finding) — specifically the scripts that appeared during the Phase B/C/D sprint.

## Batch 2 — Stash cleanup — ✅ SHIPPED + STASH DROPPED

- **Branch**: `chore/stash-cleanup`
- **PR**: #19
- **Merge SHA**: `57fa894` (2026-04-18T18:18Z)
- **Stash state after merge**: `git stash list` → empty. `stash@{0}` dropped as `eb70b6b`.

### Inventory

76 files total in `stash@{0}^3` (the untracked tree). Classified into 7 categories per the brief; counts:

| Category | Count | Action | Landing point |
|---|---|---|---|
| Credentials / secrets | 4 | DELETE via stash drop | — |
| Binary (mcp-publisher.exe ~19 MB) | 1 | DELETE via stash drop | — |
| Scratch scripts (13 stale + 1 dup of just-promoted `window-users.ts`) | 14 | DELETE via stash drop | — |
| Submission packages (4 platforms) | 12 | EXTRACT | `archive/submissions/<platform>/` |
| Growth-ops materials (5 text + 18 PNGs) | 23 | EXTRACT | `archive/growth-ops/` |
| Audit docs + handoffs + bosch-kyb PoCs + digest-preview + x402-gateway-design + capability-source research | 22 | EXTRACT | `archive/sessions/` (handoffs under `archive/sessions/handoff-from-code/`) |
| **Totals** | **76** | **19 deleted, 57 extracted** | |

Plus 1 `archive/README.md` authored at commit time explaining the tree.

### Specific items in each category

**Deleted (via stash drop)**:
- Secrets: `.mcpregistry_github_token`, `.mcpregistry_registry_token`, duplicates at `packages/mcp-server/.mcpregistry_github_token`, `packages/mcp-server/.mcpregistry_registry_token`. None were production credentials — all dev-machine MCP-registry publish artifacts that regenerate on next login.
- Binary: `mcp-publisher.exe` (19,797,504 bytes). Reinstallable via `npm -g` or scoop.
- Scratch scripts: `daily-ext`, `diag-filter-check`, `diag-null-context`, `diag-url-to-markdown`, `inspect-free-tier`, `last24h-ext`, `retest-polish`, `since-last-ext`, `spike-browserless`, `today-signups`, `today-users`, `today-x402`, `who-called`, `window-users` (stale pre-promotion version — the promoted copy is on main at the same path).

**Preserved under `archive/submissions/`** (12 files, 4 platforms):
- `agentic-community-submission/` × 3 (docs/strale.md + 2 JSON agent configs) — corresponds to `agentic-community/mcp-gateway-registry#723`.
- `bedrock-agentcore-submission/` × 3 (README, agent-example.py, gateway-config.json) — corresponds to `awslabs/agentcore-samples#1232`.
- `docker-mcp-submission/` × 3 (readme.md, server.yaml, tools.json) — corresponds to `docker/mcp-registry#2202`.
- `ibm-contextforge-submission/` × 3 (mcp-catalog-entry.yml, register-strale.sh, strale-integration.md) — corresponds to `IBM/mcp-context-forge#3974`.

These are separate from the three plugin worktrees discarded on 2026-04-18 in Step 6 (Flowise, LangFlow, Windmill Hub — all live upstream per `PRE_RESOLUTION_INVESTIGATION.md`).

**Preserved under `archive/growth-ops/`** (23 files):
- Text: `devto-sqs-methodology.md` (dev.to article), `fact-check-audit.md`, `tweets-v2.md`, `typefully_drafts.txt`, `upload-graphics.sh`.
- Graphics: `current-og-image.png` + `graphics/` subdirectory with 18 promotional PNGs (dev.to covers, SQS distribution charts, 10 Twitter post visuals dated by apr, 2 OG images).

**Preserved under `archive/sessions/`** (22 files):
- Audits: `AUDIT-SOLUTION-GRADES.md`, `DIAGNOSTIC-SQS-INCONSISTENCY.md`, `STRATEGIC-ANALYSIS.md`, `REVIEW_TEMPLATE.md`, `capability-inventory.md`.
- The Apr-08 audit cluster: `strale-capability-inventory-audit-2026-04-08.md`, `strale-spike-correlation-analysis-2026-04-08.md`, `strale-usage-and-conversion-audit-2026-04-08.md`, `strale-usage-audit-real-users-only-2026-04-08.md`.
- Rollout retros: `gate4b-retrospective-report.md`, `gate5-retrospective-report.md`.
- Design: `x402-gateway-design.md` (738 LOC).
- PoC response snapshots: `bosch-kyb-response-final.json`, `bosch-kyb-response-final-v2.json`, `bosch-kyb-response-final-v3.json`.
- Other: `digest-preview.html` (sample digest render), `01-eu-company-data.md` (capability-source research note).
- Session handoffs (under `handoff-from-code/`): `2026-04-15-pr-audit-session.md`, `2026-04-15-session.md`, `2026-04-15-x402-bazaar-indexing.md`, `2026-04-16-frontend-redesign-session1.md`, `2026-04-16-growth-session.md`.

### Nothing was surprising

Every file matched cleanly to a category. No ambiguous classifications; no secrets that looked in-use; no binaries that looked load-bearing. The "Other" bucket didn't get used — every file fell into one of the six defined categories. No stop-and-flag events during Batch 2.

## Batch 3 — Railway ops follow-ups

Three items, all requiring the Railway dashboard — the Railway CLI (v4.30.5) has no commands for any of these.

### 3a. `healthcheckPath` → `/health/deep` — ⚠ FLAGGED FOR PETTER

- **Current state** (from `railway status --json`): every service in the project has `"healthcheckPath": null` and `"healthcheckTimeout": null`. Railway is using its default probe behavior, not checking the new deep endpoint.
- **CLI limitation**: `railway service` has `status`, `logs`, `redeploy`, `restart`, `scale` subcommands — no deploy-config subcommand. This setting is dashboard-only in CLI 4.30.5.
- **For Petter to do**:
  1. Railway dashboard → project `desirable-serenity` → service `strale` → **Settings** → **Deploy**.
  2. Set **Healthcheck Path** to `/health/deep`.
  3. Set **Healthcheck Timeout** to `10` (seconds). The CTE probe is fast (~5 ms against a healthy DB per the prod smoke test), so 10 s is generous but won't let a stalled write delay rollback decisions.
  4. No need to redeploy for the setting to take effect — next deploy will pick it up.
- **Smoke test confirms endpoint works**: `curl https://strale-production.up.railway.app/health/deep` → `200 {"status":"ok","write_path":"ok","latency_ms":5}`.

### 3b. `strale-digest-cron` Railway service — ⚠ FLAGGED FOR PETTER

- **CLI limitation**: `railway add` exists but it's for adding a service *template* (Postgres, Redis, etc.), not creating a service from the same repo with a custom start command. Creating this service from the existing `strale` Dockerfile with a different start command is a dashboard workflow.
- **For Petter to do** (full config from `railway-config.md` which shipped in PR #16):
  1. Railway dashboard → same project → **+ New → GitHub Repo** → select the `strale` repo.
  2. Settings:
     - **Service name**: `strale-digest-cron`
     - **Build**: Dockerfile (no Dockerfile path override — same root Dockerfile)
     - **Custom start command**: `node apps/api/dist/jobs/daily-digest.js`
     - **Cron Schedule**: `30 5 * * *` (UTC, = 07:30 CEST summer / 06:30 CET winter)
     - **Restart policy**: `Never` (it's a one-shot; exiting cleanly is success)
  3. **Variables** tab → link to shared project variables so it inherits:
     `DATABASE_URL`, `RESEND_API_KEY`, `ANTHROPIC_API_KEY`, `NOTION_TOKEN`, `GITHUB_TOKEN`.
     No `ADMIN_SECRET` needed — this service runs the digest directly, not over HTTP.
- **Verification after creation**: next run at 05:30 UTC should deliver a digest email to Petter's inbox. The "External API calls (last 24h)" section added in PR #16 will be in it.

### 3c. `ALCHEMY_API_KEY` — ✅ NO ACTION NEEDED

- **Code check**: `apps/api/src/lib/eth-rpc-endpoints.ts:getEthRpcEndpoints()` reads `process.env.ALCHEMY_API_KEY` at call time. If set, Alchemy is prepended to the endpoint list; if unset, the function returns the 4-endpoint free pool (`publicnode.com`, `llamarpc.com`, `cloudflare-eth.com`, `ankr.com`). **There is a fallback.**
- **Recommendation**: skip per the brief. The free pool works today; setting Alchemy is a quota/latency upgrade (Alchemy 100 k CU/day vs. unauthenticated free-tier limits on the public endpoints), not a correctness requirement.
- **If Petter wants Alchemy primary later**: just set `ALCHEMY_API_KEY` as a Railway env var on `strale`. No deploy needed — the endpoint list is re-read on every ENS request. Provenance output will automatically read `eth-mainnet.g.alchemy.com` once the key is set.

### 3d. Orphan worktree — ⚠ FLAGGED FOR PETTER

Previously flagged in the initial resolution report. Still pending — no change possible remotely.

- **Path**: `C:/Users/pette/Projects/strale/.claude/worktrees/recursing-gauss-fb67a1`
- **State**: git worktree metadata was removed (doesn't show in `git worktree list`); branch `claude/recursing-gauss-fb67a1` was deleted. Directory is orphaned on disk only.
- **Cause**: Windows file lock on something inside the directory. CC can't close another process's file handles remotely.
- **For Petter to do**:
  1. Close any editor / terminal / IDE window pointed at `.claude/worktrees/recursing-gauss-fb67a1`.
  2. `rm -rf .claude/worktrees/recursing-gauss-fb67a1`.
  3. Takes 30 seconds.

---

## Close-out state after this follow-up session

- **Main SHA**: `57fa894` (merge of #19) — this is the final SHA of Batch 2. The report commit on top will bump this again.
- **Stash**: `git stash list` → empty. The pre-Phase-C-closeout-session stash is gone; tracked changes shipped via #13 + #14, preserved untracked files live under `archive/`, delete-category items were destroyed by the drop.
- **PRs merged in this session**: #18 (script cleanup), #19 (archive extraction).
- **Branches deleted**: `chore/script-cleanup`, `chore/stash-cleanup` (both fully merged, local prune will pick them up on next `git fetch --prune`).
- **Archive tree count**: 58 files under `archive/` (57 extracted + 1 README).
- **Live smoke**: `/health/deep` still returning 200 in 5 ms.

## Updated ops punch-list for Petter

From this follow-up only — initial items 3a / 3b / 3d are restated here with new state context:

| Item | Status | Action |
|---|---|---|
| `healthcheckPath` → `/health/deep` | pending, dashboard-only | Railway dashboard → strale → Settings → Deploy → set path + 10s timeout |
| `strale-digest-cron` service | pending, dashboard-only | Follow recipe in `archive/submissions/...` or `apps/api/railway-config.md` (shipped in PR #16) |
| `ALCHEMY_API_KEY` | optional | Only if wanting Alchemy primary; fallback already working |
| Orphan worktree dir at `recursing-gauss-fb67a1` | pending, OS lock | Close editor → `rm -rf` |
| `claude/practical-maxwell` `source` column decision | deferred to Session 5 | Design call on overlap with `integrity_hash_status` before any schema change |
| `claude/infallible-murdock-8d0bc1` reference branch | preserved indefinitely | Keep as Phase B+C history |

Everything else from the original inventory has either been shipped, archived, or discarded.
