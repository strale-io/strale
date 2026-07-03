# Pre-resolution investigation — two questions

**Date**: 2026-04-18
**Mode**: read-only. No checkouts, no commits, no pushes, no Notion writes, no npm publishes. One file written (this one).

Two questions answered below, so Petter can decide resumption vs. discard without having to re-read the code himself.

---

## 1. `claude/practical-maxwell` — plain English summary

### What it actually contains

The branch has **one commit** not on main:

- **`9a0de14`** (2026-04-14) — *feat(digest): add external API calls section + document cron service* — author petterlindstrom79.

Divergence point: `merge-base` is `8510caa` on main (72 commits behind current `origin/main`).

The associated worktree also has **five uncommitted files** on top of that commit, all centered on adding a new `source` column to the `transactions` table.

### What the feature does (the committed half)

This is an improvement to the daily digest — the once-a-day summary email
that Resend ships to Petter. Before, the digest counted "all transactions"
but couldn't distinguish real customer activity from Petter's own test
calls. The commit adds a new "External API calls (last 24h)" section
with four numbers:

- **authenticated external calls** — real users calling `/v1/do` with a key
- **free-tier external calls** — anonymous calls to the 5 no-auth
  capabilities (`email-validate`, `dns-lookup`, `json-repair`,
  `url-to-markdown`, `iban-validate`)
- **failed external calls** — same filter, `status = 'failed'`
- **top 10 external capabilities by volume**

The filter logic, as implemented in `fetch-platform.ts`:

1. Exclude the system test user (`system@strale.internal`, UUID lookup at
   query time).
2. Exclude internal humans by email suffix: `@strale.io`, `@strale.dev`,
   `@strale.internal`, `@example.com`.
3. Exclude a per-address allowlist that currently holds
   `petterlindstrom@hotmail.com`.
4. Keep only transactions where `transparency_marker != 'algorithmic'` —
   i.e. rows that actually called an upstream data source (as opposed to
   pure-computation stuff like `iban-validate` format checks that never
   touched the network).

This is exactly the "who is actually using us" metric that had been
absent from the digest.

### What the cron does

A new Railway service, **`strale-digest-cron`**, runs the digest job
once per day. The commit doesn't create the service — it documents how
Petter should create it in the Railway UI. The key points from the new
`apps/api/railway-config.md` section:

- **Schedule**: `30 5 * * *` UTC → 07:30 CEST in summer, 06:30 CET in
  winter. DST drift of ±1 hour is accepted as a non-issue for an
  informational email.
- **Start command**: `node apps/api/dist/jobs/daily-digest.js` — runs the
  digest directly in-process. No HTTP round-trip through
  `POST /v1/admin/digest`, so no `ADMIN_SECRET` is needed on the cron
  service.
- **Cost per run**: one execution of the `fetch-platform` query fan-out
  (≈ 8 SQL aggregates over `transactions` + a users-table join) + one
  call to the existing `analyzeDigest` Claude routine (on the order of a
  few thousand tokens). Negligible — probably $0.01–$0.05 per day in
  Anthropic fees, zero marginal DB cost beyond the normal pool.
- **Same Docker image as `strale`** — the build already produces
  `apps/api/dist/jobs/daily-digest.js`, so no Dockerfile change needed.
- **Restart policy**: `Never`. Exiting cleanly is success.
- **Shared env vars**: `DATABASE_URL`, `RESEND_API_KEY`,
  `ANTHROPIC_API_KEY`, `NOTION_TOKEN`, `GITHUB_TOKEN`. All inherited from
  the project-level variables, none newly defined.

### The migration (the uncommitted half)

Five uncommitted files in the worktree that try to replace the email-and-
ID-list filter above with a simpler `WHERE source = 'customer'` filter:

| File | What it does |
|---|---|
| `apps/api/src/db/schema.ts` | Adds `source: varchar("source", { length: 16 })` to the `transactions` Drizzle table (nullable, no default). |
| `apps/api/drizzle/0045_transaction_source.sql` | SQL migration: `ALTER TABLE transactions ADD COLUMN source varchar(16)`; backfills `'test'` for rows authored by `system@strale.internal`, `'customer'` for everything else; creates `transactions_source_created_at_idx` on `(source, created_at DESC)`. |
| `apps/api/scripts/run-migration-0045.ts` | Idempotent runner that guards each step with `information_schema` checks — safe to run multiple times. |
| `apps/api/check-db.ts` | 8-attempt retry loop that probes `DATABASE_URL` and prints `now()` + DB size. Ops utility, not part of the feature. |
| `digest-preview.html` | Rendered sample digest (HTML), probably a screenshot aid. |

