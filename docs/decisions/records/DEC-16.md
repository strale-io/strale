---
record_key: DEC-16
id: DEC-16
title: Add dry_run mode to POST /v1/do
status: active
topic: v1-do-dry-run-mode
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

Accept a `dry_run` field on `POST /v1/do` that resolves matching and pricing
without executing the capability or debiting the wallet.

## Context

This decision has no Notion source row; it predates the workspace's Decision
tracking. Its text is preserved verbatim from `CLAUDE.md`'s Active Decisions
list, first committed 2026-02-26
(`da9b1fc0bb2378bf5a6942ac399013ed52655399`, "Add full API, TypeScript SDK,
and deployment config"). CLAUDE.md's own text is the only source; it does not
record further context beyond the decision itself.

## Rationale

The source is silent beyond the decision statement itself: a caller should
be able to preview which capability would run and at what price before
committing to a paid call.

## Consequences

Status verified 2026-09-11, against this branch. Still in force:
`apps/api/src/routes/do.ts` reads `body.dry_run === true`, short-circuits
before execution, and returns a `dry_run: true` response.

## Reversal conditions

Supersede this decision only with a new record removing the dry-run path
from `POST /v1/do`. A change to exactly what a dry run previews (for example
adding fields to its response) does not require supersession.
