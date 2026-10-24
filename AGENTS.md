# Strale — agent contract (Claude Code and Codex)

**This file is canonical for both tools.** `CLAUDE.md` imports it and adds
Claude-only notes. The detail lives in the files the reading map names; read
them when a task needs them. This contract was cut under DEC-20261024-A. The
text it replaced is preserved verbatim in
`archive/sessions/2026-10-24-entrypoints-before-contract-cut/`, and the
coverage walk is `archive/sessions/2026-10-24-contract-cut-coverage-walk.md`.

**Times for Petter:** give every time in Swedish local time (Europe/Stockholm,
CET or CEST in summer), never UTC. UTC stays in machine artifacts only: logs,
receipts, cron, commit metadata. Petter, 2026-10-15.

## What Strale is

Strale is the global library of tools that AI agents use and pay for per call.
One connection gives access, paid with an API key or with a wallet over x402.
Official-source company and compliance data is the flagship (DEC-20261023-B).

Stack: Node.js and TypeScript, Hono, PostgreSQL with Drizzle, Stripe Checkout
wallet top-ups, x402 USDC on Base, Railway (US East), Browserless.io.

Layout: `apps/api` (API, capabilities, db, lib), `apps/web` (website),
`packages/*` (published SDKs, MCP server, framework packages),
`manifests/*.yaml` (one per capability), `docs/`, `archive/`.

Live counts come from `GET /v1/platform/facts`, never from prose.

## Non-negotiables (always in force)

1. **`main` deploys production.** Never commit or push to `main`. It changes
   only through reviewed PRs merged on GitHub. Pushing a feature branch is
   routine backup. The git hooks refuse both.
2. **Authority is bound to code.** Production writes go through
   `apps/api/src/lib/production-authority.ts`. Being right about an action is
   not authority to take it, and a permission you do not hold is a stop.
   - Only Petter decides: spend beyond the envelope; anything legally binding
     Moonlighter AB; one-way public acts; pricing outside the €0.02–€1.00
     band; claims made to regulators.
   - No technical question goes to him (DEC-20260815-A; `docs/company/CHARTER.md`).
3. **Customer-data boundary.** No outreach derived from transaction evidence.
   Telemetry gives anonymous product insight only. Content is redacted at 90
   days. Widening any of this is Petter's call (DEC-20260815-A).
4. **Data access** (DEC-20261023-A).
   - **Never:** logins or fake accounts; getting around blocks; harvesting
     people data for resale (AML/KYB screening excepted); commercial
     aggregators; resale against vendor terms.
   - **Allowed with checks:** a customer-directed single fetch that stops at
     blocks, uses an honest user agent and honours robots.txt; per-call public
     reads whose terms permit them.
   - **Preferred:** official APIs, licensed data, statutory registries.
5. **Shared checkout.**
   - An agent that edits files runs in its own worktree.
   - Never `git checkout` a branch in the main tree.
   - Never `git stash`: the stash is shared by every worktree.
   - Remove worktrees with `git worktree remove`, never `rm -rf`.
   - If committed files suddenly vanish, it is the shared-checkout bug, not a
     deletion: run `node scripts/guard-tree-integrity.mjs`.
6. **Decisions are append-only.** Never edit a decision record's substance. A
   reversal is a new record that supersedes the old one, following
   `docs/governance/protocols/SUPERSEDING_DECISIONS.md`. If a request
   contradicts an active decision, quote it and ask before acting.
7. **Fix root causes.** Never bend a test, fixture, threshold or allowlist to
   make a capability look healthy.
8. **Git unavailable → stop.** Fix it before doing anything else.

## Reading map: read the file before you do the thing

