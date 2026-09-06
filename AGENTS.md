## About this file

AGENTS.md is the Codex-CLI counterpart to `CLAUDE.md`. It is a **condensed
derivative** — CLAUDE.md is canon. Where a fact can drift (capability/solution
counts, decision full text, which solutions are active, exact protocol steps),
this file points at the CLAUDE.md section or the canonical source (the
`solutions`/`capabilities` tables, `GET /v1/platform/facts`) instead of
restating it. Refresh this file against CLAUDE.md when drift is noticed —
don't let it silently go stale again. (It was ~4 months stale as of
2026-08-17; see `docs/company/CHARTER.md` and the Report Filing Convention
section of CLAUDE.md for the history.)

## Session Start

1. Declare session intent (one sentence).
2. Determine mode — **Quick** (bug fix, config change, <2h, no design
   decisions) vs **Full** (new feature, design exploration, multi-component,
   anything requiring decisions). Full criteria and escalation triggers:
   `.claude/PROTOCOL.md`.
3. Escalation triggers: second feature touched, design decision emerges,
   >2hr estimate, contradiction detected.

## Review routing

Read `CLAUDE.md` -> "Review routing" in full, including its dated amendments
and the review-backlog obligations. Do not use a copied subset of that
section: a later amendment can change how earlier instructions apply.
Explicit current founder instructions take precedence over repository copies;
record any resulting review limitation without silently closing historical
backlog rows or treating an old quota note as current account status.

## Repo-native migration continuation — pre-cutover

For continuation of the repo-native operating-model migration, create an
isolated worktree from current `origin/main`, then read the **Current
continuation checkpoint** in
`docs/strategy/2026-08-31-repo-native-operating-model-migration.md` and the
handoff it names. Never choose the next migration task from the dirty shared
checkout or an older dated handoff. This pointer does not activate candidate
project documents or retire Notion before M4.

## Program register — where multi-batch work resumes

Long-running work is tracked in `docs/programs/` (index: `docs/programs/README.md`).
Each program has a `PROGRAM.md` with a **Resume here** section and a
machine-checked `tracks.yaml` (`npm run programs:check`). A session continuing
a program starts with those two files and follows their pointers: the active
track's `resume_file` names anything else that batch needs. The migration
checkpoint above is the M2-through-M7 detail behind the `cto-readiness`
program. Programs are execution records, not project truth.

## Research and ideas — where each one lives

Research goes to `docs/research/` in the dated, front-matter template
(`docs/research/research.schema.json`), checked by `npm run research:check`:
one `current` file per topic, reciprocal and acyclic supersession, resolvable
links and sources, and no active decision record citing research that is not
current. Research is evidence, never authority — a finding that changes
direction produces a decision record, not a rewrite of the research file.
Ideas go to `docs/company/IDEAS.md`, nowhere else — not a Journal entry, not a
prose aside in a plan or handoff.

## Design tokens — where design values live

Design values are data, in `design/tokens/`, not prose or hardcoded literals
in code. `design/tokens/active.json` is what production runs, per surface,
with provenance and the decision that adopted it. A direction under
consideration is a candidate — `design/tokens/candidates/*.json` — and
carries its own status (`exploring` → `proposed` → `adopted` | `rejected`).
Promotion is a decision record plus a file swap, never an edit to
`active.json` values in place. If a value the tokens don't have is needed
anywhere a surface's design is consumed, add the token first — never reach
for a literal. `npm run design:check` refuses off-token colours, fonts, and
off-scale spacing/radii in the surfaces it covers. See `design/README.md`
and `design/PROVENANCE.md`.

## Cheap extras — env manifest, model registry, claims register (T14)

