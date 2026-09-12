---
record_key: DEC-7
id: DEC-7
title: Use Browserless.io instead of self-hosted Puppeteer
status: active
topic: browserless-headless-browser
scope: technical
owner: petter
decided_at: 2026-02-26
relations: []
evidence:
  - https://github.com/strale-io/strale/commit/da9b1fc0bb2378bf5a6942ac399013ed52655399
  - CLAUDE.md
  - apps/api/src/lib/browserless-launch.ts
migration_status: candidate
authority_scope: none
authority_active: false
phase: M2
---

> [!CAUTION]
> **M2 CANDIDATE RECORD — NOT ACTIVE PROJECT AUTHORITY.**
> The recorded decision status is historical source data. Existing `AGENTS.md`, `CLAUDE.md`, and Notion-backed workflows remain authoritative until M4 cutover.

## Decision

Use the managed Browserless.io service for headless-browser capability
execution instead of self-hosting Puppeteer. CLAUDE.md records this as
"unanimous reviewer feedback."

## Context

This decision has no Notion source row; it predates the workspace's Decision
tracking. Its text is preserved verbatim from `CLAUDE.md`'s Active Decisions
list, first committed 2026-02-26
(`da9b1fc0bb2378bf5a6942ac399013ed52655399`, "Add full API, TypeScript SDK,
and deployment config"). CLAUDE.md's own text is the only source; it does not
record the reviewers' names or the specific reasoning beyond "unanimous
reviewer feedback."

## Rationale

The source is silent beyond stating the decision and that reviewer feedback
was unanimous. A managed service avoids operating and scaling a self-hosted
headless-browser fleet.

## Consequences

Status verified 2026-09-11, against this branch. Still in force:
`apps/api/src/lib/browserless-launch.ts` calls the managed Browserless.io
API; CLAUDE.md's Tech Stack section still states "Headless browser:
Browserless.io (managed, NOT self-hosted Puppeteer)." DEC-20260813-A's
per-call parsing doctrine and DEC-20260428-A's scraping doctrine both govern
how this managed browser is used, without changing the vendor choice itself.

## Reversal conditions

Supersede this decision only with a new record naming a different
headless-browser vendor or a return to self-hosting. A configuration or
account change with the same vendor does not require supersession.
