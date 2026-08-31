# Repo-native operating model migration

**Status:** M0 COMPLETE — M1 Foundation merged; M2 reconciliation is next
**Date:** 2026-08-31
**Owner:** Codex
**Independent reviewer:** Claude Code, Sonnet, high effort (wanted Opus; Opus timed out)
**Base audited:** `origin/main@1f222c6ae43e87fc47ea07ef4a6c708b142a2144`
**Decision state:** Petter confirmed the direction on 2026-08-31: the Strale repo
becomes the active project system of record; Notion is retired as an active
authority. The migration decision was collision-checked and recorded as
`DEC-20260831-A`.

> This is the durable implementation plan, not a new source of product truth.
> Until the cutover milestone passes, existing authorities remain in force.
> After cutover, archive this plan under `archive/sessions/` with its review and
> acceptance evidence.

## M0 completion update — 2026-08-31

This update supersedes the quota/completeness gates in the historical execution
dependency amendment below; it does not change the no-dual-authority cutover
rule.

- The private preservation repository is complete at
  `strale-io/strale-context-archive@24713c48` and remains `PRIVATE`.
- Decisions, Journal, To-do, and Vendor Roster have short terminal pages and
  exact captured-unique-ID/source-count parity: 318, 467, 432, and 166.
- Private history was rewritten to a sanitized root after a reusable scanner
  found an older credential that had not been caught by push protection. The
  final archive-wide scan reports zero findings.
- Independent Claude review returned `PASS` and
  `SAFE_TO_MARK_M0_COMPLETE: YES`.
- The preservation prerequisite for M2 is therefore satisfied. M2 still waits
  for the bounded M1 Foundation to land and for the separate product/decision
  audit to be available; no authority has changed yet.
- The clean M1 extraction received an independent Claude `PASS` with zero high,
  medium, or low findings and `SAFE_TO_OPEN_AND_MERGE_PR: YES`. The review is
  recorded at
  `archive/sessions/2026-08-31-m1-clean-extraction-review-claude.md`.

## M1 completion update — 2026-08-31

- The bounded Foundation landed through PR #447 and was squash-merged to
  `main` at `072b54a38ad8c6c68a82628c5031721f219f481e`.
- GitHub validation, repository checks, and database integration all passed.
- The merged layer remains inert and non-authoritative: no root entrypoint,
  hook, CI workflow, skill, command, or application consumer was activated.
- The next milestone is M2 truth reconciliation. It should consume the separate
  product/decision audit, classify the legacy-authority inventory, populate the
  canonical candidates, and receive a fresh independent Claude review before
  any M4 cutover or Notion retirement action.

## Execution dependency amendment — 2026-08-31

Notion's workspace query quota initially prevented full pagination of Decisions,
Journal, To-do, and Vendor Roster. The user cannot obtain a complete workspace
export and directed the implementation to continue trying through the connected
agents. A later allowance window reached terminal capture pages for Decisions
(318 unique rows) and Vendor Roster (166 unique rows), preserved Journal through
offset 300 (400 rows), and To-do through offset 200 (300 rows) before the quota
was exhausted again. Because the SQL used unordered `OFFSET`, Decisions and
Vendor Roster remain provisional until their captured totals match source-side
`COUNT(*)` results.

This changes sequencing, not scope or authority:

- **M0 preservation/export lane remains open.** `pagination-state.json` is the
  resume authority: Journal continues at offset 400 and To-do at offset 300.
  After terminal pages, query `COUNT(*)` for all four sources and require parity
  with captured unique IDs. Retry at most once per new working session while
  the quota is exhausted; do not re-query captured pages or treat repeated
  limit responses as progress.
- **M1 may proceed in parallel** because it is additive, non-authoritative, and
  rollback-safe. It may add directory skeletons, document contracts and schemas,
  a navigation/router shell, generated-view tooling, classification inventory,
  and warning/report-mode guards.
- This sequencing exception is authorized by Claude Code's independent
  `PASS_WITH_FOLLOWUPS` review recorded at
  `archive/sessions/2026-08-31-m1-parallel-sequencing-review-claude.md`; it
  supersedes the earlier review's temporary "M1 must not start" gate while
  leaving its M0 completeness finding unresolved.
- **M1 must not** activate new root entrypoints, label new project documents
  canonical, migrate decision substance, change current product truth, move or
  archive legacy authorities, remove a Notion read/write/secret, or enable a
  blocking cutover guard.
- M1's legacy inventory is **bare enumeration only**: path, content hash,
  owning area, and detected references. Disposition labels such as `migrated`,
  `evidence-only`, `archive`, `obsolete`, or `unclear` remain M2 work.
