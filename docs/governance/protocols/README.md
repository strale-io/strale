---
doc_type: protocol-library-navigation
authority_scope: none
status: skeleton
complete: false
phase: M1
m1_template: true
---

# Protocol Library

> [!CAUTION]
> **M1 NON-AUTHORITATIVE SKELETON — DO NOT USE AS PROJECT TRUTH.**
> Existing `AGENTS.md`, `CLAUDE.md`, and Notion-backed workflows remain in force.

<!-- M1-TEMPLATE: no project truth -->

No M1/M2 protocol-router body has moved here yet — this file stays the
inert future destination for that extraction.

Two standalone checklists were relocated here from the repo root on
2026-09-02 (T5, CTO-readable structure): `DISTRIBUTION_PR_PREFLIGHT.md` and
`REVIEW_TEMPLATE.md`. They are read directly at their new path (CLAUDE.md's
Distribution PR Integrity Protocol links the first; sessions writing a
review-findings file follow the second) and are unaffected by the M1/M2
candidate status of this README — they were already live governance
documents before the move, just filed at the repo root.

## Extracted protocol mirrors (inactive, T6 M3 batch 6)

The files below are byte-identical, inactive mirrors of a mandatory
protocol's full text in `CLAUDE.md`, marked with `authority_active: false`
front matter and a `<!-- BEGIN/END VERBATIM FROM CLAUDE.md -->` block.
`CLAUDE.md` remains the sole authority for all of them until the
founder-gated M4 cutover; `npm run protocols:check` fails if a mirror ever
diverges from the `CLAUDE.md` section it copies.

- `DEPLOY_MECHANISM_VERIFICATION.md`: Deploy Mechanism Verification
  Protocol (DEC-20260504-C).

The remaining six mandatory protocols/rules (session contract, Distribution
PR Integrity, Capability Onboarding, Audit-Follow-up Test Coverage,
Bulk-Operation Deploy, Shared-Checkout Rule) are extracted together in the
next batch (M3 batch 6b), once this batch's check has proven the pattern.
