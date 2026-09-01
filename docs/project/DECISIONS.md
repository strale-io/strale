---
doc_type: generated-decision-index
authority_scope: none
status: candidate
complete: false
phase: M2
m1_template: false
authority_active: false
verified_at: 2026-09-01
generated: true
---

# Decision Index (Candidate)

> [!CAUTION]
> **M2 CANDIDATE — NOT ACTIVE PROJECT AUTHORITY.**
> Review this candidate in place. Existing `AGENTS.md`, `CLAUDE.md`, and Notion-backed workflows remain in force until M4 cutover.

**PARTIAL GENERATED VIEW — `complete: false`.** The statuses below reproduce the formal decisions; they do not activate this index as project authority. Generated from `docs/decisions/records/DEC-*.md`.

## Active decisions

| Decision | Topic | Scope | Owner | Decided |
|---|---|---|---|---|
| [`DEC-20260812-A`](../decisions/records/DEC-20260812-A.md) — Adopt the Platform Readiness and Self-Operation program | `autonomous-operating-model` | global | petter | 2026-08-12 |
| [`DEC-20260815-A`](../decisions/records/DEC-20260815-A.md) — Adopt the operating charter and delegate day-to-day technical operations | `autonomous-operating-model` | global | petter | 2026-08-15 |
| [`DEC-20260822-A`](../decisions/records/DEC-20260822-A.md) — Reform daily operations with two artifacts, wider autonomy, and failure families | `autonomous-operating-model` | global | petter | 2026-08-22 |
| [`DEC-20260901-A`](../decisions/records/DEC-20260901-A.md) — Treat the context pack as complete founder input and make reconciliation M2 work | `project-memory-system-of-record` | global | petter | 2026-09-01 |

## Non-active decisions

| Decision | Topic | Scope | Owner | Decided |
|---|---|---|---|---|
| [`DEC-20260502-A`](../decisions/records/DEC-20260502-A.md) — Narrow Strale v1 to Counterparty Assurance and defer a lighter payment-shape product | `counterparty-assurance-v1` | product | petter | 2026-05-02 |
| [`DEC-20260503-A`](../decisions/records/DEC-20260503-A.md) — Split the public product and capability surfaces while keeping one backend | `public-surface-architecture` | global | petter | 2026-05-03 |
| [`DEC-20260831-A`](../decisions/records/DEC-20260831-A.md) — Adopt a staged repo-native operating model for Strale | `project-memory-system-of-record` | operational | petter | 2026-08-31 |

## Generated inverse relationships

| Target | Generated inverse | Source |
|---|---|---|
| [`DEC-20260502-A`](../decisions/records/DEC-20260502-A.md) | `superseded_by` | [`DEC-20260812-A`](../decisions/records/DEC-20260812-A.md) |
| [`DEC-20260503-A`](../decisions/records/DEC-20260503-A.md) | `superseded_by` | [`DEC-20260812-A`](../decisions/records/DEC-20260812-A.md) |
| [`DEC-20260812-A`](../decisions/records/DEC-20260812-A.md) | `amended_by` | [`DEC-20260815-A`](../decisions/records/DEC-20260815-A.md) |
| [`DEC-20260815-A`](../decisions/records/DEC-20260815-A.md) | `amended_by` | [`DEC-20260822-A`](../decisions/records/DEC-20260822-A.md) |
| [`DEC-20260831-A`](../decisions/records/DEC-20260831-A.md) | `superseded_by` | [`DEC-20260901-A`](../decisions/records/DEC-20260901-A.md) |