- Every project-document skeleton and generated view must carry a machine-
  parseable `status: skeleton`/`complete: false` marker plus a visible
  non-authoritative/partial banner. The checker must report if either is absent.
- M1 lands as one bounded Foundation branch/PR and receives an explicit Claude
  milestone verdict. No root hook, CI gate, skill, command, `AGENTS.md`, or
  `CLAUDE.md` consumer may consult the new router or skeletons yet.
- **M2 and every authority-changing step remain gated** on a complete M0 export,
  regenerated manifest, and focused Claude milestone PASS. The parallel
  product/decision audit may continue independently but cannot be promoted into
  the canonical layer before that gate.
- Existing `AGENTS.md`, `CLAUDE.md`, Notion workflows, and authority rules remain
  fully in force throughout parallel M1 work.

Reasoning: an incomplete historical export creates risk when choosing or
retiring truth, not when building an inert container and tests for the future
model. Keeping the boundary mechanical avoids turning a vendor quota into idle
time without weakening the no-dual-authority cutover rule.

## 1. Objective

Make a clean Codex or Claude Code session able to establish, from tracked repo
content alone:

1. what Strale is and who it serves;
2. what is true now;
3. what changed recently;
4. what is being worked on and what comes next;
5. which decisions are active, pending, or superseded;
6. where the detailed authority for a relevant domain lives;
7. which document must change when the session changes project truth.

The migration must reduce the number of authorities, not merely add another
documentation layer.

## 2. Non-goals

- Do not re-audit the product, production, or all historical decisions inside
  this workstream. A parallel product/decision audit supplies reconciled truth.
- Do not merge, deploy, publish, or otherwise accept the active frontend redesign
  merely to preserve it.
- Do not duplicate implementation-specific frontend design-system mechanics in
  the backend repo.
- Do not remove formal security, production-authority, money-path, capability,
  distribution, deployment, or worktree protocols.
- Do not require normal sessions to read archives, old handoffs, daily briefs,
  research, or remediation history.
- Do not make GitHub issues the product roadmap. Issues remain execution units.
- Do not delete historical evidence during the authority cutover.

## 3. Evidence and hazards already established

### Backend documentation state

- 501 Markdown files on the audited `origin/main`.
- Root `CLAUDE.md` is 55.8 KB; root `AGENTS.md` is a 15.7 KB derivative.
- `.claude/` contains 279 KB of additional workflow material, including an
  uninitialised generic protocol with placeholders, Linear, Claude Chat, and
  Notion assumptions.
- `docs/company`, `docs/strategy`, and `docs/remediation` contain overlapping
  strategy, state, plan, decision, and operating records.
- `handoff/` contains 189 files; `archive/` contains 210 files.
- The repo contains many `DEC-*` references but no repo-native formal decision
  register. `docs/company/DECISION-QUEUE.md` mixes pending questions, decisions,
  corrections, operational evidence, and history.

### Notion is an application dependency

Retiring Notion requires replacing or deliberately removing:

- daily-digest priorities and distribution-surface reads;
- daily-digest Journal/workspace activity reads;
- weekly vendor-roster drift checks;
- end-session Journal and To-do actions;
- vendor-switch Journal/Decision actions;
- agent start/end protocols and connectivity checks;
- Notion credentials and related secret/config documentation after consumers are
  gone.

Removing documentation links without replacing these consumers is not a valid
cutover.

### Website/design state is at immediate preservation risk

The current website redesign is not on backend `origin/main`. The most current
implementation observed during planning is a local frontend branch/clone with no
upstream and 23 dirty paths, including untracked homepage code, assets, design
system material, and a drift guard. Additional design material exists in a
non-Git handoff directory and an untracked Brandkit experiment.

The first implementation milestone must preserve these exact bytes in the
frontend repository on a named remote branch without merging or declaring them
accepted.

### Shared-checkout safety

All edits occur in dedicated worktrees. Never switch the shared checkout, use a
repo-wide stash, create a node_modules junction, or remove a worktree with a
recursive filesystem delete. Use `git worktree remove` when cleanup is safe.

## 4. Authority model: one authority per question

A universal ranking such as "production beats decisions beats code" is invalid:
those sources answer different questions. The target model assigns an authority
by question.

