---
record_key: DEC-10
id: DEC-10
title: 2.00 EUR trial credits on signup, no card required
status: active
topic: trial-credits
scope: product
owner: petter
decided_at: 2026-02-26
relations: []
evidence:
  - https://github.com/strale-io/strale/commit/da9b1fc0bb2378bf5a6942ac399013ed52655399
  - CLAUDE.md
  - apps/api/src/lib/account-service.ts
  - apps/api/src/lib/trial-eligibility.ts
  - apps/api/src/lib/conversion-emails.ts
migration_status: candidate
authority_scope: none
authority_active: false
phase: M2
---

> [!CAUTION]
> **M2 CANDIDATE RECORD — NOT ACTIVE PROJECT AUTHORITY.**
> The recorded decision status is historical source data. Existing `AGENTS.md`, `CLAUDE.md`, and Notion-backed workflows remain authoritative until M4 cutover.

## Decision

Grant EUR 2.00 of trial wallet credit on signup, with no payment card
required. CLAUDE.md records this as "unanimous."

## Context

This decision has no Notion source row; it predates the workspace's Decision
tracking. Its text is preserved verbatim from `CLAUDE.md`'s Active Decisions
list, first committed 2026-02-26
(`da9b1fc0bb2378bf5a6942ac399013ed52655399`, "Add full API, TypeScript SDK,
and deployment config"). CLAUDE.md's own text is the only source; it does not
record further context beyond the decision itself.

## Rationale

The source is silent beyond the decision statement itself: a no-card trial
credit lowers the friction for a developer's first `/v1/do` call.

## Consequences

Status verified 2026-09-11, against this branch. Still in force:
`apps/api/src/lib/account-service.ts` grants a `trial_credit` ledger entry on
account creation, with one-per-address enforcement described in
`apps/api/src/lib/account-closure.ts` (a SHA-256 of the address, date, and
amount); `apps/api/src/lib/conversion-emails.ts` sends a low-balance email at
"below EUR 0.50 (25% of trial credits)", consistent with a EUR 2.00 grant.
`apps/api/src/lib/trial-eligibility.ts` exports `TRIAL_CREDITS_CENTS` as the
governing constant.

## Reversal conditions

Supersede this decision only with a new record changing the trial credit
amount, requiring a card, or removing the no-signup-friction grant. A change
to `TRIAL_CREDITS_CENTS`'s numeric value alone is a parameter change tracked
where the code and platform facts define it, not a reason to edit this
record in place.