The intended column values: `'customer'` (real external traffic —
authenticated or free-tier anonymous), `'test'` (scheduled test runs from
`system@strale.internal`), `'retry'` (customer retry attempts), `NULL`
(rows older than the column, treated as `customer` for back-compat).

### How it collides with existing work

Three existing columns already live in the same semantic space on the
`transactions` table — which is the core problem:

| Column | Source of truth | Values | Purpose |
|---|---|---|---|
| `compliance_hash_state` | Phase C migration `0047` (on main) | `pending` / `complete` / `failed` | Tracks integrity-hash chain state for the retry worker. Phase C. |
| `integrity_hash_status` | Created by an early Phase C migration, then **overwritten by an untracked Retool-or-similar workflow** (see `PHASE_C_COLUMN_INVESTIGATION.md`) | `complete` / `pending` / `customer` / `test` | Double-duty: partly hash state, partly source tagging. The `customer` / `test` values were added post-migration by the external workflow. |
| `source` (proposed) | This migration | `customer` / `test` / `retry` | Clean source tagging. |
| `is_free_tier` (already on main) | `transactions` table default | boolean | Cross-cut: anonymous vs. authenticated. |

Two concrete conflicts:

1. **Migration number collision.** File `0045_transaction_source.sql`
   collides with main's `0045_baseline_invalidation_trigger.sql` — the
   slot is taken. Same pattern that forced the Phase C rename of
   `0047_integrity_hash_status` → `0047_compliance_hash_state`. Must
   renumber to `0048_transaction_source.sql`.
2. **Semantic overlap with the Retool workflow.** If `source` lands as a
   separate column, the untracked workflow on prod keeps writing
   `'customer'` / `'test'` to `integrity_hash_status` and operators are
   now confronted with two columns with literally the same words —
   written by different systems, not guaranteed to agree. This is
   exactly the "SCF-3 untracked workflow modifies production schema"
   finding in `SESSION_5_CARRY_FORWARD.md`, showing up from the other
   direction.

### Completeness estimate

- **Digest + cron feature (committed)**: ~**90% done**. Code compiles,
  SQL is correct, Railway config is fully documented. What's left is
  (a) rebase onto current main (72 commits behind), (b) verify the
  `EXTRA_EXCLUDED_EMAILS = ['petterlindstrom@hotmail.com']` list is
  still the right policy, and (c) actually create the
  `strale-digest-cron` Railway service using the recipe in the doc.
- **`source` column (uncommitted)**: ~**60% done**. Schema + migration +
  runner exist. What's missing is substantial:
  - Renumbering to 0048.
  - A policy decision on `integrity_hash_status` (deprecate its use as a
    source tag? keep both columns? document the overlap?).
  - Writer-side updates at every `insert(transactions)` call site
    (approximately 6–10 locations: `src/routes/do.ts`,
    `src/routes/x402-gateway-v2.ts`, `src/lib/test-runner.ts`, probably
    a few more). Without these, `source` stays NULL on all new rows
    after migration.
  - Schema-validator entry requiring the column (so boot fails on a
    missing migration, matching the Phase C pattern).
  - Consuming `source` in the digest itself (replacing the email/ID
    filter).

### Blast radius if resumed

- **Digest + cron only**: almost none. `fetch-platform.ts` is called
  by the digest path only; no user-facing surface. Railway service
  creation is independent of the main API deploy. One small PR,
  zero migrations, zero schema changes.
- **Plus the `source` column**: medium. One migration (renumbered),
  one schema change, one schema-validator entry, 6–10 insert call
  sites touched. Plus the policy conversation about the Retool
  workflow's overloaded column. Could be another multi-day sprint if
  the policy conversation drags.

### Recommendation

**Resume the digest+cron commit on its own, as a standalone PR. Defer
the `source` column until after an explicit decision on the Retool /
`integrity_hash_status` overlap.**

