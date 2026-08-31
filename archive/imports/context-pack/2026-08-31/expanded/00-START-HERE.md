# Strale — Canonical Project Context

**Prepared:** 2026-08-31  
**Purpose:** bootstrap a repo-native source of truth for Strale that works equally well for Codex and Claude Code.

## Why this exists

Strale currently has valuable context spread across:
- the backend/API repository;
- `docs/company`, `docs/strategy`, `docs/remediation`, `docs/security`, `handoff/`, issue/PR discussions and dated operating records;
- a large `CLAUDE.md` and derivative `AGENTS.md`;
- historical Notion workflows;
- ChatGPT conversations, especially the Strale Revenue, Website and remediation workstreams.

The desired future state is:

1. **The repository is the system of record.**
2. **Notion is retired for Strale.**
3. **Chat history is not authoritative.**
4. **Codex and Claude Code consume the same canonical context.**
5. **Current state, roadmap, positioning and decisions are obvious.**
6. **Historical evidence remains available without contaminating current truth.**

## Mandatory read order for substantive sessions

1. `PRODUCT-STRATEGY.md`
2. `CURRENT-STATE-AND-ROADMAP.md`
3. `DECISIONS.md`
4. the relevant domain section in `GTM-WEBSITE.md` or `TECHNICAL-PROGRAM.md`
5. `WORKING-METHOD-AND-REPO-REDESIGN.md`

The eventual repo should expose this order from both root `AGENTS.md` and root `CLAUDE.md`.

## Authority hierarchy

When sources disagree:

1. live production state for operational facts;
2. explicit founder decision in the canonical decision register;
3. current canonical strategy/roadmap/current-state files;
4. current code and tests;
5. current GitHub issue/PR evidence;
6. historical strategy, handoff, audit and dated-session material;
7. chat history / old Notion material.

Historical documents are evidence, not current truth.

## Four information classes

### Stable truth
What Strale is, who it is for, product principles, architectural invariants, authority boundaries.

### Current state
What is deployed, active work, blockers, next work, outstanding operator actions.

### Decisions
Decision, date, owner, rationale, status, supersession and consequences.

### History/evidence
PRs, audits, handoffs, old plans, daily reports.

The new repo must keep these separate.

## Immediate migration objective

Do not blindly delete existing documentation.

First:
1. inventory;
2. classify each file as canonical / generated view / evidence / archive / obsolete;
3. migrate current truth into the canonical layer;
4. make `AGENTS.md` and `CLAUDE.md` thin peers;
5. add drift guards;
6. only then archive/delete obsolete material.

The redesign is not “add more docs”. It is “reduce the number of authorities”.