Three more small "values are data" registers, same shape as tokens/research/
programs. `config/env-manifest.yaml` (schema `config/env-manifest.schema.json`)
is one row per distinct `process.env.NAME` read under `apps/api/src`,
`apps/api/scripts`, `packages`, and `scripts` — purpose, provider, holder,
cost class, where it's required and where it's actually set. `npm run
env:check` fails on an undocumented read or a dead row; `npm run env:example`
regenerates `.env.example` and `apps/api/.env.example` from it.
`apps/api/src/lib/models.ts` is the only place a Claude/Voyage/GPT model id
may live — every capability imports a role (`MODELS.capability_default.id`,
etc.), never a literal. `npm run models:check` fails on a model-id literal
anywhere else, or a registry entry missing `pinned_at`/`decision`.
`docs/company/claims.yaml` (schema `docs/company/claims.schema.json`, writing
rules in `docs/company/VOICE.md`) rules every public claim `allowed` |
`needs_evidence` | `forbidden` | `retired`. `npm run claims:check` scans
README.md, package READMEs, manifest descriptions, and `platform-facts.ts`
(plus, read-only, the sibling frontend's `llms.txt` when present) and fails
on a forbidden claim. All three are wired into CI after `design:check` /
`design:test`.

## Evidence receipts and the migration ledger (T15)

Evidence is a receipt file under `archive/receipts/`, cited by path — never a
bare test count in prose. A receipt (`archive/receipts/receipt.schema.json`;
naming rule `YYYY-MM-DD-<kind>-<topic>.json`) is written once, by the tool
that produced it, and never edited afterward; `npm run receipts:check`
enforces this as a git fact (a tracked receipt's blob at HEAD must match the
blob at the commit that first added it), validates the schema, checks that
every `evidence:` / `production_evidence:` path cited from a decision
record, a program track, or a remediation package resolves, and warns on a
post-2026-09-02 handoff stating a test count with no receipt link. Write one
with `npm run receipt -- --kind <kind> --topic <topic> --from <file|->`.
Migration blocks in `apps/api/src/lib/startup-migrations.ts` are
append-only and ledgered: `apps/api/src/lib/startup-migrations.ledger.json`
carries a content hash and `columns_written` per block, and `npm run
migrations:check` fails on an edited block (the fix is a new block, never
an in-place edit), an unledgered block, or two blocks writing the same
column unless it's allowlisted in `known_overlaps` — the 2026-08-21
incident class, where two blocks derived one column and fought every boot.
Both wired into CI after `docs:test` / `archive:index:test`.

## Session contract — both tools, every session

1. **Orient first.** Read `docs/programs/README.md`, then the active track's
   `next_action` and `resume_file` in `docs/programs/<program>/tracks.yaml`.
   Claude Code prints this at SessionStart; Codex runs `npm run handoff:orient`.
   Work happens in one batch worktree (`strale-wt-<track>`) on a feature
   branch cut from `origin/main`; the trunk stays on `main` and clean
   (`WORKTREES.md`).
2. **Gate before stopping.** `npm run handoff:check` must pass before a session
   ends: no uncommitted paths, the branch pushed to its upstream, at most one
   batch worktree, no merged branch left locally or on the remote, and every
   code change accompanied by an updated `next_action` in the program register
   or a new `handoff/_general/from-code/` file. The check prints one fix per
   finding; apply them and rerun. Claude Code's Stop hook
   (`.claude/settings.json`) requests continuation on failure, with a
   six-block escape for repeated finding codes. That escape records failure;
   it does not mean the gate passed. Codex's notify
   wrapper (`scripts/handoff/codex-notify.mjs`, chained in
   `~/.codex/config.toml` by its trunk path, which must exist on `main`)
   records the result in
   `.claude/state/handoff/last-codex.json`, which the next session's
   orientation shows, and `.codex/hooks.json` blocks the stop the same way
   when the hook is enabled, trusted, discovered, and successfully invoked.
   Hook commands resolve their script from the current Git worktree root,
   including when the session starts in a subdirectory. Notify records a result after the turn; it does not block stopping.
   A Codex session runs the check itself
   before its final turn and fixes what it lists.
3. **Git hooks come with `npm ci`** (`prepare` runs the same installer as
   `npm run hooks:install`, setting `core.hooksPath=.githooks` for every
   worktree of the clone):
   pre-commit refuses a commit on `main` and an inventory-target edit without
   `npm run context:generate`; pre-push refuses a direct push to `main`.
   `main` changes only through reviewed PRs merged on GitHub; pushing the
   working branch is routine backup and needs no approval. Worktrees and
   branches recorded in `scripts/handoff/baseline.json` wait for a founder
   decision and are never deleted by a session.

## Notion & GitHub Access

- Project Home: https://www.notion.so/31167c87-082c-81fb-96da-d3188d34aa72
- To-do & Build Plan: https://www.notion.so/33c67c87-082c-81c3-a72b-cc59b10ff4ac
- Decisions DB: `ea57671f-7167-44e4-a254-c0a1de79e7f9`
- Repo: strale (local). Main branch: `main`. Feature branch pattern:
  `type/kebab-description`.

Full workspace structure, governance rules (one page per topic, To-do DB is
the only task list, brainstorms → Journal DB, etc.) and the project-spec
pointer: CLAUDE.md → "Notion Access" / "Notion Workspace Structure" /
"Notion Governance Rules".

## Tech Stack & Project Structure

Node.js + TypeScript, Hono, PostgreSQL + Drizzle. Monorepo: `apps/api` (Hono
server), `packages/*` (SDKs, MCP server, framework plugins). Hosting,
processing region, payments vendor, and headless-browser vendor are the kind
of facts this file doesn't restate (vendor names and processing region are
canonical drift-prevention surfaces — see below): read CLAUDE.md → "Tech
Stack" or `GET /v1/platform/facts`. Full tree diagram and package list:
CLAUDE.md → "Project Structure".