| Question | Authority | Consumers / generated views |
|---|---|---|
| Product identity, ICP, positioning, durable commercial target | `docs/project/PRODUCT.md` | Website/product docs |
| Cross-project current state, blockers, outstanding actions | `docs/project/STATE.md` | Agent startup |
| Priority, sequence, outcome sought | `docs/project/ROADMAP.md` | GitHub execution units |
| Settled product/project decisions | `docs/decisions/records/DEC-*.md` | Generated active index |
| Pending founder decisions | `docs/decisions/PENDING.md` | `STATE.md` summary, CEO brief |
| Recent completed work | Git first-parent history and merged PR evidence | Generated `RECENT.md` |
| Founder/agent authority and customer-data boundary | Charter | Protocol router, production code guards |
| Capability declarative contract | `manifests/*.yaml` | Catalog/package projections |
| Capability operational activation, price, x402 state | Production DB | Catalog and platform-facts consumers |
| Public aggregate platform facts | `platform-facts.ts` and `/v1/platform/facts` | Frontend/public surfaces |
| Backend implementation | Backend repo commit | Project-state snapshot |
| Frontend implementation | Frontend repo commit | Project-state snapshot |
| Website design-system mechanics | Frontend tokens/components plus its canonical design-system document | Main-repo website/brand principles |
| Scoped program/package status | Structured records owned by that program | Project-state summary |
| Historical rationale/evidence | Git, audits, research, archived imports and sessions | On-demand investigation |

`STATE.md` is a verified snapshot and routing surface. It does not overrule the
live system or an owning code repository. It must record what it was verified
against.

## 5. Target information architecture

```text
/
├─ AGENTS.md
├─ CLAUDE.md
├─ README.md
├─ WORKTREES.md
│
├─ docs/
│  ├─ project/
│  │  ├─ START-HERE.md
│  │  ├─ PRODUCT.md
│  │  ├─ STATE.md
│  │  ├─ ROADMAP.md
│  │  ├─ DECISIONS.md          # generated active index
│  │  ├─ RECENT.md             # generated from merged work
│  │  ├─ WORKING-MODEL.md
│  │  └─ PROTOCOL-ROUTER.md
│  │
│  ├─ decisions/
│  │  ├─ README.md
│  │  ├─ PENDING.md
│  │  └─ records/
│  │     └─ DEC-*.md
│  │
│  ├─ product/
│  │  ├─ GTM.md
│  │  └─ WEBSITE-BRAND.md
│  │
│  ├─ governance/
│  │  ├─ CHARTER.md
│  │  ├─ BUDGET.md
│  │  ├─ MEASUREMENT.md
│  │  ├─ LESSONS.md
│  │  └─ protocols/
│  │     ├─ capability-onboarding.md
│  │     ├─ distribution-pr-integrity.md
│  │     ├─ audit-follow-up-test-coverage.md
│  │     ├─ bulk-operation-deploy.md
│  │     ├─ deploy-mechanism-verification.md
│  │     └─ engineering-invariants.md
│  │
│  ├─ programs/
│  │  ├─ remediation/
│  │  └─ discovery/
│  │
│  ├─ architecture/
│  ├─ operations/
│  │  ├─ runbooks/
│  │  └─ operator-actions.yaml
│  ├─ security/
│  ├─ research/
│  └─ audits/
│
└─ archive/
   ├─ imports/
   │  ├─ notion/
   │  ├─ chat/
   │  └─ context-pack/
   ├─ sessions/
   ├─ briefs/
   └─ superseded/
```

Physical moves are deferred until authority has been established and link/code
impact is known. Logical classification comes first. Existing authoritative
paths may remain temporarily when moving them would add risk without reducing
ambiguity.

## 6. Document contracts

### `START-HERE.md`

- Navigation and authority map only; no volatile project facts.
- Defines the mandatory clean-session read order.
- Explains stable truth, current state, decisions, generated views, evidence,
  and archive.
- Maximum target: 800 words.

### `PROTOCOL-ROUTER.md` and full protocol bodies

- `PROTOCOL-ROUTER.md` owns the complete trigger table and routes each trigger
  to one canonical full protocol under `docs/governance/protocols/`.
- It does not paraphrase required steps. Each full protocol body preserves the
  required steps, incident rationale, verification requirements, and reporting
  format that currently live in `CLAUDE.md`.
- The router is mandatory startup context; full bodies load only when their
  trigger fires.
- The router includes capability onboarding, distribution PR integrity,
  audit-follow-up test coverage, bulk-operation deployment, deploy-mechanism
  verification, test-cost principles, wire-shape rules, production authority,
  worktree safety, and any additional protocol referenced by active code,
  tests, or decisions.
- Router maximum target: 1,200 words. Full bodies are excluded from the startup
  budget because they are conditionally loaded.
- A coverage manifest maps stable protocol IDs to trigger text, full-body path,
  governing decision, and code/test references. The context guard fails if a
  referenced protocol has no router entry or full body.

### `PRODUCT.md`

- Product identity, ICP, positioning, strategic role of x402, product
  principles, and durable revenue target.