| When you are about to… | Read |
|---|---|
| review a change, or prepare one for review | `REVIEW.md` |
| add, change or onboard a capability | the `onboard-capability` skill; `CAPABILITY_ONBOARDING.md` and `CAPABILITY_ONBOARDING_PIPELINE.md` (DEC-20260320-B) |
| fix a cert-audit finding, or touch a wallet, audit-trail, chain, spend-cap or idempotency path | `AUDIT_FOLLOWUP_TEST_COVERAGE.md` (DEC-20260504-A) |
| fix a long-silent bulk operation (retention, archival, reconciliation) | `BULK_OPERATION_DEPLOY.md` (DEC-20260504-B) |
| add code that depends on a migration, env var, build step, startup hook or cron | `DEPLOY_MECHANISM_VERIFICATION.md` (DEC-20260504-C) |
| touch a `*-strale` package, publish anything, or touch a PR outside `strale-io/*` | `DISTRIBUTION_PR_INTEGRITY.md` and `DISTRIBUTION_PR_PREFLIGHT.md` (DEC-20260422-A) |
| switch a capability's upstream vendor | the `vendor-switch` skill |
| add a health probe or a paid upstream call, or schedule a test | `TEST_INFRASTRUCTURE_COST_PRINCIPLES.md` |
| emit money, scores or dates from a trust or public endpoint | `WIRE_SHAPE_TRUST_ENDPOINTS.md` |
| change a fact shown on several surfaces (counts, vendors, retention, free tier) | `DRIFT_PREVENTION_SURFACES.md`, `CROSS_REPO_UPDATES.md` |
| change startup migrations, or cite evidence | `EVIDENCE_RECEIPTS_MIGRATION_LEDGER.md` |
| read or add an env var, a model id or a public claim | `CHEAP_EXTRAS_REGISTERS.md` |
| work on capabilities, tests, the free tier, x402 or KYB solutions | `CAPABILITIES_AND_QUALITY.md` |
| create or remove a worktree, or run parallel agents | `SHARED_CHECKOUT_RULE.md`, `WORKTREE_NODE_MODULES_HAZARD.md`, `WORKTREES.md` |
| produce a public-facing design value | `DESIGN_TOKENS.md` |
| write research or record an idea | `RESEARCH_AND_IDEAS.md` |
| resume multi-batch work | `PROGRAM_REGISTER.md`, then `docs/programs/README.md` |
| file a report or add a file at the repo root | `REPORT_FILING.md` |
| supersede or contradict a decision | `SUPERSEDING_DECISIONS.md` |
| look up a decision | `docs/decisions/ACTIVE.md` (summary list), `docs/decisions/records/` (full records) |
| run the daily operating run or write the CEO brief | `docs/company/DAILY-RUN.md` |
| take a production action, or escalate to Petter | `docs/company/CHARTER.md` |

Protocol files named without a path are in `docs/governance/protocols/`,
which holds their authoritative text.

## Session contract

1. **Orient.**
   - Read `docs/programs/README.md`, then the active track's `next_action`
     and `resume_file` in `docs/programs/<program>/tracks.yaml`.
   - Claude Code prints this at session start; Codex runs
     `npm run handoff:orient`.
   - Work in a batch worktree (`strale-wt-<track>`) on a `type/kebab-name`
     branch cut from `origin/main`. The trunk stays on `main` and clean.
2. **Commit and review.**
   - Use Conventional Commits.
   - Each PR gets the review its tier needs (`REVIEW.md`): an independent
     review in a separate context, same provider allowed (founder policy,
     2026-09-07).
   - The PR body says which review ran, plus `GO at <sha>, rounds: <n>`.
3. **Ship.** The session that opens a PR merges it once review and CI pass,
   then reports in plain English. A merge is not "shipped" until the served
   artifact is verified in production (DEC-20260815-A).
4. **Gate before stopping.** `npm run handoff:check` must pass:
   - no uncommitted paths;
   - the branch pushed;
   - no merged branch left behind;
   - every code change accompanied by an updated `next_action`, or by a new
     `handoff/_general/from-code/YYYY-MM-DD-<topic>.md` starting with
     `Intent:`.

   Full text: `docs/governance/protocols/SESSION_CONTRACT.md`.
5. **Hooks** come with `npm ci` (`core.hooksPath=.githooks`):
   - pre-commit regenerates the archive and handoff index, and refuses
     commits on `main`;
   - pre-push refuses pushes to `main`.

## Where things live

| What | Where |
|---|---|
| Decisions | `docs/decisions/` |
| Charter, goals, voice, claims, lessons, ideas | `docs/company/` |
| Programs | `docs/programs/` |
| Research | `docs/research/` |
| Design tokens | `design/tokens/` |
| Env manifest | `config/env-manifest.yaml` |
| Model ids (the only place they may appear) | `apps/api/src/lib/models.ts` |
| Platform facts | `apps/api/src/lib/platform-facts.ts` |
| Reports and dated evidence | `archive/sessions/`, `archive/receipts/` |
| Handoffs | `handoff/` |

The repo root holds only:
- `README.md`, `AGENTS.md`, `CLAUDE.md`, `REVIEW.md`, `WORKTREES.md`,
  `LICENSE`, `Dockerfile`;
- the monorepo build files: `package.json`, `package-lock.json`,
  `tsconfig.json`;
- four registry manifests that must stay at the root: `context7.json`,
  `glama.json`, `server.json`, `smithery.yaml`.