## Shared-Checkout Rule (concurrency safety — read before touching git)

**This checkout is shared.** Several Claude Code and Codex sessions and
background agents run against the same working tree at once. Git branch
switching is not concurrency-safe here.

**The failure mode:** an agent runs `git checkout <branch>` in the main tree
while another process holds file locks (tsc, vitest, npm, an editor). On
Windows git's delete-then-rewrite sequence fails partway — old files are
unlinked, new ones never written. ~1,000 tracked files vanish from disk while
the index still lists them, always in `apps/api/**` and `packages/**` where
node holds handles. Hit three times on 2026-08-14.

**Rules:**

1. **Any agent that edits files MUST work in its own worktree** (isolation
   mode, or `git worktree add` for Codex sessions without a built-in
   equivalent). An agent working in the shared checkout will eventually
   collide with the main loop or another agent. This is the actual
   prevention.
2. **Agents must never `git checkout` a branch in the main tree.** If a
   session without worktree isolation needs a branch, create your own
   worktree rather than moving the shared one.
3. **Before branch-switching in the main tree, check `git status`** for
   another session's uncommitted work. Uncommitted changes travel across
   branch switches and can end up staged onto the wrong branch.
4. **Never "fix" phantom breakage.** If files that are committed suddenly
   ENOENT, that is this bug, not a real deletion. Run
   `node scripts/guard-tree-integrity.mjs` (or any Bash command, if the
   PostToolUse hook is wired) and re-check before diagnosing further.
5. **Never use `git stash` in any worktree of this clone.** `refs/stash` is
   repo-wide, shared across ALL worktrees — concurrent sessions' stash
   push/pop interleave, and a pop in one worktree can consume (and on
   conflict, destroy) another session's stashed work. Hit on 2026-08-16: one
   agent's `stash pop` returned a sibling agent's quality-floor changes. For
   fail-before verification or temporary reverts, use
   `git checkout <base-sha> -- <paths>` + `git checkout <branch> -- <paths>`
   to restore, or a temporary WIP commit. If a stash accident happens,
   recover via `git fsck --dangling` (stash commits survive as dangling
   commits) and save the foreign diff to a patch file — never discard it.

The guard at `scripts/guard-tree-integrity.mjs` auto-repairs tracked-and-
deleted paths and is wired as a PostToolUse/Bash hook in `.claude/settings.json`
(tracked since T3 alongside the session hooks; machine-local additions go in
the ignored `settings.local.json`). It is a safety net, not a substitute for
rule 1.

### Worktree node_modules hazard

Creating a Windows directory junction from a temporary worktree to the main
checkout's `node_modules`, then later removing that worktree with `rm -rf`,
follows the junction and **deletes the real `node_modules`** in the main
tree. Symptom: every command fails with `ERR_MODULE_NOT_FOUND` for packages
that are definitely installed. No source is lost — it's generated — but
recovery requires `npm install` at the repo root, then
`npm --workspace=packages/mcp-server run build`, or `src/routes/mcp.ts` shows
phantom type errors. **Rule:** run `npm install` inside each worktree instead
of linking, and remove worktrees with `git worktree remove`, never `rm -rf`.

## Mandatory Protocols — trigger list