- No weekly metrics, implementation status, or dated work-package state.
- Every material claim links to its accepted decision record.
- Maximum target: 1,200 words.

### `STATE.md`

- What is true now, active work, blockers, outstanding operator actions, and
  recent material changes.
- Front matter includes `verified_at`, backend commit, frontend commit, and
  production verification timestamp/status.
- Mutable and concise; completed narrative moves to evidence/history.
- Maximum target: 2,000 words.

### `ROADMAP.md`

- Ordered outcomes and rationale, not a duplicate issue list.
- Each active outcome links to execution issues/program records.
- No completed-work diary.
- Maximum target: 1,500 words.

### Combined startup-context budget

The complete mandatory clean-session read set — both root entrypoints,
`START-HERE.md`, `PRODUCT.md`, `STATE.md`, `ROADMAP.md`, `DECISIONS.md`,
`RECENT.md`, and `PROTOCOL-ROUTER.md` — must remain at or below **9,000 words
and 64 KiB**, with both limits enforced. This is a ceiling, not a target.

### Decision records

Each record uses parseable front matter:

```yaml
id: DEC-...
title: ...
status: proposed | active | superseded | rejected | retired
topic: stable-topic-key
scope: global | product | technical | operational | design
owner: petter | codex | claude
decided_at: YYYY-MM-DD
relations:
  - type: supersedes | amends | interprets | affirms | related_to
    target: DEC-...
evidence: []
```

Body:

```text
Decision
Context
Rationale
Consequences
Reversal conditions
```

Rules:

- preserve historical IDs exactly;
- one active decision per topic unless an explicit relationship permits more;
- active decision substance is immutable; supersede instead of rewriting;
- founder decisions and agent recommendations are visibly distinct;
- every relation is a directed edge stored once; inverse views such as
  `superseded_by`, `amended_by`, and `affirmed_by` are generated rather than
  manually duplicated;
- `supersedes` retires the target, while `amends`, `interprets`, and `affirms`
  do not;
- structured relations may target only formal decision IDs. A historical prose
  position without a formal ID stays in Context/Evidence and must not receive an
  invented decision ID merely to satisfy the graph;
- the active index and inverse relationship views are generated, never manually
  duplicated;
- synthesized `D-*` entries from the context pack are migration candidates, not
  formal decisions.

### `PENDING.md`

- Contains only unresolved decisions that genuinely require founder authority.
- Technical questions, implementation tasks, and settled-but-unexecuted operator
  actions are forbidden here.
- Settled-but-unexecuted work belongs in `operator-actions.yaml`.

### `operator-actions.yaml`

Minimum lifecycle:

```yaml
- id: OA-...
  subject: ...
  status: prepared | executed | reconciled | cancelled
  authority: approval_required | preauthorized_notice | system_acting
  prepared_ref: ...
  executed_at: null
  execution_evidence: null
  reconciled_at: null
  reconciliation_evidence: null
  blocks_acceptance_of: []
```

Anything in `blocks_acceptance_of` cannot be represented as accepted while the
action is only prepared or executed-but-unreconciled.

### Handoffs

Create a handoff only when another session must resume unmerged/uncommitted work
or when ephemeral evidence would otherwise be lost. Completed, merged work uses
Git/PR evidence plus any required canonical-state update. Routine one-line
handoffs end at cutover.

## 7. Entrypoint design

`AGENTS.md` and `CLAUDE.md` become peers. Neither contains mutable project facts.

Both contain only:

- the same pointer to `START-HERE.md` and `PROTOCOL-ROUTER.md`;
- the session-intent requirement;
- an immediate shared-checkout/worktree prohibition;
- conflict/authority duty;
- instruction to update canonical state when work changes it;
- tool-specific mechanics that cannot be shared.

The common read order lives once in `START-HERE.md`. CI compares the two
entrypoints' canonical pointers and rejects asymmetry.

The proposed 700-byte entrypoints in the context pack are not adopted as-is:
they omit enough safety and protocol routing to make clean sessions unsafe.

## 8. Guard design

Create one primary checker, provisionally
`scripts/check-project-context.mjs`, with focused modules/tests.

### Blocking checks at cutover

1. Required canonical files exist and parse.
2. Internal links from the canonical layer resolve.
3. `AGENTS.md` and `CLAUDE.md` point to the same bootstrap/router.
4. Neither entrypoint contains mutable project facts. This is enforced by an
   allowlisted heading schema, allowed canonical link targets, a strict byte
   ceiling, and explicit forbidden fact classes (dated state, prices/revenue,
   counts, active work, roadmap items, and decision summaries), not by a vague
   prose heuristic.
5. Active Notion authority references are absent from entrypoints and
   `docs/project/`.
