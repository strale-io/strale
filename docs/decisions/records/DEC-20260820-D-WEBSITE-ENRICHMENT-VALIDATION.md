---
record_key: DEC-20260820-D-WEBSITE-ENRICHMENT-VALIDATION
id: DEC-20260820-D-WEBSITE-ENRICHMENT-VALIDATION
title: Website Enrichment & Validation use-case world approved
status: active
topic: website-redesign
scope: design
owner: petter
decided_at: 2026-08-20
relations:
  - type: related_to
    target: DEC-20260820-C-WEBSITE-COMPANY-RESEARCH
evidence:
  - https://app.notion.com/p/3c267c87082c8132adcce02b453b63cb
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

Adopt the Enrichment & Validation chapter in "Selection Violet" as the second
homepage use-case world. Company Name Match is the selected proof, using the
deterministic `Spotify AB` / `Spotify Aktiebolag` known-answer fixture. Email
Validation and Phone Validate remain visibly separate next calls, not folded
into the name-match proof. A name match is not presented as legal-identity
proof or as contact-data validation — those are different, narrower claims.
Generated imagery contains no UI, values, text, logos, or product claims.
Desktop and mobile preserve the same truth hierarchy, without relying on
swipe-only interaction to convey it.

## Context

Petter approved a high-fidelity desktop and mobile version of the Selection
Violet chapter. It is the second use-case world in the four-world homepage
sequence, following Company Research.

## Rationale

The chapter extends the Separate Lenses grammar established by
`DEC-20260820-C-WEBSITE-COMPANY-RESEARCH`: one deterministic Company Name
Match result plus two real validation tools presented as independent next
calls, so a company-name match cannot be mistaken for a legal-identity or
contact-data verification it does not perform.

## Consequences

Selection Violet and its truth boundary are approved for the homepage design
system. This decision extends `DEC-20260820-C-WEBSITE-COMPANY-RESEARCH` and
its Separate Lenses grammar rather than replacing it. Preserved for this
repository at `strale-io/strale-frontend@f704cb2:docs/website-redesign/homepage/`
on the separate `codex/website-redesign` branch. No implementation,
deployment, merge, or release is authorized by this decision.

## Reversal conditions

Supersede this decision with a later website decision that changes the
approved Enrichment & Validation chapter or its name-match truth boundary.
This record does not authorize implementation, so no implementation-level
reversal is needed.
