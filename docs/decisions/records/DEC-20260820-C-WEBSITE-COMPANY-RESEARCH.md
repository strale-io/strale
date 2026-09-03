---
record_key: DEC-20260820-C-WEBSITE-COMPANY-RESEARCH
id: DEC-20260820-C-WEBSITE-COMPANY-RESEARCH
title: Website Company Research use-case world approved
status: active
topic: website-redesign
scope: design
owner: petter
decided_at: 2026-08-20
relations:
  - type: related_to
    target: DEC-20260820-E-WEBSITE-SEARCH-WEB
evidence:
  - https://app.notion.com/p/3c267c87082c819d89afdd257de4a15f
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

Adopt the Company Research chapter and its "Separate Lenses" grammar as the
governing pattern for the homepage use-case worlds. The chapter uses a
Discovery Blue atmosphere with deterministic copy and product proof, built
around one example Spotify AB registry result as the recurring proof object.
Company News and Country Economic Indicators are shown only as separate
possible next calls, never merged into the proof result. Tool-specific inputs,
outputs, and sources remain visibly distinct. Generated imagery contains no
UI, values, text, logos, or product claims. The unsupported funding
implication present in an earlier concept is removed from this composition.

## Context

Petter approved a high-fidelity desktop and mobile version of this chapter.

## Rationale

"Separate Lenses" — one contract-backed example result plus additional real
tool records that remain visibly separate calls — establishes a grammar that
proves the platform's data without implying that unrelated tools share a
result or a schema.

## Consequences

The design grammar is approved for extension to later homepage use-case
worlds (Enrichment & Validation, Search & Web Intelligence, Risk &
Verification each build on it). Preserved for this repository at
`strale-io/strale-frontend@f704cb2:docs/website-redesign/homepage/` on the
separate `codex/website-redesign` branch. No implementation, deployment,
merge, or release is authorized by this decision. This record also carries a
`related_to` edge to `DEC-20260820-E-WEBSITE-SEARCH-WEB` — the third
use-case world in the same approval sequence — solely to keep the
`website-redesign` topic's active records connected in the decision graph; it
does not assert a stronger relationship than "part of the same homepage
redesign sequence."

## Reversal conditions

Supersede this decision with a later website decision that changes the
approved Company Research chapter or the Separate Lenses grammar. This record
does not authorize implementation, so no implementation-level reversal is
needed.