6. Every authority-bearing document declares `doc_type` and `authority_scope`;
   no scope has two active authorities.
7. Decision IDs and topic keys are unique.
8. Decision `supersedes`, `amends`, `interprets`, and `affirms` targets resolve;
   relation-type constraints hold; supersession is acyclic; generated inverse
   views match the stored directed edges.
9. Active decision substance cannot be edited in place. A diff-aware check
   reads the PR merge base and parses the protected Decision, Context,
   Rationale, Consequences, and Reversal conditions sections. It permits a
   status transition plus relationship/evidence metadata changes, or a new
   superseding record, but rejects in-place changes to those protected sections.
10. `DECISIONS.md` and `RECENT.md` match generated output.
11. `STATE.md` contains valid verification metadata and named source refs.
12. Operator-action status transitions are valid.
13. Nothing blocked by an unresolved operator action is marked accepted.
14. Ambiguous global truth filenames (`MASTER-PLAN`, `SOURCE-OF-TRUTH`, generic
    `STATUS`/`CURRENT-STATE`) are rejected outside sanctioned/archive paths.
15. Canonical startup context remains within its agreed word/byte budget.
16. Every mandatory protocol referenced by active decisions, code, tests, or
    entrypoints appears in the protocol coverage manifest, router, and a
    resolvable full-body file.
17. Active runtime source, workflows, skills, and commands contain no
    `NOTION_API_KEY`, `NOTION_TOKEN`, `api.notion.com`, or active Notion MCP
    dependency after cutover; archive/import paths are the only exemptions.
18. Charter outbound links resolve on every commit that moves or dissolves a
    companion governance document.

### Path-sensitive checks

Maintain a small explicit map of changes that definitely require context review,
for example:

- program status records → project `STATE.md`;
- decision records → generated `DECISIONS.md`;
- operator actions → project `STATE.md`;
- product/brand authority → project `PRODUCT.md` or website/brand domain doc;
- active Notion consumers → cannot survive the Notion-cutover phase.

Avoid a universal "touch docs on every code change" rule. It creates ritual
updates and trains contributors to bypass the guard.

### Rollout mode

- Foundation PR: checker runs in report/warning mode.
- Cutover PR: all deterministic checks become blocking.
- Archive PR: duplicate-authority and Notion-reference scopes widen.

## 9. Migration map

| Current area | Target treatment |
|---|---|
| Root `AGENTS.md` / `CLAUDE.md` | Thin peer entrypoints after canonical layer passes acceptance |
| Context pack | Hash and preserve as imported evidence; reconcile claim by claim |
| `.claude/PROTOCOL`, `RUNBOOK`, `WORKFLOW`, `BUILD`, `DISPATCH`, `NOTION` | Extract unique live rules; archive obsolete starter-kit system |
| `.claude/commands` / `.agents/skills` | Keep useful tool affordances; rewrite against repo-native authorities |
| `.codex/hooks.json` | Remove or replace only after a real shared bootstrap exists |
| `docs/company/GOALS.md` | Product/target → `PRODUCT`; current evidence → `STATE`/GTM evidence; experiments → roadmap/issues; archive original |
| `docs/company/DECISION-QUEUE.md` | Pending → `PENDING`; settled → decision records; operator actions → YAML; archive original |
| Charter | Preserve binding content and code binding; move only atomically if useful |
| `DAILY-RUN`, `MEASUREMENT`, `LESSONS`, `BUDGET` | Scoped governance/operations; not startup context |
| Daily briefs | Evidence/archive; never project state or strategy authority |
| Dated strategy papers | Extract accepted decisions/current plan; archive as rationale |
| Remediation package YAML | Preserve as scoped package authority |
| Remediation `CURRENT-STATE.md` | Replace with scoped/generated program overview; archive narrative history |
| Remediation orchestrator/ledger | Program specification/evidence, not startup context |
| Research/audits/DPIAs/security/runbooks | Preserve in relevant domains, load on demand |
| Existing handoffs | Promote remaining current truth, then archive |
| Future handoffs | Only unfinished work or ephemeral evidence |
| Notion | Export immutably, reconcile, remove active writes/reads/secrets, retain historical export only |
| Frontend redesign/design system | Preserve first; frontend owns mechanics, main repo owns cross-project product/brand decisions and status pointer |

## 10. Implementation phases and gates

### M0 — Preserve and baseline

Changes:

1. Preserve the dirty frontend redesign on a named remote branch, byte-for-byte.
2. Copy every non-Git design handoff/import artifact byte-for-byte into a
   tracked `archive/imports/design/2026-08-31/` location, alongside a manifest
   recording original absolute path, size, and SHA-256. Preserve the Brandkit
   experiment either on a named remote branch in its owning repo or in this
   tracked import; a hash without the bytes is not preservation.
