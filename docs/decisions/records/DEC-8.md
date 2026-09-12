---
record_key: DEC-8
id: DEC-8
title: SELECT FOR UPDATE row-level locking on wallet debits
status: active
topic: wallet-debit-row-locking
scope: technical
owner: petter
decided_at: 2026-02-26
relations: []
evidence:
  - https://github.com/strale-io/strale/commit/da9b1fc0bb2378bf5a6942ac399013ed52655399
  - CLAUDE.md
  - apps/api/src/lib/wallet-service.ts
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

Lock a user's wallet row with `SELECT ... FOR UPDATE` for the duration of a
debit, to prevent concurrent requests from double-spending the same balance.
CLAUDE.md records this as "unanimous."

## Context

This decision has no Notion source row; it predates the workspace's Decision
tracking. Its text is preserved verbatim from `CLAUDE.md`'s Active Decisions
list, first committed 2026-02-26
(`da9b1fc0bb2378bf5a6942ac399013ed52655399`, "Add full API, TypeScript SDK,
and deployment config"). CLAUDE.md's own text is the only source; it does not
record further context beyond the decision itself.

## Rationale

The source is silent beyond the decision statement itself: row-level locking
is the standard mechanism for preventing a race between two concurrent debits
against the same balance.

## Consequences

Status verified 2026-09-11, against this branch. Still in force:
`apps/api/src/lib/wallet-service.ts:119` locks the wallet row with
`.for("update")`; `apps/api/src/routes/do.ts` holds a wallet `FOR UPDATE`
row for the duration of execution and bounds the wait time (documented at
`routes/do.ts` around the Cert-audit Y-5 comment). The circuit-breaker module
(`apps/api/src/lib/circuit-breaker.ts`) uses the same `SELECT FOR UPDATE`
plus conditional-write pattern for a different table, under the `F-0-011`
label, confirming the pattern is the platform's general approach to
this class of race.

## Reversal conditions

Supersede this decision only with a new record naming a different
concurrency-control mechanism for wallet debits (for example optimistic
locking or a queue-serialized debit path). An internal refactor that
preserves the same-transaction exclusive lock does not require supersession.