Concretely:
1. Fresh branch off current `origin/main`.
2. Cherry-pick `9a0de14` onto it. (It's a clean three-file patch — may
   apply without conflict; if anything drifts it'll be in the
   email-suffix list or the digest struct shape.)
3. Verify `EXTRA_EXCLUDED_EMAILS` with Petter.
4. Small PR. Merge. Create the Railway cron service per the recipe.
5. Separately, open a Notion design decision for the `source` column +
   `integrity_hash_status` overlap. Until that decision, leave the
   uncommitted half where it is.

---

## 2. Plugin submission reconciliation

### Short answer

**All three have already been submitted.** The local worktrees are
artifacts of the submission, not work-in-progress.

### Evidence

| Platform | Local worktree status | Upstream status | Notion record | Recommendation |
|---|---|---|---|---|
| **Flowise** (`agent-a5dbdc21`) | `packages/components/nodes/tools/Strale/{Strale.ts, core.ts, strale.svg}`, dated 2026-04-14 00:09 local. Complete node: `Strale_Tools` class registering a `searchAndExecute` / `executeSpecific` tool via LangChain `StructuredTool`. Calls `https://api.strale.io`. | **FlowiseAI/Flowise PR #6209** — `feat(tools): add Strale — 290+ quality-tested data capabilities for agents`, author `petterlindstrom79`, opened 2026-04-13T22:22Z. **OPEN**, `mergeable: MERGEABLE`, `mergeStateStatus: BLOCKED`, `reviewDecision: REVIEW_REQUIRED`, last updated 2026-04-13T22:24Z. | *"Flowise tool node"* (Distribution Surfaces database). Status `Pending`. Notes: "PR #6209 at FlowiseAI/Flowise OPEN, REVIEW_REQUIRED, mergeable UNKNOWN. Last activity 2026-04-13." Last verified 2026-04-17. | **Discard worktree**. Submission is live; what's needed is a review, not another push. If Flowise requests changes, iterate on a fresh branch off the Flowise fork, not this worktree. |
| **LangFlow** (`agent-add49769`) | `src/lfx/src/lfx/components/strale/{__init__.py, strale.py}`, dated 2026-04-14 00:17 local. Complete `StraleComponent` inheriting `LCToolComponent`, with `SearchAndExecuteSchema` and `ExecuteCapabilitySchema`, lazy-import boilerplate in `__init__.py`. | **langflow-ai/langflow PR #12678** — `feat(components): add Strale — 290+ quality-tested data capabilities`, author `petterlindstrom79`, opened 2026-04-13T22:25Z. **OPEN**, `mergeable: MERGEABLE`, `mergeStateStatus: BLOCKED`, `reviewDecision: REVIEW_REQUIRED`, last updated 2026-04-17T21:45Z (so someone pushed a rebase on the 17th). | *"Langflow component"*. Status `Pending`. Notes: "PR #12678 REBASED 2026-04-17: cherry-picked the clean feat commit onto current upstream/main, dropping the 3 stale autofix.ci commits that caused conflicts in starter_projects/*.json. Branch is now MERGEABLE, BLOCKED only on review. Follow-up comment posted." Last verified 2026-04-17. | **Discard worktree**. The already-submitted branch has been actively maintained upstream (rebase on 2026-04-17). Reviewers are the gate, not another push. |
| **Windmill Hub** (`agent-af5f800e`) | `windmill-hub-submission/f/strale/` with five `{name}.script.yaml` + `{name}.ts` pairs (`search_capabilities`, `execute_capability`, `search_and_execute`, `check_quality`, `get_wallet_balance`) + `folder.meta.yaml`, dated 2026-04-14 00:34 local. Complete Windmill folder ready for Hub publication. | **No GitHub PR** (Windmill Hub uses a web-UI submission flow, not a PR flow). But `https://hub.windmill.dev/resource_types/374/strale` returns **HTTP 200** with "Strale" in the page content — the Strale resource type is **live on the Hub**. | *"Windmill script hub"*. Status `Pending`. Notes: "Submitted 2026-04-15 via hub.windmill.dev web UI (no GitHub PR flow). Resource type 'strale' published at hub.windmill.dev/resource_types/374/strale. 5 scripts submitted: search_capabilities, execute_capability, get_wallet_balance, check_quality (no-auth), search_and_execute. All Deno/TypeScript. Awaiting Windmill team review." Last verified 2026-04-15. | **Discard worktree**. Submission landed on 2026-04-15; "Pending" status is waiting for Windmill team review of the 5 scripts, not waiting for Petter to click a button. |

