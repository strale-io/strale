---
record_key: DEC-17
id: DEC-17
title: Return wallet_balance_cents in the /v1/do response
status: active
topic: v1-do-wallet-balance-response
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

Include the caller's post-call wallet balance, as `wallet_balance_cents`, in
`POST /v1/do` responses.

## Context

This decision has no Notion source row; it predates the workspace's Decision
tracking. Its text is preserved verbatim from `CLAUDE.md`'s Active Decisions
list, first committed 2026-02-26
(`da9b1fc0bb2378bf5a6942ac399013ed52655399`, "Add full API, TypeScript SDK,
and deployment config"). CLAUDE.md's own text is the only source; it does not
record further context beyond the decision itself.

## Rationale

The source is silent beyond the decision statement itself: returning the
balance inline saves an agent a separate call to check whether it can afford
its next request.

## Consequences

Status verified 2026-09-11, against this branch. Still in force:
`apps/api/src/routes/do.ts` returns `wallet_balance_cents` on the success,
dry-run, and error response paths (multiple call sites in the file). The
field name is integer cents, consistent with the platform-wide wire-shape
rule against pre-formatted money strings.

## Reversal conditions

Supersede this decision only with a new record removing the balance field
from `/v1/do` responses. Renaming or relocating the field within the
response body is an implementation detail, not a reason for a new decision,
provided the wire-shape rule (integer cents, never a formatted string) is
preserved.
