---
record_key: DEC-20260820-F-WEBSITE-RISK-RESPONSIVE
id: DEC-20260820-F-WEBSITE-RISK-RESPONSIVE
title: Approve Execution Coral and four-world responsive conformance
status: active
topic: website-use-case-worlds
scope: design
owner: petter
decided_at: 2026-08-20
relations:
  - type: related_to
    target: DEC-20260820-C-WEBSITE-COMPANY-RESEARCH
  - type: related_to
    target: DEC-20260820-D-WEBSITE-ENRICHMENT-VALIDATION
  - type: related_to
    target: DEC-20260820-E-WEBSITE-SEARCH-WEB
evidence:
  - https://app.notion.com/p/3c267c87082c81f98018f6fb4d90b2c1
  - strale-io/strale-frontend@f704cb2:docs/website-redesign/homepage/use-case-risk-verification-v1.7.md
  - strale-io/strale-frontend@f704cb2:docs/website-redesign/foundations/responsive-content-conformance-v1.0.md
  - strale-io/strale-frontend@f704cb2:docs/website-redesign/homepage/round-09-four-world-responsive-review/four-world-conformance-report.md
migration_status: candidate
authority_scope: none
authority_active: false
phase: M2
---

> [!CAUTION]
> **M2 CANDIDATE RECORD — NOT ACTIVE PROJECT AUTHORITY.**
> The recorded decision status is historical source data. Existing `AGENTS.md`, `CLAUDE.md`, and Notion-backed workflows remain authoritative until M4 cutover.

## Decision

Approve "Execution Coral" for Risk & Verification, the fourth homepage
use-case world, and approve "Responsive and Content Conformance v1.0" as the
governing production-quality addendum for the complete four-world sequence.
The selected proof is the deterministic Swedish VAT-format fixture. Sanctions
Check and PEP Check remain visibly separate possible next checks; no screening
outcome is fabricated by the VAT-format proof. The four worlds use
content-driven grid flow, system spacing and radii, safe wrapping, and a
shared breakpoint strategy. The completed conformance audit recorded 56
geometry checks with zero failures.

## Context

The fourth use-case world and the subsequent responsive normalization were
reviewed only after Company Research, Enrichment & Validation, and Search &
Web Intelligence had already been approved (`DEC-20260820-C`,
`DEC-20260820-D`, `DEC-20260820-E`), so this record closes the reserved
four-world responsive review named in `DEC-20260820-E-WEBSITE-SEARCH-WEB`.

## Rationale

The VAT-format result is exact, reproducible, and narrowly bounded, so the
chapter stays commercially relevant without returning the site to
compliance-first positioning. Explicit qualifications prevent format validity
from being mistaken for registration, activity, or screening clearance.
Content-driven layout removes the desktop collision seen in Commerce Amber and
stays stable under longer copy and fallback fonts. A measurable conformance
gate (the 56-check geometry audit) is more reliable than subjective responsive
polish alone.

## Consequences

The complete four-world direction may proceed into the next homepage chapter.
Production work must still self-host fonts, implement semantic chapter
controls, verify keyboard and reduced-motion behaviour, test real 200% zoom,
and establish CI visual-diff baselines before release. Repository record:
`strale-io/strale-frontend@f704cb2:docs/website-redesign/homepage/use-case-risk-verification-v1.7.md`,
`strale-io/strale-frontend@f704cb2:docs/website-redesign/foundations/responsive-content-conformance-v1.0.md`,
and `strale-io/strale-frontend@f704cb2:docs/website-redesign/homepage/round-09-four-world-responsive-review/four-world-conformance-report.md`,
on the separate `codex/website-redesign` branch, commit `f704cb2`. This
approval does not authorize website implementation, merge, deployment, or
integration with concurrent backend work. This record's three `related_to`
edges record that it governs the four-world sequence that
`DEC-20260820-C-WEBSITE-COMPANY-RESEARCH`, `DEC-20260820-D-WEBSITE-ENRICHMENT-VALIDATION`,
and `DEC-20260820-E-WEBSITE-SEARCH-WEB` establish.

## Reversal conditions

Supersede this decision with a later website decision that changes the
approved Execution Coral chapter or the Responsive and Content Conformance
v1.0 addendum. This record does not authorize implementation, so no
implementation-level reversal is needed.