3. Export Notion databases/pages needed for Decisions, Journal, To-do, Deferred,
   Glossary, Product Strategy/Current State, Feature Registry, Distribution
   Registry, Vendor Roster, and any other active consumer discovered by code
   search.
4. Store the connector export under
   `strale-io/strale-context-archive:archive/imports/notion/<date>/` with a hash
   manifest. That repository is the founder-approved private storage boundary.
   Redact credential values before commit and record each redaction in the
   manifest; preservation never requires storing usable secrets in Git. The
   public Strale repository may contain reconciled canonical documents, not a
   wholesale raw project-memory export.
5. Inventory active Notion consumers and owning replacement.
6. Record the migration decision after collision-checking its ID.

Exit:

- no unique design bytes exist only in an untracked local directory;
- a checksum replay proves each imported file matches its source byte-for-byte;
- Notion has an immutable, secret-sanitized export in the approved private
  storage boundary;
- every active Notion consumer has a replacement or explicit retirement plan;
- no authority cutover yet.

Rollback: none needed; preservation/export is additive.

Claude milestone review: confirm preservation completeness, decision-boundary
correctness, and absence of accidental acceptance/merge of design work.

### M1 — Canonical foundation, non-authoritative

Changes:

1. Add target directories, document schemas, and `WORKING-MODEL.md`.
2. Add `START-HERE.md` and `PROTOCOL-ROUTER.md`.
3. Add checker in warning/report mode with discriminating tests.
4. Add generated-view tooling for decisions and recent work.
5. Add a machine-readable bare-enumeration manifest for legacy
   authority-bearing areas. M1 records paths/hashes/owners/references only; M2
   owns every disposition/classification label.

Exit:

- schemas and guards pass on the new skeleton;
- existing entrypoints still govern sessions;
- no file falsely claims canonical status.
- generated views are visibly partial and machine-marked `complete: false`;
- the foundation exists as one bounded, independently reviewed change.

Rollback: revert the additive foundation PR.

Claude milestone review: architecture, guard completeness, false-positive risk,
and preservation of mandatory engineering protocols.

### M2 — Reconcile and populate project truth

Precondition: parallel product/decision audit is available.

Changes:

1. Reconcile product audit, context pack, repo evidence, formal decisions, code,
   frontend state, and live production facts by question.
2. Populate `PRODUCT.md`, `STATE.md`, `ROADMAP.md`, and product domain files in
   a bounded product/state change.
3. Migrate active and load-bearing global decisions first, with separate review
   for legal, compliance, customer-data, money, and production-authority topics.
4. Migrate remaining historical decisions in topic/era batches. Raw export stays
   available throughout; historical completeness is not achieved by one
   unreviewable bulk diff.
5. Populate `PENDING.md` with founder-only unresolved decisions.
6. Populate `operator-actions.yaml` with prepared/executed/reconciled state.
7. Generate active decision and recent-work views.
8. Mark each legacy authority as migrated, evidence-only, archive, obsolete, or
   still unclear in the migration manifest.

Exit:

- every canonical claim has an authority/evidence link;
- no synthesized context-pack decision is silently promoted;
- current state records exact backend/frontend refs and production verification;
- all known acceptance-critical operator actions are represented.

Rollback: canonical files remain labelled pre-cutover; existing authorities
stay in force.

Claude milestone review: independent source reconciliation and contradiction
audit for each product/state and decision batch. Any disagreement is recorded in
the plan's review log and resolved from evidence, not by averaging opinions.

### M3 — Prepare repo-native workflows and Notion replacements

Changes:

1. Implement repo-native replacements for daily-digest priorities,
   distribution surfaces, Journal/workspace activity, and vendor-roster drift.
2. Prepare new session start/end, `go`, vendor-switch, and Claude-command flows
   against repo-native sources, but do not activate the new entrypoints yet.
3. Run repo-native read paths in shadow/comparison mode where practical; they
   are not authority and do not dual-write to Notion.
4. Add deployment/scheduled-workflow tests proving the replacement mechanisms
   are actually invoked.
5. Preserve all mandatory protocol full text and populate the protocol coverage
   manifest/router.

Exit:

- repo-native replacements are testable without changing existing authority;
- no new path writes to both repo-native truth and Notion;
- scheduled/deployment mechanisms are verified, not assumed;
- every currently mandatory protocol is represented in the coverage manifest;
- old entrypoints remain in force until M4.

Rollback: revert the additive replacement code. Existing authority remains
unchanged because cutover has not occurred.

Claude milestone review: dependency completeness, semantic parity of replacement
inputs, scheduled/deployment reachability, and protocol-coverage completeness.

