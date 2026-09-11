---
doc_type: protocol-router
authority_scope: none
status: candidate
complete: false
phase: M2
m1_template: false
authority_active: false
verified_at: 2026-09-11
generated: true
---

# Protocol Router (Candidate)

> [!CAUTION]
> **M2 CANDIDATE — NOT ACTIVE PROJECT AUTHORITY.**
> Review this candidate in place. Existing `AGENTS.md`, `CLAUDE.md`, and Notion-backed workflows remain in force until M4 cutover.

Every full protocol body linked below is itself an inactive mirror (`authority_active: false`); `CLAUDE.md` remains the sole authority for the ten mirrored rows and `docs/company/CHARTER.md` for production authority. This router is not mandatory startup context until the founder-gated M4 cutover activates it.

**PARTIAL GENERATED VIEW.** Generated from `docs/project/protocol-coverage.yaml`
by `scripts/protocol-coverage-lib.mjs` (`npm run context:generate`); checked
for drift by `npm run protocols:coverage`. Do not hand-edit this file --
change the manifest and regenerate.

| Trigger | Protocol | Full body |
|---|---|---|
| A commit introduces or substantially modifies a code path in response to a cert-audit finding (Y-, A-, B-, RED-, MED-, CRIT-, F-AUDIT- numbered), or touches a wallet transaction, audit-trail builder, chain-integrity primitive, spend-cap check, or idempotency check. | [Audit-Follow-up Test Coverage Protocol (DEC-20260504-A)](../governance/protocols/AUDIT_FOLLOWUP_TEST_COVERAGE.md) | `docs/governance/protocols/AUDIT_FOLLOWUP_TEST_COVERAGE.md` |
| A deploy fixes a long-silent bulk operation (retention, archival, reconciliation, batch processing, periodic cleanup). | [Bulk-Operation Deploy Protocol (DEC-20260504-B)](../governance/protocols/BULK_OPERATION_DEPLOY.md) | `docs/governance/protocols/BULK_OPERATION_DEPLOY.md` |
| A session creates, modifies, or onboards a capability: new executor file in src/capabilities/, new or modified capabilities DB row, new slug, manifest file, seed entry, or the prompt mentions adding a capability. | [Capability Onboarding Protocol (DEC-20260320-B)](../governance/protocols/CAPABILITY_ONBOARDING.md) | `docs/governance/protocols/CAPABILITY_ONBOARDING.md` |
| A PR adds a code path that depends on a deploy-pipeline behavior: migrations running, env vars read, build steps, startup hooks, scheduled jobs, cron triggers. | [Deploy Mechanism Verification Protocol (DEC-20260504-C)](../governance/protocols/DEPLOY_MECHANISM_VERIFICATION.md) | `docs/governance/protocols/DEPLOY_MECHANISM_VERIFICATION.md` |
| A session touches a PR on a repo outside strale-io/* or publishes/ modifies a *-strale package. | [Distribution PR Integrity Protocol (DEC-20260422-A)](../governance/protocols/DISTRIBUTION_PR_INTEGRITY.md) | `docs/governance/protocols/DISTRIBUTION_PR_INTEGRITY.md` |
| Any code path that checks or constructs write-credential authority for a production mutation, or that reasons about SYSTEM_ACTING, FOUNDER_DECISION, or AUTHORIZATION_UNAVAILABLE status. | [Production authority (DEC-20260822-B)](../company/CHARTER.md) | `docs/company/CHARTER.md` |
| Every session, both tools, at start (orient via docs/programs/README.md and the active track) and before stopping (the handoff gate must pass). | [Session contract (both tools, every session)](../governance/protocols/SESSION_CONTRACT.md) | `docs/governance/protocols/SESSION_CONTRACT.md` |
| Any session or agent works in this checkout at all; before branch- switching or a git-history-editing command in a non-isolated worktree. | [Shared-Checkout Rule (concurrency safety)](../governance/protocols/SHARED_CHECKOUT_RULE.md) | `docs/governance/protocols/SHARED_CHECKOUT_RULE.md` |
| Always: writing or modifying a health probe, a capability that calls a paid external API, or a test suite's scheduling behavior. | [Test Infrastructure Cost Principles (always enforce)](../governance/protocols/TEST_INFRASTRUCTURE_COST_PRINCIPLES.md) | `docs/governance/protocols/TEST_INFRASTRUCTURE_COST_PRINCIPLES.md` |
| An endpoint under /v1/public/ops/trust/* (or any future endpoint surfacing money values, scores, or anything formattable) is added or changed. | [Wire-shape rule for /v1/public/ops/trust/* endpoints](../governance/protocols/WIRE_SHAPE_TRUST_ENDPOINTS.md) | `docs/governance/protocols/WIRE_SHAPE_TRUST_ENDPOINTS.md` |
| A session creates a worktree and considers linking or junctioning its node_modules to the main checkout, or removes a worktree. | [Worktree node_modules Hazard](../governance/protocols/WORKTREE_NODE_MODULES_HAZARD.md) | `docs/governance/protocols/WORKTREE_NODE_MODULES_HAZARD.md` |
