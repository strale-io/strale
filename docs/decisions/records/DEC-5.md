---
record_key: DEC-5
id: DEC-5
title: TypeScript backend on Hono, Drizzle, and PostgreSQL
status: active
topic: backend-tech-stack
scope: technical
owner: petter
decided_at: 2026-02-26
relations: []
evidence:
  - https://github.com/strale-io/strale/commit/da9b1fc0bb2378bf5a6942ac399013ed52655399
  - CLAUDE.md
  - apps/api/package.json
migration_status: candidate
authority_scope: none
authority_active: false
phase: M2
---

> [!CAUTION]
> **M2 CANDIDATE RECORD — NOT ACTIVE PROJECT AUTHORITY.**
> The recorded decision status is historical source data. Existing `AGENTS.md`, `CLAUDE.md`, and Notion-backed workflows remain authoritative until M4 cutover.

## Decision

Build the backend in TypeScript, on the Hono framework, with Drizzle as the
ORM against a PostgreSQL database.

## Context

This decision has no Notion source row; it predates the workspace's Decision
tracking. Its text is preserved verbatim from `CLAUDE.md`'s Active Decisions
list, first committed 2026-02-26
(`da9b1fc0bb2378bf5a6942ac399013ed52655399`, "Add full API, TypeScript SDK,
and deployment config"). CLAUDE.md's own text is the only source; it does not
record further context beyond the decision itself.

## Rationale

The source is silent beyond the decision statement itself.

## Consequences

Status verified 2026-09-11, against this branch. The stack is unchanged:
`apps/api/package.json` depends on `hono` and `drizzle-orm`; CLAUDE.md's Tech
Stack section still states "Runtime: Node.js + TypeScript", "Framework:
Hono", "Database: PostgreSQL", "ORM: Drizzle".

## Reversal conditions

Supersede this decision only with a new record naming a replacement
framework, ORM, or database. A version upgrade within the same stack does
not require supersession.