### M4 — Atomic authority cutover and Notion retirement

Changes:

1. Rewrite `AGENTS.md` and `CLAUDE.md` as peer entrypoints.
2. Activate repo-native session start/end, `go`, vendor-switch, and Claude
   command flows; remove their Notion reads/writes in the same cutover.
3. Activate the M3 daily-digest and vendor-roster replacements; remove the old
   Notion consumers in the same cutover.
4. Replace routine handoff requirements with truth-promotion and
   unfinished-work rules.
5. Remove Notion connectivity/degraded-mode assumptions.
6. Remove unused Notion credentials, secrets, and configuration references only
   after code search and tests prove no active consumer remains.
7. Make deterministic context, protocol-coverage, and permanent Notion
   anti-regression checks blocking.
8. Freeze the historical Notion workspace as read-only evidence. Never run a
   dual-write transition: before M4 the old system is authoritative; after M4
   the repo is authoritative.

Exit:

- both tools load the same project truth and pass entrypoint parity;
- production and scheduled workflows behave correctly without Notion secrets;
- no active task, decision, Journal, strategy, vendor, or distribution state is
  read from or written to Notion;
- capability, distribution, audit-follow-up, bulk-operation, deployment,
  production-authority, worktree, and review gates remain discoverable and
  enforceable;
- historical export remains searchable but explicitly non-authoritative.

Rollback: revert the entire cutover as one unit only if required before new
repo-native decisions/state have been written. Once repo-native writes occur,
do not restore Notion writes; repair forward to avoid split authority.

Claude milestone review: clean-session protocol discovery, dependency and
deployment-mechanism audit, secret removal, and adversarial proof that thin
entrypoints did not erase safety rules.

### M5 — Archive legacy authorities

Changes:

1. Move superseded strategy/current-state/brief/handoff material according to
   the reviewed migration manifest.
2. Preserve Git history with `git mv` where moving tracked files.
3. Update live links and code-bound paths atomically.
   Charter outbound links are a zero-broken-link invariant at every commit, not
   merely at the end of the phase; a dedicated test enumerates and resolves
   them before each move is committed.
4. Leave redirects/pointer READMEs only where humans are likely to follow an old
   path; pointers may not restate mutable truth.
5. Do not delete ambiguous or unreconciled artifacts.

Exit:

- active search paths contain one authority per scope;
- normal startup does not load archives;
- code/test references to moved authorities pass;
- no useful evidence is lost.

Rollback: revert move-only commits; raw imports and Git history remain intact.

Claude milestone review: migration completeness, broken-link scan, and search for
surviving competing authorities.

### M6 — Clean-session acceptance

Run one clean Codex session and one clean Claude Code session from the same exact
reviewed commit, with no Notion, chat, memory, or old handoff context. Require
source-linked answers to:

1. What is Strale?
2. Who is the primary customer?
3. What is the durable revenue target?
4. What is implemented and deployed on the website?
5. What is the immediate technical priority?
6. What is blocked?
7. What is the next major product program?
8. Which actions are founder-reserved?
9. Where is a new settled decision recorded?
10. What changes when work changes project state?
11. Which operator actions are prepared but not reconciled?
12. Which source owns capability contract, price, and activation?

Also simulate trigger discovery for:

- new capability;
- money/compliance-critical change;
- scheduled/deployment-dependent behavior;
- vendor switch;
- frontend/design-system change;
- ordinary bug fix.

Pass criteria:

- materially matching answers;
- correct authority citations;
- no Notion/chat dependence;
- no false claim that a prepared action or local branch is live;
- all applicable mandatory protocols discovered;
- startup context stays within budget.

Required discriminating regression fixtures:

1. Removing one protocol router/manifest entry fails coverage.
2. The DEC-20260812-A/DEC-20260815-A/DEC-20260822-A amendment chain and the
   DEC-20260428-A/DEC-20260813-A interpretation relationship validate without
   falsely retiring their targets.
3. A clean weekly-drift run has no `NOTION_TOKEN` dependency and still exercises
   the vendor-roster replacement.
4. Reintroducing `NOTION_API_KEY`, `NOTION_TOKEN`, `api.notion.com`, or an active
   Notion MCP call outside archives fails CI.
5. Every preserved design import re-hashes byte-identically to its captured
   manifest before M0 exits.
6. Moving any Charter companion file without repairing the Charter link fails
   in that commit.
7. Editing an active decision's protected body fails, while adding a valid
   same-topic superseding record and transitioning the old status passes.
8. Exceeding either the combined word or byte startup-context ceiling fails.
9. The clean-session comparison cannot pass without Claude's recorded
   independent sign-off.

