---
doc_type: pending-founder-decisions
authority_scope: none
status: candidate
complete: false
phase: M2
m1_template: false
authority_active: false
verified_at: 2026-09-01
---

# Pending Founder Decisions

> [!CAUTION]
> **M2 CANDIDATE — NOT ACTIVE PROJECT AUTHORITY.**
> Review this candidate in place. Existing `AGENTS.md`, `CLAUDE.md`, and Notion-backed workflows remain in force until M4 cutover.

## Decision-ready now

**Nothing needs the founder's decision today.** The two founder-reserved topics
below do not yet have a complete decision brief. They stay visible so a future
session cannot mistake “not ready to ask” for “resolved.”

Settled work awaiting execution is forbidden here. In particular, the #438
routing-latency changes belong in
[`operator-actions.yaml`](../operations/operator-actions.yaml), not in the founder
decision queue.

## Founder-reserved topics awaiting evidence

### FD-20260901-PUBLIC-DOMAIN — public domain migration

**State:** awaiting an accepted website/design checkpoint and a cutover plan
with tested rollback for the reversible technical parts.

**Reserved boundary:** choosing and initiating an irreversible public brand or
infrastructure migration is a founder decision under the
[Operating Charter](../company/CHARTER.md).

**Reserved class:** one-way-public-act.

**Established:** `strale.dev` and `strale.io` are recorded as owned. The public
website migration has not been approved here. Homepage v2 and Quiet Material
v0.7 are not accepted/live authorities, so a domain decision made against them
would be premature.

**Recommendation until ready:** keep the existing public domains unchanged.
Prepare the website acceptance result, redirect/SEO/link inventory, rollback
limits, and exact proposed cutover before presenting a founder choice.

**Founder action now:** none.

### FD-20260901-WP14-LEGAL — supplier, customer, and public commitments

**State:** evidence gathering is incomplete; no consolidated decision brief
exists yet.

**Reserved boundary:** the founder will ultimately decide whether Strale accepts
the supplier and data-processing terms needed for embedded screening, which
customer Terms and data-processing terms Strale offers and records as accepted,
and which public legal/product claims the company publishes. Those choices bind
or represent the company.

**Reserved class:** legal-or-company-binding.

**Established:** privacy/sanitisation sub-work has shipped, but the overall
legal/data-policy package has not. Evidence is still missing or unconsolidated
for the screening supplier relationship and data-processing agreement, real
customer acceptance of Terms/data-processing terms, deferred public-copy
corrections, and proof that examples are approved for publication. The internal
details remain in the
[package graph](../remediation/PACKAGE-GRAPH.yaml) and
[WP14 specification](../remediation/ORCHESTRATOR.md#wp14--legal--data-policy-authority).

**Recommendation until ready:** make no new supplier commitment and publish no
new legal/product claim from this track. Reconcile the evidence and prepare a
short set of bounded business choices with cost, customer, legal, and timing
consequences; do not ask the founder to perform the missing research.

**Founder action now:** none.

## Explicit exclusions

- DQ-27/#438 is a settled-but-unexecuted operator action, not a judgement call.
- DQ-14 is a mixed legacy task list (credentials, vendor contact, automation,
  and repository cleanup), not a prepared founder decision.
- WP12/VERIFY-IP is an evidence problem, not a founder choice.
- Technical sequencing, implementation, testing, and ordinary shipping never
  belong in this file.

## Evidence basis

This view applies the queue-shape rules in the
[Operating Charter](../company/CHARTER.md), the current
[Decision Queue](../company/DECISION-QUEUE.md), and the
[M2 reconciliation](../../archive/sessions/2026-09-01-m2-product-state-reconciliation.md).
