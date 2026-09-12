---
record_key: DEC-15
id: DEC-15
title: Add capability_slug override to POST /v1/do
status: active
topic: v1-do-capability-slug-override
scope: technical
owner: petter
decided_at: 2026-02-26
relations: []
evidence:
  - https://github.com/strale-io/strale/commit/da9b1fc0bb2378bf5a6942ac399013ed52655399
  - CLAUDE.md
  - apps/api/src/routes/do.ts
migration_status: candidate
authority_scope: none
authority_active: false
phase: M2
---

> [!CAUTION]
> **M2 CANDIDATE RECORD — NOT ACTIVE PROJECT AUTHORITY.**
> The recorded decision status is historical source data. Existing `AGENTS.md`, `CLAUDE.md`, and Notion-backed workflows remain authoritative until M4 cutover.

## Decision

Accept a `capability_slug` field on `POST /v1/do` that lets a caller name the
capability directly, bypassing keyword-to-capability matching on `task`.

## Context

This decision has no Notion source row; it predates the workspace's Decision
tracking. Its text is preserved verbatim from `CLAUDE.md`'s Active Decisions
list, first committed 2026-02-26
(`da9b1fc0bb2378bf5a6942ac399013ed52655399`, "Add full API, TypeScript SDK,
and deployment config"). CLAUDE.md's own text is the only source; it does not
record further context beyond the decision itself.

## Rationale

The source is silent beyond the decision statement itself: a caller who
already knows which capability it wants should not have to route through
natural-language matching.

## Consequences

Status verified 2026-09-11, against this branch. Still in force:
`apps/api/src/routes/do.ts` reads `body.capability_slug` and accepts it as an
alternative to `task` (`"Either 'task' or 'capability_slug' is required."`).

## Reversal conditions

Supersede this decision only with a new record removing the direct-slug
path from `POST /v1/do`. A change to how matching falls back when both
`task` and `capability_slug` are absent does not require supersession as
long as the direct override itself remains available.
