---
record_key: DEC-21
id: DEC-21
title: Rate limiting of 10 requests per second per key, plus a 100 EUR per hour spend cap
status: active
topic: rate-limiting-and-spend-cap
scope: technical
owner: petter
decided_at: 2026-02-26
relations: []
evidence:
  - https://github.com/strale-io/strale/commit/da9b1fc0bb2378bf5a6942ac399013ed52655399
  - CLAUDE.md
  - apps/api/src/lib/db-rate-limit.ts
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

Rate-limit each API key to 10 requests per second, and additionally cap
spend per key at EUR 100 per rolling hour.

## Context

This decision has no Notion source row; it predates the workspace's Decision
tracking. Its text is preserved verbatim from `CLAUDE.md`'s Active Decisions
list, first committed 2026-02-26
(`da9b1fc0bb2378bf5a6942ac399013ed52655399`, "Add full API, TypeScript SDK,
and deployment config"). CLAUDE.md's own text is the only source; it does not
record further context beyond the decision itself.

## Rationale

The source is silent beyond the decision statement itself: a per-second rate
limit bounds burst load, and a per-hour spend cap bounds the financial blast
radius of a compromised or misbehaving key independent of request rate.

## Consequences

Status verified 2026-09-11, against this branch. Still in force in
mechanism: `apps/api/src/lib/db-rate-limit.ts` implements per-key and
per-IP rate limiting (`rateLimitByIpDb`, with an in-memory
`rateLimitByIp`/`rateLimitByKey` layer noted in the same module);
`apps/api/src/lib/errors.ts` defines a dedicated `spend_cap_exceeded` and
`rate_limited` error code, and `spendCapWouldExceed` (`apps/api/src/routes/
do.ts`) is the enforcement point audited under cert-audit A-7 (PR #43,
CLAUDE.md's Audit-Follow-up Test Coverage Protocol). This record does not
independently re-verify the exact numeric thresholds (10 req/sec, EUR
100/hour) against the live configuration; those are operational parameters
that can change without superseding the underlying rule.

## Reversal conditions

Supersede this decision only with a new record removing per-key rate
limiting or the spend cap mechanism entirely. A change to the specific
numeric thresholds is a parameter change, not a reason to edit this record
in place.
