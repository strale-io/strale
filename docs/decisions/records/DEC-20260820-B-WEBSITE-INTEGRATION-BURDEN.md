---
record_key: DEC-20260820-B-WEBSITE-INTEGRATION-BURDEN
id: DEC-20260820-B-WEBSITE-INTEGRATION-BURDEN
title: Website homepage integration-burden section approved
status: active
topic: website-homepage-integration-section
scope: design
owner: petter
decided_at: 2026-08-20
relations: []
evidence:
  - https://app.notion.com/p/3c267c87082c81ee9e7cc995b11f12d6
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

Adopt "The burden collapses" as the second homepage proof section. Direct
integrations are shown with repeated credentials, billing, schema handling,
and error handling per tool. The Strale route is shown collapsing that into a
shared outer execution contract, using real request/result field names.
Tool-specific inputs, outputs, coverage, and limitations remain explicitly
distinct — they are not folded into the shared contract. The section is built
as a code-native systems diagram rather than generated imagery or a provider
map. No universal-schema, fixed-tool-count, or provider-uniformity claim is
made.

## Context

Petter approved a high-fidelity desktop and mobile design for this section. It
explains repeated provider setup collapsing into a shared Strale execution
contract while explicitly preserving each tool's distinct inputs, outputs,
coverage, and limitations.

## Rationale

A code-native, real-field-name diagram was chosen over generated imagery or a
provider map because it can show the actual shared contract without implying
a false uniformity across tools that don't share one. Keeping tool-specific
detail visibly separate avoids overstating what the shared contract covers.

## Consequences

This design direction is approved for later implementation, preserved for
this repository at `strale-io/strale-frontend@f704cb2:docs/website-redesign/homepage/`
on the separate `codex/website-redesign` branch. No implementation,
deployment, merge, or release is authorized by this decision.

## Reversal conditions

Supersede this decision with a later website decision that changes the
approved integration-burden section design or its no-uniformity-claim
boundary. This record does not authorize implementation, so no
implementation-level reversal is needed.
