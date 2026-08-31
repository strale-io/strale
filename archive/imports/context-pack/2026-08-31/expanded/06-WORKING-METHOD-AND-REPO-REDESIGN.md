# Strale — Working Method and Repo Redesign Brief

This document defines the desired operating model for a Codex + Claude Code workflow with no Notion.

# 1. Objective

Any clean Codex or Claude Code session should be able to answer quickly:

- What is Strale?
- Who is it for?
- What are we trying to achieve?
- What is live?
- What are we working on now?
- What is next?
- What decisions are settled?
- What is blocked?
- What evidence supports the state?
- What must be updated if this work changes project truth?

No answer should require reading ChatGPT history or Notion.

# 2. Current structural problem

The repo already contains a sophisticated but overlapping governance system:
- root `CLAUDE.md` (~very large);
- root `AGENTS.md` as a condensed derivative;
- `.claude/`, `.agents/`, `.codex/`;
- `docs/company/` containing CHARTER, GOALS, DECISION-QUEUE, LESSONS, DAILY-RUN, MEASUREMENT, DESIGN-SYSTEM and more;
- `docs/strategy/` with dated direction/program documents;
- `docs/remediation/`, `docs/security/`, `docs/operations/`, `handoff/`;
- dated CEO briefs and operating records;
- GitHub issues/PRs;
- active Notion references in agent instructions.

The existing `AGENTS.md` explicitly says that `CLAUDE.md` is canon and that AGENTS is a derivative. That is inherently asymmetric and has already gone stale historically.

The desired model is not “write a better CLAUDE.md”.

It is:
> **both tools read the same shared canonical project layer.**

# 3. Proposed canonical structure

```text
/
├─ AGENTS.md
├─ CLAUDE.md
├─ README.md
│
├─ docs/
│  ├─ project/
│  │  ├─ START-HERE.md
│  │  ├─ PRODUCT-STRATEGY.md
│  │  ├─ CURRENT-STATE.md
│  │  ├─ ROADMAP.md
│  │  ├─ DECISIONS.md
│  │  ├─ GTM-REVENUE.md
│  │  ├─ WEBSITE-BRAND.md
│  │  └─ TECHNICAL-PROGRAM.md
│  │
│  ├─ architecture/
│  │  ├─ decisions/
│  │  ├─ invariants/
│  │  └─ diagrams/
│  │
│  ├─ operations/
│  │  ├─ runbooks/
│  │  ├─ production/
│  │  └─ security/
│  │
│  ├─ research/
│  ├─ remediation/
│  └─ archive/
│     ├─ sessions/
│     ├─ briefs/
│     ├─ superseded-plans/
│     └─ imported-chat/
│
├─ handoff/
└─ apps/, packages/, manifests/, scripts/ ...
```

Exact names can change. The invariant is:
> **one small canonical layer; everything else is supporting evidence.**

# 4. AGENTS.md and CLAUDE.md

New model:

## Both should contain
- mandatory canonical read list;
- session-intent rule;
- worktree safety;
- pointers to production/security trigger protocols;
- instruction to update canonical state when work changes it.

## Neither should independently restate
- current revenue;
- current capability counts;
- current roadmap;
- current website state;
- current decisions;
- current implementation status.

Tool-specific mechanics may differ.
Project truth must not.

# 5. Notion retirement

Remove Notion as:
- task list;
- decisions database;
- journal;
- project source of truth;
- mandatory end-session action.

Do not replace it with another external project-management authority.

Repo-native replacements:

## Decisions
Canonical decision register + detailed DEC/ADR records.

## Current work
GitHub issues/PRs for execution, summarized in CURRENT-STATE.

## Roadmap
Canonical ROADMAP.

## History/journal
Git history + archived session records when useful.

## Metrics
Generated repo artifacts may exist, but are evidence, not strategy authority.

# 6. Session protocol

## Start
Every substantive session:
1. read START-HERE;
2. read CURRENT-STATE;
3. read ROADMAP;
4. read DECISIONS;
5. read relevant domain file;
6. inspect current live/code evidence;
7. state one-sentence intent.

No session should begin from an old handoff alone.

## During
If evidence contradicts canonical context:
- identify contradiction explicitly;
- determine authority;
- update canonical state in the same work when appropriate.

## End
If the work changes:
- product direction;
- implementation state;
- production state;
- roadmap;
- active blocker;
- website state;
- settled decision;

update the canonical file in the same PR/session.

A handoff is not a substitute.

# 7. Decision protocol

Canonical decision entry:

```md
## DEC-...
Status:
Date:
Owner:
Decision:
Why:
Consequences:
Supersedes:
Superseded by:
Evidence:
```

Rules:
- preserve history;
- supersede explicitly;
- distinguish founder decision from agent recommendation;
- unresolved decision queue is separate from settled decisions;
- one topic cannot have two active decisions without an explicit relationship.

# 8. Current-state protocol

CURRENT-STATE is intentionally mutable.

It contains:
- what is true now;
- active work;
- next work;
- blockers;
- outstanding operator actions.