### Additional context (for completeness — Petter has many more open distribution PRs)

A broader GitHub search for PRs authored by `petterlindstrom79` with
"strale" in the title surfaces **14 more open distribution submissions**
across the agent / MCP / x402 ecosystem:

- `PipedreamHQ/pipedream` #20584
- `ever-works/awesome-mcp-servers` #51
- `langchain-ai/docs` #3445
- `heilcheng/awesome-agent-skills` #163
- `habitoai/awesome-mcp-servers` #28
- `agentic-community/mcp-gateway-registry` #723
- `Merit-Systems/awesome-x402` #111
- `IBM/mcp-context-forge` #3974
- `crewAIInc/crewAI-examples` #358
- `punkpeye/awesome-mcp-servers` #3696
- `awslabs/agentcore-samples` #1232
- `docker/mcp-registry` #2202
- `agno-agi/agno` #7203
- *(and Flowise #6209 + LangFlow #12678, already covered above)*

These are out of scope for the current question (the brief asked about
Flowise / LangFlow / Windmill specifically), but flagging them so the
next session knows there's a broader distribution-PR backlog that's
"open but also submitted" in the same sense.

### Conflicting evidence

None. All three signals (local worktree → upstream state → Notion record)
agree:

- Flowise: worktree is the submitted content; PR #6209 is the submission;
  Notion says submitted and pending review.
- LangFlow: worktree is the submitted content; PR #12678 is the
  submission; Notion notes a 2026-04-17 rebase (upstream `updatedAt`
  confirms this, so the rebase landed).
- Windmill: worktree is the submitted content; Hub URL returns 200 with
  Strale listed; Notion says submitted 2026-04-15 via web UI.

The only thing that looked *like* conflicting evidence at first — local
worktree dates (2026-04-14 00:09/00:17/00:34) preceding the Notion
submission timestamps (2026-04-13 for Flowise/LangFlow PRs, 2026-04-15
for Windmill) — resolves cleanly: the worktree is where the work was
drafted, then pushed / submitted immediately after.

### Recommendation summary

The three worktrees are complete, already-submitted artifacts. There is
no further action needed from them. When Petter runs the resolution
session:

- **Worktree `agent-a5dbdc21`** (Flowise) — remove worktree, leave branch
  alone (branch already points at a commit on main; it's just cruft).
- **Worktree `agent-add49769`** (LangFlow) — same.
- **Worktree `agent-af5f800e`** (Windmill Hub) — same.

If any of the three submissions gets reviewer feedback requesting
changes, the right response is a fresh branch off the latest upstream
`main` (e.g. off `langflow-ai/langflow@main`), not reusing these local
worktrees.

---

## Commands used (all read-only)

```
git merge-base origin/main claude/practical-maxwell
git log --oneline origin/main..claude/practical-maxwell
git show --stat <sha>
git show <sha> -- <path>
git -C <worktree> status --short
git -C <worktree> diff <path>
find <worktree-path> -type f

cat <file>              # read-only reads on worktree files

gh pr list --repo <upstream> --state all --search strale
gh pr view <N> --repo <upstream> --json state,mergeable,mergeStateStatus,reviewDecision,updatedAt
gh api search/code?q=strale+repo:<upstream>
gh api search/issues?q=author:petterlindstrom79+is:pr+strale
curl -s -o /dev/null -w "%{http_code}" https://hub.windmill.dev/resource_types/374/strale

notion-search "Flowise LangFlow Windmill distribution submission"
notion-fetch <page-id>   # on the Distribution Surfaces rows only
```

No state change: no Git checkout/commit/push/merge/rebase/stash operation,
no `gh pr create`/`merge`/`close`/`comment`, no Notion writes, no npm
publishes. Only file written: `PRE_RESOLUTION_INVESTIGATION.md`.
