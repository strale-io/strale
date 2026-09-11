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

Every full protocol body linked below is itself an inactive mirror (`authority_active: false`); `CLAUDE.md` remains the sole authority for the mirrored rows and `docs/company/CHARTER.md` for production authority. This router is not mandatory startup context until the founder-gated M4 cutover activates it.

**PARTIAL GENERATED VIEW.** Generated from `docs/project/protocol-coverage.yaml`
by `scripts/protocol-coverage-lib.mjs` (`npm run context:generate`); checked
for drift by `npm run protocols:coverage`. Do not hand-edit this file --
change the manifest and regenerate.

| Trigger | Protocol | Full body |
|---|---|---|
| A commit introduces or substantially modifies a code path in response to a cert-audit finding (Y-, A-, B-, RED-, MED-, CRIT-, F-AUDIT- numbered), or touches a wallet transaction, audit-trail builder, chain-integrity primitive, spend-cap check, or idempotency check. | [Audit-Follow-up Test Coverage Protocol (DEC-20260504-A)](../governance/protocols/AUDIT_FOLLOWUP_TEST_COVERAGE.md) | `docs/governance/protocols/AUDIT_FOLLOWUP_TEST_COVERAGE.md` |
| A deploy fixes a long-silent bulk operation (retention, archival, reconciliation, batch processing, periodic cleanup). | [Bulk-Operation Deploy Protocol (DEC-20260504-B)](../governance/protocols/BULK_OPERATION_DEPLOY.md) | `docs/governance/protocols/BULK_OPERATION_DEPLOY.md` |
| A session creates, modifies, or onboards a capability: new executor file in src/capabilities/, new or modified capabilities DB row, new slug, manifest file, seed entry, or the prompt mentions adding a capability. | [Capability Onboarding Protocol (DEC-20260320-B)](../governance/protocols/CAPABILITY_ONBOARDING.md) | `docs/governance/protocols/CAPABILITY_ONBOARDING.md` |
| A session is about to write a new capability's manifest and executor and needs the exact pipeline steps and flags (--discover, --backfill, --fix, --strict) rather than the protocol's trigger/rules text. | [Adding New Capabilities (MANDATORY PIPELINE)](../governance/protocols/CAPABILITY_ONBOARDING_PIPELINE.md) | `docs/governance/protocols/CAPABILITY_ONBOARDING_PIPELINE.md` |
| A session adds or reads a process.env.NAME under apps/api/src, apps/api/scripts, packages, or scripts; imports a Claude/Voyage/GPT model id; or writes a public claim about the platform. | [Cheap extras — env manifest, model registry, claims register (T14)](../governance/protocols/CHEAP_EXTRAS_REGISTERS.md) | `docs/governance/protocols/CHEAP_EXTRAS_REGISTERS.md` |
| A PR adds a code path that depends on a deploy-pipeline behavior: migrations running, env vars read, build steps, startup hooks, scheduled jobs, cron triggers. | [Deploy Mechanism Verification Protocol (DEC-20260504-C)](../governance/protocols/DEPLOY_MECHANISM_VERIFICATION.md) | `docs/governance/protocols/DEPLOY_MECHANISM_VERIFICATION.md` |
| A session needs a colour, font, spacing, or radius value for a surface design/check covers, or is exploring or promoting a candidate token direction. | [Design tokens — where design values live](../governance/protocols/DESIGN_TOKENS.md) | `docs/governance/protocols/DESIGN_TOKENS.md` |
| A session touches a PR on a repo outside strale-io/* or publishes/ modifies a *-strale package. | [Distribution PR Integrity Protocol (DEC-20260422-A)](../governance/protocols/DISTRIBUTION_PR_INTEGRITY.md) | `docs/governance/protocols/DISTRIBUTION_PR_INTEGRITY.md` |
| A session changes a fact that appears on multiple surfaces (capability count, country count, retention period, vendor names, free-tier list, processing region). | [Drift-prevention surfaces](../governance/protocols/DRIFT_PREVENTION_SURFACES.md) | `docs/governance/protocols/DRIFT_PREVENTION_SURFACES.md` |
| A session needs to cite test or production evidence for a decision record, program track, or remediation package, or adds/edits a startup-migration block in apps/api/src/lib/startup-migrations.ts. | [Evidence receipts and the migration ledger (T15)](../governance/protocols/EVIDENCE_RECEIPTS_MIGRATION_LEDGER.md) | `docs/governance/protocols/EVIDENCE_RECEIPTS_MIGRATION_LEDGER.md` |
| Any code path that checks or constructs write-credential authority for a production mutation, or that reasons about SYSTEM_ACTING, FOUNDER_DECISION, or AUTHORIZATION_UNAVAILABLE status. | [Production authority (DEC-20260822-B)](../company/CHARTER.md) | `docs/company/CHARTER.md` |
| A session starts or resumes multi-batch work tracked in docs/programs/, or needs to find where a program's next bounded task is recorded. | [Program register — where multi-batch work resumes](../governance/protocols/PROGRAM_REGISTER.md) | `docs/governance/protocols/PROGRAM_REGISTER.md` |
| A session writes up a research finding or a product idea and needs to decide between docs/research/ and docs/company/IDEAS.md. | [Research and ideas — where each one lives](../governance/protocols/RESEARCH_AND_IDEAS.md) | `docs/governance/protocols/RESEARCH_AND_IDEAS.md` |
| A session needs to know which reviewer performs a required independent review of its work, or whether a batch that would have gone to Codex must be recorded in the review backlog. | [Review routing](../governance/protocols/REVIEW_ROUTING.md) | `docs/governance/protocols/REVIEW_ROUTING.md` |
| A capability scores poorly under a future routing-engine signal and a session is deciding how to respond. | [Scoring Integrity (retired with the SQS engine — DEC-20260503-B)](../governance/protocols/SCORING_INTEGRITY_RETIRED.md) | `docs/governance/protocols/SCORING_INTEGRITY_RETIRED.md` |
| Every session, both tools, at start (orient via docs/programs/README.md and the active track) and before stopping (the handoff gate must pass). | [Session contract (both tools, every session)](../governance/protocols/SESSION_CONTRACT.md) | `docs/governance/protocols/SESSION_CONTRACT.md` |
| Any session or agent works in this checkout at all; before branch- switching or a git-history-editing command in a non-isolated worktree. | [Shared-Checkout Rule (concurrency safety)](../governance/protocols/SHARED_CHECKOUT_RULE.md) | `docs/governance/protocols/SHARED_CHECKOUT_RULE.md` |
| Always: writing or modifying a health probe, a capability that calls a paid external API, or a test suite's scheduling behavior. | [Test Infrastructure Cost Principles (always enforce)](../governance/protocols/TEST_INFRASTRUCTURE_COST_PRINCIPLES.md) | `docs/governance/protocols/TEST_INFRASTRUCTURE_COST_PRINCIPLES.md` |
| An endpoint under /v1/public/ops/trust/* (or any future endpoint surfacing money values, scores, or anything formattable) is added or changed. | [Wire-shape rule for /v1/public/ops/trust/* endpoints](../governance/protocols/WIRE_SHAPE_TRUST_ENDPOINTS.md) | `docs/governance/protocols/WIRE_SHAPE_TRUST_ENDPOINTS.md` |
| A session creates a worktree and considers linking or junctioning its node_modules to the main checkout, or removes a worktree. | [Worktree node_modules Hazard](../governance/protocols/WORKTREE_NODE_MODULES_HAZARD.md) | `docs/governance/protocols/WORKTREE_NODE_MODULES_HAZARD.md` |
