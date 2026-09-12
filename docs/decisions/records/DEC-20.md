---
record_key: DEC-20
id: DEC-20
title: Hash API keys in the database; store key_prefix for lookup
status: active
topic: hashed-api-keys
scope: technical
owner: petter
decided_at: 2026-02-26
relations: []
evidence:
  - https://github.com/strale-io/strale/commit/da9b1fc0bb2378bf5a6942ac399013ed52655399
  - CLAUDE.md
  - apps/api/src/db/schema.ts
migration_status: candidate
authority_scope: none
authority_active: false
phase: M2
---

> [!CAUTION]
> **M2 CANDIDATE RECORD — NOT ACTIVE PROJECT AUTHORITY.**
> The recorded decision status is historical source data. Existing `AGENTS.md`, `CLAUDE.md`, and Notion-backed workflows remain authoritative until M4 cutover.

## Decision

Never store an API key in plain text. Store its hash, plus a short
`key_prefix` column used to narrow the lookup before hash comparison.

## Context

This decision has no Notion source row; it predates the workspace's Decision
tracking. Its text is preserved verbatim from `CLAUDE.md`'s Active Decisions
list, first committed 2026-02-26
(`da9b1fc0bb2378bf5a6942ac399013ed52655399`, "Add full API, TypeScript SDK,
and deployment config"). CLAUDE.md's own text is the only source; it does not
record further context beyond the decision itself.

## Rationale

The source is silent beyond the decision statement itself: hashing keys at
rest limits the damage of a database leak, and a prefix column keeps lookup
efficient without needing the plaintext key.

## Consequences

Status verified 2026-09-11, against this branch. Still in force:
`apps/api/src/db/schema.ts:37` defines `keyPrefix: varchar("key_prefix", {
length: 16 })` alongside the hashed key column on the API key table.

## Reversal conditions

Supersede this decision only with a new record permitting plaintext key
storage or a different lookup mechanism. A change to the hash algorithm or
prefix length is an implementation detail, not a reason for a new decision.
