---
record_key: DEC-19
id: DEC-19
title: Structured error responses with a stable error_code enum
status: active
topic: structured-error-codes
scope: technical
owner: petter
decided_at: 2026-02-26
relations: []
evidence:
  - https://github.com/strale-io/strale/commit/da9b1fc0bb2378bf5a6942ac399013ed52655399
  - CLAUDE.md
  - apps/api/src/lib/errors.ts
migration_status: candidate
authority_scope: none
authority_active: false
phase: M2
---

> [!CAUTION]
> **M2 CANDIDATE RECORD — NOT ACTIVE PROJECT AUTHORITY.**
> The recorded decision status is historical source data. Existing `AGENTS.md`, `CLAUDE.md`, and Notion-backed workflows remain authoritative until M4 cutover.

## Decision

Every API error response carries a stable `error_code` drawn from a fixed
enum, rather than a free-text message alone.

## Context

This decision has no Notion source row; it predates the workspace's Decision
tracking. Its text is preserved verbatim from `CLAUDE.md`'s Active Decisions
list, first committed 2026-02-26
(`da9b1fc0bb2378bf5a6942ac399013ed52655399`, "Add full API, TypeScript SDK,
and deployment config"). CLAUDE.md's own text is the only source; it does not
record further context beyond the decision itself.

## Rationale

The source is silent beyond the decision statement itself: a stable code
lets a calling agent branch on error type programmatically instead of
parsing prose.

## Consequences

Status verified 2026-09-11, against this branch. Still in force:
`apps/api/src/lib/errors.ts` defines the `ErrorCode` type with the comment
"Stable error codes per DEC-19" directly above it, and the enum has grown
over time (for example `idempotency_key_reused`, added under "WP6";
`transaction_finalization_failed`, added under "F-B-022") while preserving
the original members. Per project convention, a success response is shaped
`{"result":{"output":{...}}}` and a failure response
`{"error_code","message","details":{"error":...}}`, with no top-level
`error` key.

## Reversal conditions

Supersede this decision only with a new record replacing the stable-enum
approach (for example moving to HTTP status codes alone, or free-text
errors). Adding a new enum member for a new failure class is growth within
this decision, not a reason to supersede it.
