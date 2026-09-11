---
record_key: DEC-14
id: DEC-14
title: Do not charge before execution succeeds; lock, execute, then deduct
status: active
topic: charge-on-success
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

Never charge a customer for a capability call before that call succeeds. The
sequence is: lock the funds (or verify sufficient balance), execute the
capability, then deduct from the wallet only on success.

## Context

This decision has no Notion source row; it predates the workspace's Decision
tracking. Its text is preserved verbatim from `CLAUDE.md`'s Active Decisions
list, first committed 2026-02-26
(`da9b1fc0bb2378bf5a6942ac399013ed52655399`, "Add full API, TypeScript SDK,
and deployment config"). CLAUDE.md's own text is the only source; it does not
record further context beyond the decision itself.

## Rationale

The source is silent beyond the decision statement itself: charging on
failure would bill a customer for work the platform did not deliver.

## Consequences

Status verified 2026-09-11, against this branch. Still in force:
`apps/api/src/routes/do.ts` holds the wallet row under `FOR UPDATE` for the
duration of execution and only debits on a successful result;
`spendCapWouldExceed` (also in `do.ts`, and the subject of the PR #43
cert-audit fix cited in CLAUDE.md's Audit-Follow-up Test Coverage Protocol)
is checked before execution, not after. `transaction_finalization_failed`
(`apps/api/src/lib/errors.ts`) exists precisely to distinguish "execution
succeeded but the record-keeping step failed, wallet already refunded" from
a charge for undelivered work.

## Reversal conditions

Supersede this decision only with a new record permitting a pre-execution
charge in some case. A bug fix that restores this ordering after a
regression does not require supersession; it is enforcement of this
decision, not a change to it.