Each of these is **non-negotiable** once its trigger fires; a prompt that
doesn't mention the protocol's steps does not make them optional. Full text
of every protocol (required steps, background incident, end-of-session
report format, what it does/doesn't override) lives in CLAUDE.md under the
matching heading — read it before acting once a trigger fires.

| Trigger (verbatim scope from CLAUDE.md — treat as a superset, not a paraphrase) | Protocol | CLAUDE.md heading |
|---|---|---|
| New executor file in `src/capabilities/`, new or modified DB row in `capabilities` table, new capability slug, manifest file, seed entry, OR the prompt mentions adding/creating a capability | Capability Onboarding Protocol (DEC-20260320-B) | "Adding New Capabilities (MANDATORY PIPELINE)" + "Capability Onboarding Protocol" |
| The session prompt mentions a PR on a framework repo (Pipedream, LangFlow, Flowise, pydantic-ai, langchain, crewAI, agno, composio, semantic-kernel, awesome-list, etc.), OR modifies files under `packages/*-strale/`, OR edits PyPI/npm publication metadata | Distribution PR Integrity Protocol (DEC-20260422-A) | "Distribution PR Integrity Protocol" |
| The commit message references a cert-audit finding code (Y-/A-/B-/RED-/MED-/CRIT-/F-AUDIT-), OR the change adds/modifies a function that runs inside a wallet transaction, an audit-trail builder, a chain-integrity primitive, a spend-cap check, an idempotency check, or **any other money/compliance-critical path** | Audit-Follow-up Test Coverage Protocol (DEC-20260504-A) | "Audit-Follow-up Test Coverage Protocol" |
| ANY deploy that fixes a long-silent bulk operation (retention, archival, reconciliation, batch processing, periodic cleanup) | Bulk-Operation Deploy Protocol (DEC-20260504-B) | "Bulk-Operation Deploy Protocol" |
| ANY PR that adds a code path which depends on a deploy-pipeline behavior (migrations running, env vars read, build steps, startup hooks, **scheduled jobs**, cron triggers) | Deploy Mechanism Verification Protocol (DEC-20260504-C) | "Deploy Mechanism Verification Protocol" |

Also always in force: Test Infrastructure Cost Principles (zero-cost health
probes, input validation before paid APIs, piggyback suites never scheduled)
and the Wire-shape rule for `/v1/public/ops/trust/*` and money/score/date
fields generally — see CLAUDE.md for both.

**Code-review gate:** if any code was modified this session, run the `go`
skill (`.agents/skills/go/SKILL.md`) before ending the session — never end a
session over unreviewed code. Docs-only / AGENTS.md / Notion-only sessions
are exempt.

## Active Decisions

Full list and text: CLAUDE.md → "Active Decisions". Do not restate decision
content here — thresholds, bands, and constraints inside a Decision are
exactly the kind of thing that drifts; read CLAUDE.md (or the linked Notion
Decisions DB entry) for the actual text before acting on any of these. The
IDs every session should know exist, topic only, no numbers:

- **DEC-20260905-A** — Benefit-first brand positioning, marketing terminology and Quiet Material refinement scope; see CLAUDE.md and the linked adoption record.
- **DEC-20260902-A** — Website redesign is built as `apps/web` in this
  repository (monorepo); `strale-frontend` preserved, not extended.
- **DEC-20260812-A** — Readiness program / operating strategy.
- **DEC-20260813-A** — Scraping-doctrine interpretation (per-call registry
  parsing).
- **DEC-20260815-A** — Operating charter. Division of authority kept inline
  below (the one Decision this file restates, deliberately).
- **DEC-20260428-A** — Third-party scraping doctrine (three-tier).
- **DEC-20260428-B** — Engineering bar for Strale-built regulatory-grade
  data services.

**Conflict duty:** if a request would contradict an active Decision, state
the conflict before proceeding — quote the Decision, ask the human to
confirm, supersede, or revise.

## Operating Charter (DEC-20260815-A) — division of authority

Full text: `docs/company/CHARTER.md` (authoritative if this paragraph and
CLAUDE.md ever diverge). Governing principle: *the tier of risk stays the
same, the width expands.* No technical question goes to Petter — architecture,
implementation, what to measure and how, what to build and in what order,
testing, tooling, and vendor-API choice are all Claude's/Codex's to decide;
asking him to arbitrate a technical choice is a failure of the role. The
agent also decides-then-tells on: turning services on/off, pricing inside
the existing €0.02–€1.00 band, quality gates, quarantine/promote, refunds,
retries, delisting, merging its own work once repo gates pass, dispatching
agents, scheduling sessions, and spend inside €50/week. **Petter alone
decides — reserved, not delegable:** spend beyond the €50/week envelope;
anything that legally binds Moonlighter AB, which the charter defines
broadly — creating accounts, accepting terms, signing agreements, or
**contacting a vendor as the company at all** (not just signing a contract);
one-way public acts (publishing a package version that can't be unpublished,
a first statement in a channel never used before); pricing outside the
existing band; and anything a regulator would read as a claim about the
product. The charter's founder-gated list is broader still — vendor/license
commitments, deactivating revenue earners, DEC-20260428-B-grade builds, new
external claims, **new capabilities** (charter classifies capability creation as approval_required — broad technical authority does NOT delegate it), anything outward-facing (published packages, directory
submissions, vendor contact, social), legal/grey-zone judgment — read
`docs/company/CHARTER.md` before assuming an ambiguous action is delegated;
default to `approval_required` on the decision queue when unclear, never to
acting alone. **Shipping is never Petter's decision** — the session that
opens a PR merges it and reports afterwards in plain English. Customer-data
boundary (no outreach derived from transaction evidence, anonymous-only
telemetry insight, 90-day redaction) is fixed; widening it is Petter's
explicit call.

## Capabilities & Quality

Counts and per-capability status go stale within days. Read `manifests/*.yaml`,
`GET /v1/platform/facts`, or the DB — never trust a static number here or in
CLAUDE.md's prose without cross-checking. Key structural facts that don't
drift:

- The SQS scoring engine was **deleted** (DEC-20260503-B, 2026-05-05). No
  `/v1/quality/:slug`, no `min_sqs`, no lifecycle automation. Circuit
  breakers, fixture mode, and canary mode survive. Never edit
  `src/lib/sqs.ts` to "fix" a score — it doesn't exist; diagnose root cause
  instead (Scoring Integrity, retired but the discipline stands).
- Free-tier capability list is `is_free_tier = true` in the `capabilities`
  table, surfaced via `free_tier_slugs` on `/v1/platform/facts`. The
  per-IP daily limit is FREE_TIER_DAILY_LIMIT in `src/routes/do.ts` — read
  it there, don't restate it.
- x402 pay-per-use (rail details: `platform-facts.ts`) is DB-driven: `x402_enabled` on the
  `capabilities` row. Catalog: `GET /x402/catalog`.
- KYB Essentials/Complete and Invoice Verify solution families (multi-country
  — see the `solutions` table for the current country list) have
  predecessors that overlap them (`kyc-sweden`, `kyc-norway`,
  `kyc-denmark`, `kyc-finland`, `verify-us-company`). Their
  active/deprecated status is **not** recorded in either CLAUDE.md or here —
  production contradicted a stale "deprecated" note on 2026-08-14. Read
  `is_active` / `x402_enabled` on the `solutions` table before acting on any
  of them; do not deactivate on the strength of a doc line.

Full new-capability pipeline (write executor → manifest → `onboard.ts
--discover` → review field reliability → `smoke-test.ts`), flags, and the
manifest template: CLAUDE.md → "Adding New Capabilities (MANDATORY
PIPELINE)". The pipeline (`apps/api/scripts/onboard.ts`) is the only
sanctioned path for capability creation.

