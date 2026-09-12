---
record_key: DEC-22
id: DEC-22
title: Hybrid sync/async execution, sync below a threshold and async-plus-poll above it
status: active
topic: hybrid-sync-async-execution
scope: technical
owner: petter
decided_at: 2026-02-26
relations: []
evidence:
  - https://github.com/strale-io/strale/commit/da9b1fc0bb2378bf5a6942ac399013ed52655399
  - CLAUDE.md
  - apps/api/src/lib/execution-routing.ts
migration_status: candidate
authority_scope: none
authority_active: false
phase: M2
---

> [!CAUTION]
> **M2 CANDIDATE RECORD — NOT ACTIVE PROJECT AUTHORITY.**
> The recorded decision status is historical source data. Existing `AGENTS.md`, `CLAUDE.md`, and Notion-backed workflows remain authoritative until M4 cutover.

## Decision

Execute short capability calls synchronously and route longer calls to an
async, poll-based path. CLAUDE.md's original text set the sync/async split
at 5 seconds.

## Context

This decision has no Notion source row; it predates the workspace's Decision
tracking. Its text is preserved verbatim from `CLAUDE.md`'s Active Decisions
list, first committed 2026-02-26
(`da9b1fc0bb2378bf5a6942ac399013ed52655399`, "Add full API, TypeScript SDK,
and deployment config"). CLAUDE.md's own text is the only source; it does not
record further context beyond the decision itself.

## Rationale

The source is silent beyond the decision statement itself: a caller
expecting an immediate response should get one for fast capabilities,
while a slow capability should not hold an HTTP connection open
indefinitely.

## Consequences

Status verified 2026-09-11, against this branch. The hybrid mechanism itself
is still in force, but the numeric threshold has moved:
`apps/api/src/lib/execution-routing.ts` defines
`ASYNC_THRESHOLD_MS = 10_000` (10 seconds, the point above which a call
routes to async) and `SYNC_TRANSACTION_WALL_MS = 15_000` (15 seconds, the
outer wall-clock ceiling on the sync path), not the original 5-second split.
This record treats the routing pattern (sync below a threshold, async plus
poll above it) as the in-force decision, and reads the specific millisecond
constants as an operational parameter that has already changed once without
a recorded supersession.

## Reversal conditions

Supersede this decision only with a new record removing the sync/async
split (for example making every call async, or every call sync with a
longer timeout). A further change to `ASYNC_THRESHOLD_MS` or
`SYNC_TRANSACTION_WALL_MS`'s numeric value is a parameter change, not a
reason to edit this record in place.
