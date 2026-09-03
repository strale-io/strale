---
record_key: DEC-20260820-A-WEBSITE-HERO
id: DEC-20260820-A-WEBSITE-HERO
title: Optical Reach hero with contract-backed product proof
status: active
topic: website-redesign
scope: design
owner: petter
decided_at: 2026-08-20
relations:
  - type: related_to
    target: DEC-20260820-B-WEBSITE-INTEGRATION-BURDEN
evidence:
  - https://app.notion.com/p/3c267c87082c81e09187de8e0cd7fe46
  - strale-io/strale-frontend@f704cb2:docs/website-redesign/homepage/
migration_status: candidate
authority_scope: none
authority_active: false
phase: M2
---

> [!CAUTION]
> **M2 CANDIDATE RECORD — NOT ACTIVE PROJECT AUTHORITY.**
> The recorded decision status is historical source data. Existing `AGENTS.md`, `CLAUDE.md`, and Notion-backed workflows remain authoritative until M4 cutover.

## Decision

Optical Reach governs the homepage hero design direction. Generated imagery is
limited to an abstract atmosphere layer that carries no factual claims. The
visible product proof shown alongside it is reconstructed from a shipped
Strale contract (the swedish-company-data capability) and is visibly labeled a
verified fixture rather than a live result. Live-only values — identifiers,
timestamps, latency — are omitted from static designs unless they are
genuinely live. If live facts are unavailable at render time, the component
fails closed to the labeled fixture rather than fabricating a fallback.

## Context

Petter approved Optical Reach as the homepage hero direction and explicitly
required that depicted outputs match what Strale actually returns. Of the
concepts reviewed, Optical Reach had the strongest brand atmosphere, but its
generated product card contained unsupported provider choices, prices, source
counts, and funding claims that Strale cannot back with a real capability.

## Rationale

Four options were weighed. Keeping the generated proof card was rejected
because it invents product facts. A generic, non-product illustration was
rejected because the homepage journey is proof-led and needs a real product
artifact. A compound recent-funding example was rejected because no single
stable Strale capability returns that result. The documented Swedish
company-data fixture was selected because its request, price, output schema,
provenance, and failure semantics are all auditable against the shipped
capability.

## Consequences

Atmosphere in the hero can be expressive but must never carry a product or
factual claim. Static proof values must be labeled `Example response` or
`Verified fixture`. Canonical facts shown must be read from Strale-owned
sources in production, not invented for the design. This record covers the
design-only artifacts on the separate `codex/website-redesign` branch under
`docs/website-redesign/homepage/`, preserved for this repository at
`strale-io/strale-frontend@f704cb2:docs/website-redesign/homepage/`. No
website implementation, merge, push, or deployment is authorized by this
decision. This record carries a `related_to` edge to
`DEC-20260820-B-WEBSITE-INTEGRATION-BURDEN` — the next homepage section in the
same approval sequence — solely to keep the `website-redesign` topic's active
records connected in the decision graph; it does not assert a stronger
relationship than "part of the same homepage redesign sequence."

## Reversal conditions

Supersede this decision with a later website decision that changes the
approved hero direction or its truth boundary. This record does not authorize
implementation, so no implementation-level reversal is needed; a reversal only
needs to retarget the design direction itself.