It must not become a diary.

Once something is done:
- remove/compact it from current state;
- preserve evidence in PR/issue/archive.

# 9. Handoffs

Handoffs can contain:
- evidence;
- exact commands;
- temporary findings;
- detailed review history.

They cannot be the only place holding:
- current decision;
- roadmap;
- implementation state;
- required operator action.

Before session close, current truth must be promoted to canonical state.

# 10. GitHub role

GitHub is execution/evidence, not the only product plan.

- issue = bounded work item/defect/investigation
- PR = implementation + evidence
- ROADMAP = priority/order/why
- CURRENT-STATE = what is true now
- DECISIONS = what is settled

Closed issue ≠ live acceptance automatically.

# 11. Anti-staleness enforcement

Do not rely on “remember to update docs”.

## Guard A — canonical freshness
CURRENT-STATE should include:
- `last_verified`;
- optionally `verified_against_main`.

Path-sensitive CI can require state updates for defined domains.

Use carefully; avoid noisy universal doc-touch requirements.

## Guard B — no active Notion authority
CI should reject new Notion authority references in:
- AGENTS.md
- CLAUDE.md
- docs/project/

Historical archive may keep old links.

## Guard C — symmetric entrypoints
CI verifies both AGENTS and CLAUDE point to the same canonical files.

Neither may contain prohibited mutable project-state sections.

## Guard D — one current-state rule
Fail on new files named variants of:
- CURRENT_STATE
- STATUS
- MASTER_PLAN
- SOURCE_OF_TRUTH

outside sanctioned canonical/archive paths.

## Guard E — operator-action lifecycle
Production-affecting prepared work must have explicit state:
- prepared
- executed
- reconciled

Canonical acceptance cannot say DONE/ACCEPTED while a required prepared operator action is unresolved.

This directly addresses #436/#438.

## Guard F — decision collision
A new active decision on the same topic must supersede/reference the old decision.

# 12. Daily operating records

Keep daily/CEO operating records only if they provide value.

But:
- daily report ≠ strategy;
- daily finding ≠ decision;
- daily metric ≠ stable product fact.

Canonical docs should summarize durable conclusions.

A clean agent should not read 30 briefs to learn the current thesis.

# 13. Worktree and concurrency rules

Preserve:
- every editing agent gets its own worktree;
- never branch-switch the shared primary checkout;
- do not use repo-wide stash casually;
- use `git worktree remove`, not destructive directory deletion;
- do not “fix” phantom file disappearance before checking worktree collision/tree integrity;
- exact final reviewed head requires CI.

The repo redesign must not weaken these.

# 14. Migration plan

## Phase 1 — inventory
Produce a machine-readable inventory of:
- root docs;
- `.agents`;
- `.claude`;
- `.codex`;
- `docs/**`;
- `handoff/**`;
- all Notion references;
- duplicated state/decision content.

Classify:
- canonical candidate;
- generated view;
- evidence;
- archive;
- obsolete;
- unclear.

## Phase 2 — establish canonical layer
Create final `docs/project/` structure.

Reconcile:
- this context pack;
- current formal DEC records;
- live implementation/production state.

## Phase 3 — thin entrypoints
Rewrite AGENTS/CLAUDE as peer entrypoints.

Preserve only tool-specific mechanics/safety pointers.

## Phase 4 — retire Notion
Remove active Notion workflows/pointers.

Historical archive may retain links.

## Phase 5 — archive
Move superseded/daily/session material out of normal context path.

Do not destroy useful evidence.

## Phase 6 — guards
Implement anti-staleness checks.

## Phase 7 — acceptance test
Start:
- one clean Codex session;
- one clean Claude Code session.

Ask each:

1. What is Strale?
2. Who is the primary customer?
3. What is the revenue target?
4. What is implemented on the homepage?
5. What is the immediate technical priority?
6. What remediation work is blocked?
7. What is the next major product program?
8. Which decisions are founder-reserved?
9. Where is a new product decision recorded?
10. What must be updated when work changes project state?

Their answers should materially agree without Notion or chat.

# 15. Codex implementation brief

Before restructuring, Codex should produce:

## A. Information architecture audit
For every existing documentation/governance area:
- purpose;
- authority;
- duplication;
- freshness risk;
- recommendation:
  - keep canonical;
  - merge;
  - generated view;
  - archive;
  - delete after migration.

## B. Proposed final tree

## C. Authority matrix
Exactly one authority for:
- product position;
- revenue target;
- roadmap;
- current work;
- decisions;
- capability metadata;
- production state;
- website state;
- security policy;
- operational runbooks.

## D. Migration map
Old path → new path/archive/generated/delete.

## E. Guard design
Prevent:
- Notion becoming authority again;
- AGENTS/CLAUDE divergence;
- duplicate status files;
- unrecorded decisions;
- “accepted” work with pending operator mutation;
- stale current-state docs.

Constraints:
- no broad deletion before inventory;
- reversible migration commits;
- preserve formal security/production protocols;
- do not force normal sessions to read archives;
- do not encode fast-changing facts in multiple files.