## Drift-Prevention Surfaces

When changing a fact that appears on multiple surfaces (capability/country
counts, retention period, vendor names, free-tier list, processing region),
update **only** the canonical source and let consumers read from it:
`apps/api/src/lib/platform-facts.ts` (backend) → `GET /v1/platform/facts` →
`usePlatformFacts()` (frontend). CI guard:
`apps/api/scripts/check-platform-facts-drift.ts`. For vendor switches
specifically, use the `vendor-switch` skill
(`.agents/skills/vendor-switch/SKILL.md`) — it codifies the full
surface-update + DEC-entry checklist. Full detail (wire-shape rules for
money/scores/dates, the shape-contract CI check for `AuditRecord`, the
frozen-fixture contract-test pattern): CLAUDE.md → "Cross-Repo Updates" /
"Wire-shape rule" / "Drift-prevention surfaces".

## Session Checklists

Quick (bug fix / config / small component) and Full (feature / design /
multi-component) checklists — declare intent, connectivity check, do the
work, code-review gate (`go` skill) before ending, write
`handoff/_general/from-code/` file, Journal entry, archive completed To-dos.
Full step-by-step lists: CLAUDE.md → "Quick Session Checklist" / "Full
Session Checklist". The `end-session` skill
(`.agents/skills/source-command-end-session/SKILL.md`) automates the
verify + handoff-file + Journal-entry flow.

## Workflow Invariants (non-negotiable)

- NEVER edit Journal entries, Decision content, or Deferred content.
- NEVER delete anything in Notion.
- Corrections → new Journal entry, type = course-correction.
- Global decisions → ALWAYS get confirmation.
- Supersessions → ALWAYS use the Contradiction Protocol (including a
  CLAUDE.md/AGENTS.md update).

### Degraded mode

If Notion is unavailable: work continues, log to handoff files with
`[BACKFILL]` prefix. If Git is unavailable: **STOP**, fix before proceeding.

## Report Filing Convention

Large investigative/audit/session reports route to `archive/sessions/`
(flat layout, or `archive/sessions/<dirname>/` for wholesale directory
sweeps) — never the repo root. Full convention: CLAUDE.md → "Report Filing
Convention". `AGENTS.md`, `.agents/`, and `.codex/` are **tracked**, derived
from CLAUDE.md, and refreshed on drift — not gitignored (the 2026-08-17
Phase 3 gitignore was the temporary state while this file was stale; this
refresh is the unblock).