Claude milestone review: Claude performs its own clean session. Codex evaluates
both result sets against canonical sources, and Claude independently signs off
on the comparison and verdict. Disagreements or a missing independent sign-off
block cutover.

### M7 — Final verification and shipping

1. Run repository tests proportionate to every touched area.
2. Run `go` and its independent-review gate.
3. Rebase/refresh against latest `origin/main` without switching the shared
   checkout.
4. Re-run context guards and clean-session acceptance on the exact final head.
5. Open and merge the PR once repo gates pass, per the charter.
6. Verify `main`, scheduled workflows, and Notion-independent operation after
   merge.
7. Archive this plan with review/acceptance evidence.

## 11. PR/commit sequence

Prefer bounded, reversible changes:

1. **Preservation commit/PR in the frontend repo** — remote checkpoint only; no
   product acceptance.
2. **Foundation PR** — this reviewed plan, schemas, skeleton, warning guards,
   inventory manifest.
3. **Product/state truth PR** — canonical product, state, roadmap, pending
   decisions, and operator-action state; still pre-cutover until review passes.
4. **Decision migration PRs** — active/load-bearing decisions first, with
   separate legally/compliance-sensitive batches; historical topics/eras follow.
5. **Notion replacement preparation PR** — inactive/shadow repo-native runtime,
   scheduled, and workflow replacements plus protocol coverage.
6. **Atomic cutover PR** — peer entrypoints, workflow activation, old Notion
   consumer removal, secret/config retirement, and blocking guards.
7. **Archive PR** — move-only cleanup with link repairs.
8. **Acceptance/finalization PR if needed** — final evidence and any corrections.

Combine adjacent PRs only when doing so reduces transition risk without making
review non-discriminating.

## 12. Claude Code review protocol

Claude is an independent reviewer, not a second doctrine source.

At each named milestone:

1. invoke Claude Code from the milestone worktree;
2. pin `--model opus --effort high`;
3. use read-only/plan permissions for review;
4. give the exact base/head and required evidence paths;
5. require severity-ranked findings with file/section evidence;
6. require an explicit verdict: `PASS`, `PASS_WITH_FOLLOWUPS`, or `FAIL`;
7. Codex verifies each finding against sources and records the disposition;
8. unresolved high/critical findings block the next milestone;
9. store review evidence beside this plan during execution, then archive it.

Provider fallback is allowed only after a real invocation/provider failure and
must be reported as "wanted Opus, fell to Sonnet".

## 13. Review log

### Plan review

**2026-08-31 — provisional independent review:** wanted Opus/high effort, but the
first read-only invocation timed out after ten minutes without a verdict; fell
to Sonnet/high effort per the configured reviewer route. Verdict:
`PASS_WITH_FOLLOWUPS`. Review evidence:
`archive/sessions/2026-08-31-repo-native-operating-model-plan-review-claude.md`.

Accepted corrections applied before final confirmation:

- canonical full protocol bodies plus a coverage manifest/guard;
- decision relations expanded beyond supersession;
- M3/M4 replaced with pre-cutover replacement preparation followed by one
  atomic no-dual-write cutover;
- non-Git design bytes copied and checksum-verified, not merely hashed;
- prose-only historical positions cannot receive invented decision IDs;
- concrete entrypoint and diff-aware decision immutability checks;
- combined startup-context budget;
- Charter link integrity at every move;
- permanent source/workflow Notion anti-regression guard;
- independent Claude sign-off on clean-session acceptance;
- product/state and decision migration split into reviewable batches.

**2026-08-31 — final confirmation:** Claude Code, Sonnet/high effort, re-read
the revised plan and review record. Verdict: `PASS`; every finding materially
resolved, no remaining blockers, and no new contradictions. The plan is now the
agreed implementation sequence.

### Milestone reviews

- **M0 preservation — PASS.** Terminal capture/count parity, sanitized private
  history, and zero final scanner findings. Evidence is summarized in
  `docs/project/private-archive-status.json` and preserved in the private
  archive review record.
- **M1 Foundation — PASS.** Zero high, medium, or low findings; safe to open and
  merge. Evidence:
  `archive/sessions/2026-08-31-m1-clean-extraction-review-claude.md`.

## 14. Completion definition

The migration is complete only when:

- repo-native truth is live and mutually understood by clean Codex and Claude
  Code sessions;
- Notion is neither an authority nor an active runtime/workflow dependency;
- design and frontend truth is durable and has a named owning source;
- decisions are traceable and supersession-safe;
- prepared/executed/reconciled production states cannot collapse into one;
- legacy material is preserved but excluded from normal context;
- deterministic guards prevent the known drift families;
- the final reviewed commit is merged and verified on `main`.
