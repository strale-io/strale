---
doc_type: project-product
authority_scope: none
status: candidate
complete: false
phase: M2
m1_template: false
authority_active: false
verified_at: 2026-09-01
---

# Product

> [!CAUTION]
> **M2 CANDIDATE — NOT ACTIVE PROJECT AUTHORITY.**
> Review this candidate in place. Existing `AGENTS.md`, `CLAUDE.md`, and Notion-backed workflows remain in force until M4 cutover.

## What Strale is

Strale is the data and capability layer for AI agents: independently tested,
audit-logged external tools and data sources that agents can discover, call, and
pay for without a separate integration and commercial relationship for every
provider.

The clearest product expression is:

> **One connection to the tools your agent needs.**

The intended experience is one integration surface, task-oriented discovery, a
common execution contract, structured attributable results, and machine-native
payment. Some parts of that long-term experience—especially retrieval quality
and customer-facing verification—remain active product work rather than promises
of complete implementation.

## Who it is for

The working acquisition wedge is a developer or operator running recurring
agent workflows that need several external commercial, research, enrichment,
validation, geocoding, document, image, or search capabilities.

This is an evidence-sensitive wedge, not product-market fit and not the whole
company. Strale remains vertical-agnostic. Compliance/KYB is a useful product
track, but current buyer evidence does not justify automatically ranking every
new KYB build above demonstrated demand in broader utility capabilities.

## Positioning boundaries

Strale is:

- agent-first, while still understandable to human builders;
- a broad capability library with a consistent contract;
- machine-discoverable and machine-purchasable;
- evidence-led about quality, outcomes, provenance, and limits.

Strale is not:

- a generic workflow builder or automation platform;
- a human-browsed API marketplace with no shared contract;
- a KYB-only company;
- a random catalogue of unrelated wrappers;
- an enterprise integration consultancy.

## Product advantages

1. **One integration surface.** A new task should not require another bespoke
   provider integration, credential, and billing setup.
2. **Discovery.** An agent should be able to state a job and find the right
   capability or solution. [WP16 Discovery & Retrieval Authority](../remediation/ORCHESTRATOR.md#wp16--discovery--retrieval-authority)
   exists because this is not yet good enough.
3. **Common execution contract.** Authorization, schemas, failure semantics,
   payment, provenance, and execution records should be predictable across the
   library.
4. **Machine-native payment.** The adopted
   [direction plan](../strategy/2026-08-05-direction-plan.md) makes x402—an
   HTTP-native way for software agents to pay per request—the primary strategic
   rail under DEC-20260812-A. Prepaid/API access remains supported.
5. **Execution evidence.** `strale.execution.v1` receipts are internally chained
   and reproducible. They are not currently a customer-facing signed
   verification product.

## Principles

- **Library as product.** Breadth, metadata, quality, discoverability, and
  consistency are core product surfaces.
- **One authority per business fact; many thin consumers.** A fact is defined in
  one place and read elsewhere rather than copied into competing truth surfaces.
- **Pay for successful work.** Refusals and failures must not be presented or
  billed as successful outcomes. Exact money-path behavior remains governed by
  formal Decisions, code, and discriminating tests; the accepted
  [platform-readiness program](../strategy/2026-08-12-platform-readiness-program.md)
  is the current durable strategy source.
- **Evidence over claims.** Do not infer deployment from a merged PR, customer
  behavior from incomplete identity data, or safety from a control that observes
  too late.
- **Demand over doctrine.** Build priority follows measured buyer behavior and
  validated gaps, within the [Operating Charter](../company/CHARTER.md) and
  active Decisions.

## Commercial objective

The medium-term goal is **$2,000/week gross revenue**. Operational milestones
remain denominated in EUR; the goal milestone is approximately EUR 1,850/week.
Revenue alone does not clear the earlier milestones: repeat behavior and reduced
largest-buyer concentration matter at least as much at the present scale.

## Current strategic horizon

After the bounded operating-model and remediation residuals, the next major
forward-looking product/technical program is
[WP16 Discovery & Retrieval Authority](../remediation/ORCHESTRATOR.md#wp16--discovery--retrieval-authority):
contain the current discovery surface, freeze an approximately
200-query benchmark, and only then change retrieval or ranking.

## Evidence basis

This candidate was distilled from the
[37-claim reconciliation](../../archive/sessions/2026-09-01-m2-product-state-reconciliation.md)
and its [claim matrix](../../archive/sessions/2026-09-01-m2-product-state-claim-matrix.json).
Durable strategy currently remains in [GOALS](../company/GOALS.md),
DEC-20260812-A and its adopted direction/readiness plans, and the active
[Charter](../company/CHARTER.md)/Decision chain until M4 cutover.
