---
record_key: DEC-9
id: DEC-9
title: Idempotency-Key header on POST /v1/do
status: active
topic: v1-do-idempotency-key
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

Support an `Idempotency-Key` request header on `POST /v1/do`, so a retried
request for the same key does not execute or charge twice. CLAUDE.md records
this as "unanimous."

## Context

This decision has no Notion source row; it predates the workspace's Decision
tracking. Its text is preserved verbatim from `CLAUDE.md`'s Active Decisions
list, first committed 2026-02-26
(`da9b1fc0bb2378bf5a6942ac399013ed52655399`, "Add full API, TypeScript SDK,
and deployment config"). CLAUDE.md's own text is the only source; it does not
record further context beyond the decision itself.

## Rationale

The source is silent beyond the decision statement itself: idempotency keys
are the standard mechanism for making a network-retried payment-bearing
request safe to repeat.

## Consequences

Status verified 2026-09-11, against this branch. Still in force:
`apps/api/src/routes/do.ts` reads and enforces the `Idempotency-Key` header,
including a dedicated `idempotency_key_reused` error code
(`apps/api/src/lib/errors.ts`) for when the same key is presented with
different work (documented inline as "WP6").

## Reversal conditions

Supersede this decision only with a new record removing or replacing the
idempotency mechanism on `POST /v1/do`. An internal implementation change
that preserves the same client-facing contract does not require
supersession.
