---
record_key: DEC-2
id: DEC-2
title: Prepaid wallet via Stripe Checkout, internal ledger for micropayments
status: active
topic: prepaid-wallet-architecture
scope: technical
owner: petter
decided_at: 2026-02-26
relations: []
evidence:
  - https://github.com/strale-io/strale/commit/da9b1fc0bb2378bf5a6942ac399013ed52655399
  - CLAUDE.md
  - apps/api/src/lib/wallet-service.ts
  - apps/api/src/lib/stripe.ts
migration_status: candidate
authority_scope: none
authority_active: false
phase: M2
---

> [!CAUTION]
> **M2 CANDIDATE RECORD — NOT ACTIVE PROJECT AUTHORITY.**
> The recorded decision status is historical source data. Existing `AGENTS.md`, `CLAUDE.md`, and Notion-backed workflows remain authoritative until M4 cutover.

## Decision

Use a prepaid wallet funded through Stripe Checkout. Balances are tracked in
an internal ledger, not through Stripe's own per-transaction primitives, so
individual capability calls carry zero per-transaction payment-processor
cost.

## Context

This decision has no Notion source row; it predates the workspace's Decision
tracking. Its text is preserved verbatim from `CLAUDE.md`'s Active Decisions
list, first committed 2026-02-26
(`da9b1fc0bb2378bf5a6942ac399013ed52655399`, "Add full API, TypeScript SDK,
and deployment config"). CLAUDE.md's own text is the only source; it does not
record further context beyond the decision itself.

## Rationale

The source is silent beyond the decision statement itself: an internal
ledger avoids a payment-processor fee on every capability call, which would
be uneconomical at the platform's per-call price points.

## Consequences

Status verified 2026-09-11, against this branch. The wallet architecture is
still in force: `apps/api/src/lib/wallet-service.ts` maintains balances as an
internal ledger; `apps/api/src/lib/stripe.ts` is used only for the top-up
Checkout flow (`STRIPE_SECRET_KEY`), not for per-call charges. CLAUDE.md's
Tech Stack section still states "Payments: Stripe Checkout (wallet top-ups
only, no Connect)."

## Reversal conditions

Supersede this decision only with a new record naming a different payment
architecture (for example a per-call processor charge, or Stripe Connect).
An implementation change that keeps top-ups on Stripe Checkout and per-call
debits on the internal ledger does not require supersession.
