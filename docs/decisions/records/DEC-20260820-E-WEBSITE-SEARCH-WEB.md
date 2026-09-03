---
record_key: DEC-20260820-E-WEBSITE-SEARCH-WEB
id: DEC-20260820-E-WEBSITE-SEARCH-WEB
title: Website Search & Web Intelligence use-case world approved
status: active
topic: website-use-case-worlds
scope: design
owner: petter
decided_at: 2026-08-20
relations: []
evidence:
  - https://app.notion.com/p/3c267c87082c812a8533d8eed592bb8f
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

Adopt the Search & Web Intelligence chapter in "Commerce Amber" as the third
homepage use-case world. Google Search is the selected proof, using a
documented output example explicitly labelled "not a live ranking". SERP
Analyze and URL to Text remain visibly separate next calls. Source URLs,
result order, and the evidence boundary all stay visible in the proof.
Generated imagery contains no UI, values, text, logos, or product claims.
Spacing, card proportions, wrapping, overflow, font loading, touch targets,
and responsive behaviour are explicitly reserved for a later normalization
review across the complete four-world sequence, once the fourth chapter is
designed.

## Context

Petter approved the Commerce Amber direction as the third use-case world,
while explicitly reserving a later cross-page responsive and spacing review
until after the fourth world is designed.

## Rationale

The chapter uses a labelled documented Google Search output example, honestly
marked as not a live ranking, and keeps SERP Analyze and URL to Text as
independent next calls, consistent with the Separate Lenses grammar used by
the earlier use-case worlds.

## Consequences

Commerce Amber and its truth boundary are approved as a design direction.
Responsive spacing remains explicitly subject to the planned systematic
four-world conformance review (completed and approved by
`DEC-20260820-F-WEBSITE-RISK-RESPONSIVE`). Preserved for this repository at
`strale-io/strale-frontend@f704cb2:docs/website-redesign/homepage/` on the
separate `codex/website-redesign` branch. No implementation or outward
release is authorized by this decision.

## Reversal conditions

Supersede this decision with a later website decision that changes the
approved Search & Web Intelligence chapter or its "not a live ranking"
labelling. This record does not authorize implementation, so no
implementation-level reversal is needed.
