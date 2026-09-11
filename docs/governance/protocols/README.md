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
- `SESSION_CONTRACT.md`: Session contract, both tools, every session.
- `DISTRIBUTION_PR_INTEGRITY.md`: Distribution PR Integrity Protocol
  (DEC-20260422-A). `DISTRIBUTION_PR_PREFLIGHT.md` above stays the separate
  checklist it already was; this mirror is the full protocol text.
- `CAPABILITY_ONBOARDING.md`: Capability Onboarding Protocol
  (DEC-20260320-B). The "Adding New Capabilities (MANDATORY PIPELINE)"
  section of `CLAUDE.md` is the how-to this protocol governs and is a
  separate section, not part of this mirror.
- `AUDIT_FOLLOWUP_TEST_COVERAGE.md`: Audit-Follow-up Test Coverage
  Protocol (DEC-20260504-A).
- `BULK_OPERATION_DEPLOY.md`: Bulk-Operation Deploy Protocol
  (DEC-20260504-B).
- `SHARED_CHECKOUT_RULE.md`: Shared-Checkout Rule (concurrency safety).
  The "Worktree node_modules Hazard" section that follows it in
  `CLAUDE.md` is a separate rule, not part of this mirror.

All seven mandatory protocols now have inactive, checked mirrors (M3 batch
6a and 6b). Next is the protocol coverage manifest and a populated router,
`docs/project/PROTOCOL-ROUTER.md` (M3 batch 7).
