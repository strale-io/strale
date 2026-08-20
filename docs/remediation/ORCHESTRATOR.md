# STRALE AUTONOMOUS REMEDIATION ORCHESTRATOR
## Final handoff for Claude Code + Fable + Codex

**Version:** 1.0  
**Date:** 2026-08-20  
**Audited baseline:** `482ef93341df1fe676bd6f9de4688be85609394b`

---

# 0. OPERATING INSTRUCTION

You are the autonomous technical lead for the Strale remediation program.

Your job is to:

1. independently verify the audit and remediation plan in this document against the current repository;
2. use the most capable available Fable model for architecture, critical reasoning, package planning, and acceptance;
3. delegate bounded implementation work to cheaper capable models where appropriate;
4. use Codex CLI as an independent, read-only adversarial reviewer;
5. require deterministic/mechanical proof wherever possible;
6. execute the remediation program autonomously package-by-package;
7. minimize founder interruptions;
8. preserve a durable remediation ledger so work can continue correctly across sessions/context resets;
9. stop only under the explicit human-escalation rules in this document.

This document is source material to **audit and improve**, not doctrine to accept blindly.

The first Fable pass MUST challenge it.

---

# 1. NON-TECHNICAL FOUNDER OPERATING MODEL

The founder is not the technical arbiter.

Do not ask the founder questions such as:

- which table structure to use;
- which transaction primitive to use;
- how to structure modules/classes;
- which retry algorithm to use;
- how to implement locking;
- what test framework pattern to use;
- which internal type design to choose;
- which migration mechanism is technically preferable.

Make those decisions yourself.

Escalate only when the decision materially changes:

- product behavior;
- customer-visible behavior;
- pricing/economics;
- legal/compliance posture;
- data-retention promises;
- irreversible production state;
- meaningful production downtime;
- external vendor spend beyond ordinary existing development usage;
- backwards compatibility in a way customers may notice;
- security posture in a way that requires business acceptance;
- unresolved disagreement between independent reviewers on a critical invariant.

If a technical decision has a clear best answer from engineering evidence, decide it.

---

# 2. AUTONOMY POLICY

The program should run continuously without requiring approval after every work package.

Internal package boundaries remain mandatory for quality, but they are **machine checkpoints**, not founder checkpoints.

For each package:

```text
Fable package plan
    ↓
worker implementation
    ↓
deterministic tests
    ↓
Codex adversarial review
    ↓
worker fixes
    ↓
Codex re-review
    ↓
Fable acceptance when required
    ↓
ledger update
    ↓
next package
```

Do not ask the founder to approve moving from one package to the next unless a human-escalation condition is triggered.

---

# 3. HUMAN CHECK-INS — MINIMIZE AGGRESSIVELY

There are only three classes of human check-in.

## CHECK-IN A — Material re-plan

After the initial Fable re-audit, continue automatically **unless** Fable concludes that one or more of these are true:

- the audit is materially wrong;
- current `main` has already changed the architecture enough that the sequence is unsafe;
- a critical finding is invalid;
- a new critical risk materially changes priorities;
- the plan would require a product/legal decision.

If none are true, do not stop. Record the revised plan and proceed.

## CHECK-IN B — Production / irreversible boundary

Before an action that is genuinely irreversible or production-sensitive, request one explicit founder approval.

Examples:
- destructive/non-reversible production migration;
- production data rewrite;
- production credential rotation;
- material customer-visible legal text change;
- knowingly breaking backwards compatibility;
- meaningful downtime;
- real payment/provider calls beyond existing normal testing;
- enabling a backlog that could trigger significant production work.

Batch these where possible so the founder is not interrupted repeatedly.

Ordinary reversible migrations with a safe rollback, CI changes, application code, tests, local/ephemeral DB work, documentation, branches, commits, and read-only production verification do **not** require approval.

## CHECK-IN C — Unresolved critical disagreement/blocker

Stop only when:
- Fable and Codex materially disagree on a critical invariant and cannot resolve it from code/evidence;
- required external evidence is unavailable and proceeding would be unsafe;
- repository state is inconsistent/corrupt;
- a requested capability/tool is actually unavailable and no safe substitute exists.

Present:
1. the decision needed;
2. the competing options;
3. your recommendation;
4. consequences;
5. the single founder decision required.

Do not expose low-level implementation detail unless necessary.

---

# 4. MODEL ROUTING

Use the strongest available Fable model for:

- initial audit challenge;
- architecture;
- concurrency/payment reasoning;
- database transaction design;
- state-machine design;
- migrations with material risk;
- security-critical design;
- legal/data architecture;
- retrieval/discovery architecture;
- reviewing Codex findings that are disputed;
- acceptance of critical packages.

Use a strong mid-tier Claude model for:

- implementing critical packages after Fable freezes the plan;
- nontrivial migrations;
- critical regression tests;
- fixing Codex findings.

Use cheaper capable models for:

- mechanical call-site migrations;
- repetitive projection plumbing;
- dead-code deletion;
- CI guards;
- straightforward unit tests;
- docs;
- low-risk hygiene;
- repetitive metadata synchronization.

Do **not** optimize model cost at the expense of correctness on:

- wallet/money;
- x402;
- audit chain;
- idempotency;
- auth/recovery;
- network security;
- legal/data retention;
- database migrations;
- retrieval architecture.

---

# 5. CODEX ROLE — INDEPENDENT RED TEAM

Codex is a verifier, not a co-implementer.

When reviewing a package, invoke Codex CLI with a read-only/adversarial brief.

Codex must:

- inspect the full diff;
- inspect surrounding code;
- inspect all prior authorities/consumers;
- try to find bypasses;
- challenge tests;
- identify concurrency/replay/crash cases;
- inspect migration/deploy implications;
- search for old authority paths left behind;
- classify findings as blocking or non-blocking.

Codex should return one of:

```text
PASS
PASS_WITH_NON_BLOCKING_FINDINGS
FAIL_REMEDIATION_REQUIRED
```

Codex should not modify code during review.

If `FAIL_REMEDIATION_REQUIRED`:
- send findings to the implementation owner;
- implement valid fixes;
- rerun deterministic tests;
- invoke Codex again.

Continue until PASS or PASS_WITH_NON_BLOCKING_FINDINGS.

For a disputed Codex finding, ask Fable to adjudicate from repository evidence.

---

# 6. FABLE ACCEPTANCE POLICY

Fable acceptance is mandatory for these packages:

- M0
- WP0
- WP1
- WP2
- WP3
- WP4
- WP5
- WP6
- WP7
- WP8
- WP11
- WP12
- WP14
- WP16.2
- WP16.3
- WP16.4
- WP16.5

For lower-risk packages, Codex PASS plus deterministic proof is sufficient unless the package changes architecture unexpectedly.

Fable acceptance asks:

1. Are the intended invariants actually enforced?
2. Did the implementation create a new competing authority?
3. Were all intended consumers migrated?
4. Was old authority deleted?
5. Is there a bypass?
6. Are tests discriminating rather than decorative?
7. Are migration/deploy semantics safe?
8. Does this create problems for dependent packages?
9. Is the package genuinely complete?

---

# 7. MECHANICAL PROOF RULE

A model statement is not proof when an invariant can be tested.

For every invariant that can be mechanized:

- write a deterministic test;
- show it fails against the pre-fix behavior where practical;
- show it passes after the fix;
- mutation-test or otherwise discriminate critical tests where appropriate.

Tests must target business invariants, not merely implementation detail.

Examples:

## Wallet
- two concurrent reservations cannot overspend;
- duplicate capture is idempotent;
- duplicate release is idempotent;
- hard crash after reserve is recoverable.

## x402
- verify succeeds → execute succeeds → settlement succeeds → process dies before recording → recovery creates exactly one canonical record.

## Audit
- concurrent finalization cannot branch the chain.

## Idempotency
- same key + different payload cannot replay.

## Retrieval
- explicit Sweden cannot rank US product above valid Swedish products after structured constraints;
- unsupported needs can return no-match;
- “only DNS” does not select an email workflow.

---

# 8. COUNTEREXAMPLE / STATE-MACHINE FALSIFICATION

For every critical package, Fable and/or Codex must construct plausible counterexample sequences before acceptance.

Examples:

```text
reserve A
reserve B
A crashes
B captures
reconciler runs
A retries
```

```text
x402 verify
execute
settle
process death
retry
reconcile
```

```text
two audit finalizers
same previous head
concurrent commit
```

```text
explicit Sweden query
high semantic similarity US solution
solution bonus
rerank
```

Convert plausible counterexamples into tests where possible.

---

# 9. REMEDIATION LEDGER — REQUIRED

Create and maintain:

`docs/remediation/REMEDIATION-LEDGER.md`

This is the durable source of truth across sessions.

For every package record:

- package ID/title;
- date started/completed;
- current commit SHA before work;
- findings/risks addressed;
- package plan;
- files changed;
- migrations;
- invariants;
- tests;
- Codex result;
- Fable result where required;
- deployment/read-only verification;
- old authority removed?;
- bypass guard added?;
- residual risks;
- follow-up items;
- final commit SHA(s);
- status:
  - PLANNED
  - IN_PROGRESS
  - REVIEW
  - ACCEPTED
  - BLOCKED

Also maintain:

`docs/remediation/CURRENT-STATE.md`

This should contain only:
- current package;
- next package;
- unresolved blockers;
- latest accepted SHA;
- human approvals already granted;
- verification gates still open.

The ledger must make context loss harmless.

---

# 10. GIT / CHANGE MANAGEMENT

Default:

- work on a dedicated remediation branch or package-specific branches according to repository conventions;
- keep packages reviewable;
- commit coherent package changes;
- do not mix unrelated cleanup;
- preserve clean git state at package acceptance;
- do not silently modify unrelated areas.

If branch-protection/PR workflow exists, respect it.

Do not merge bypassing required CI.

Do not rewrite history on shared branches.

---

# 11. PRODUCTION SAFETY

Never:

- mutate production just to test;
- execute paid Strale capabilities as part of deterministic tests;
- trigger real x402 payments;
- run bulk scrapers;
- mass-replay accumulated jobs without assessing backlog;
- disable security/compliance controls to simplify implementation.

Prefer:
- ephemeral Postgres;
- mocks for external payment/provider systems;
- read-only production verification;
- shadow mode;
- reconciliation queries;
- reversible migrations.

---

# 12. PACKAGE COMPLETION FORMAT

At the end of every package, write an internal completion record with exactly:

1. files changed;
2. risks/findings addressed;
3. invariants now enforced;
4. tests added and why they discriminate;
5. full test results;
6. migration/deploy impact;
7. old authority removed?;
8. bypass guard added?;
9. residual risks;
10. git status + next package.

Do not ask the founder to read or approve each one.

Store it in the remediation ledger.

---

# 13. INITIAL FABLE RE-AUDIT

Before editing code:

1. Inspect current `main`.
2. Compare against audited baseline `482ef93341df1fe676bd6f9de4688be85609394b`.
3. Read this entire document.
4. Re-evaluate every P0/P1 risk against current code.
5. Identify:
   - fixed since audit;
   - still present;
   - partially present;
   - invalid/misunderstood;
   - new risks.
6. Re-evaluate package dependencies.
7. Produce a machine-readable package graph under:
   `docs/remediation/PACKAGE-GRAPH.yaml`
8. Produce:
   `docs/remediation/FABLE-REAUDIT.md`
9. Update the remediation ledger.
10. If no CHECK-IN A condition is triggered, automatically begin M0/WP0.

Do not ask for confirmation merely because the plan changed slightly.

---

# 14. PACKAGE MANIFEST FORMAT

Before implementation of each package, create/update a package manifest:

```yaml
package: WP3
title: Durable Wallet Reservations
status: PLANNED

depends_on:
  - WP1
  - WP2

risks:
  - CR-01

invariants:
  - no execution spends unreserved wallet funds
  - one reservation reaches exactly one terminal state
  - a hard crash cannot strand customer funds indefinitely

migration_required: true

tests_required:
  - concurrent reserve
  - duplicate capture
  - duplicate release
  - hard-process-kill recovery
  - stale reservation reconciliation

review:
  codex: required
  fable: required

deployment:
  shadow_mode: preferred
  reconciliation: required

exit_conditions:
  - no direct wallet writes outside WalletService
  - deterministic tests pass
  - Codex PASS
  - Fable ACCEPT
```

Store manifests under:
`docs/remediation/packages/`

---

# 15. REVIEWER DISAGREEMENT PROTOCOL

If Codex flags a blocker and the implementer disagrees:

1. do not dismiss it;
2. ask Fable to inspect:
   - finding;
   - diff;
   - relevant surrounding code;
   - invariant;
   - tests;
3. Fable returns:
   - VALID_BLOCKER;
   - VALID_NON_BLOCKING;
   - INVALID_FINDING;
   - INSUFFICIENT_EVIDENCE.
4. If INSUFFICIENT_EVIDENCE on a critical invariant:
   - create a falsification test or read-only runtime verification;
   - do not proceed on intuition.

Escalate to founder only if CHECK-IN C applies.

---

# 16. MASTER REMEDIATION PLAN

The following is the complete technical remediation source plan. Fable must audit it before use.

---

# Strale — Master Remediation Plan

**Version:** 1.0  
**Date:** 2026-08-20  
**Audited baseline:** `482ef93341df1fe676bd6f9de4688be85609394b`  
**Scope:** Entire Strale backend/API, agent interfaces, test/CI system, payment rails, audit/quality infrastructure, data/legal controls, website discovery, internal retrieval, and external agent discoverability.

---

# 1. Executive conclusion

Strale does not primarily have a “bad codebase” problem.

The repeated failure mode across the audit is:

> **One important business fact is owned by multiple independent authorities.**

That pattern explains most of the critical defects found across money, execution semantics, audit finality, capability lifecycle, quality measurement, legal truth, search, and agent discovery.

The remediation program therefore follows one governing principle:

> **One authority per business fact; many thin consumers.**

The implementation strategy is:

1. **Contain dangerous behavior first.**
2. **Raise the proof floor before refactoring critical systems.**
3. **Introduce one canonical authority at a time.**
4. **Migrate all consumers.**
5. **Delete the old authority and add a bypass guard.**
6. **Only then simplify lower-value code and CI hygiene.**

Do not attempt a mega-refactor.

---

# 2. Overall risk posture

## Critical / P0 domains

1. Economic state integrity
2. Outcome/billability correctness
3. Audit-chain linearity/finality
4. Assurance gaps around money/data-critical behavior
5. Credential/account recovery
6. Trial-credit abuse
7. Raw-socket SSRF / resource amplification
8. Unsafe publication of test/customer-derived data
9. Retention/privacy truth contradictions
10. Discoverability surfaces that can confidently select the wrong product or fail to abstain

## High / P1 domains

1. Idempotency/replay
2. Policy divergence across execution rails
3. Quality evidence/metrology
4. Autonomous job durability
5. Stripe/account lifecycle
6. External discovery metadata authority
7. Internal hybrid retrieval architecture
8. MCP/A2A search divergence
9. x402 discovery/index assurance
10. Dependency/supply-chain verification

---

# 3. Target authority model

The end-state should have these canonical authorities.

## Core product/runtime

### A1. Product Catalog Projection
Owns:
- which products are publicly discoverable;
- canonical public product metadata;
- capability/solution exposure.

### A2. Execution Eligibility Policy
Owns:
- lifecycle eligibility;
- breaker state;
- payment rail eligibility;
- probation/degraded rules;
- spend limits and protocol eligibility.

### A3. Capability Runner + Execution Outcome
Owns:
- execution result;
- schema/output validity;
- billability;
- failure classification;
- canonical execution outcome.

### A4. Solution Orchestrator
Owns:
- solution step orchestration;
- gates;
- retry/parallel semantics;
- aggregate solution outcome.

### A5. Wallet Service
Owns:
- wallet mutations;
- reservations;
- capture/release;
- spend-cap accounting;
- closure/refund adjustments.

### A6. x402 Payment Service
Owns:
- verification;
- payment claim;
- settlement;
- deduplication;
- canonical x402 payment state.

### A7. Execution Record + Audit Snapshot Service
Owns:
- terminal execution record;
- canonical audit snapshot;
- hash-chain admission/finality.

### A8. Capability/Solution State Service
Owns:
- lifecycle state transitions;
- activation/quarantine/probation;
- state-write invariants.

### A9. Capability Invocation Facts
Owns:
- immutable invocation evidence;
- quality-floor facts;
- solution-component invocation evidence.

### A10. Durable Job Coordinator
Owns:
- recurring schedules;
- leases;
- retries;
- recovery deadlines;
- durable autonomous jobs.

## Legal/data

### A11. Legal & Data Policy Registry
Owns:
- retention facts;
- legal basis / processor status;
- DPA/subprocessor evidence;
- customer-content treatment;
- legally significant product claims.

## Discoverability

### A12. Discovery Metadata Registry
Owns canonical:
- product name/slug/type;
- human description;
- agent description;
- intent phrases / aliases;
- category;
- geography / jurisdiction;
- input concepts;
- output/evidence concepts;
- granularity;
- negative/scope hints;
- price rails;
- lifecycle/visibility;
- MCP projection;
- A2A projection;
- x402 projection;
- OpenAPI projection;
- llms projection;
- web/SEO projection;
- version/freshness.

### A13. Retrieval & Discovery Authority
Owns:
- query understanding;
- exact/lexical/semantic candidate generation;
- structured constraints;
- candidate union;
- reranking;
- calibrated abstention;
- final ranked products.

Website, MCP, A2A, and other search surfaces become thin consumers of A13.

---

# 4. Canonical risk register

## CR-01 — Economic state integrity
**Severity:** Critical / P0

Includes:
- concurrency-unsafe refunds;
- process-crash loss after optimistic debit;
- x402 settlement before durable state;
- paid calls accounted as free;
- Stripe paid-but-uncredited states;
- closure refund contradictions.

Primary work:
**WP2, WP3, WP5, WP11**

Exit:
- no route-level direct balance writes;
- every paid wallet execution is reserved/captured/released durably;
- every x402 execution has recoverable state;
- payment and execution facts reconcile.

---

## CR-02 — Outcome/billability authority
**Severity:** Critical / P0

Includes:
- gated solution charged via wrong rail;
- invalid outputs treated as billable success;
- executor resolution mistaken for usable result.

Primary work:
**WP4**

Exit:
- one `ExecutionOutcome`;
- one `OutputAssessment`;
- payment consumes `billable`, never route-local success heuristics.

---

## CR-03 — Idempotency/replay
**Severity:** High / P1

Primary work:
**WP6**

Exit:
- request fingerprint bound to idempotency key;
- same key/different payload rejected;
- MCP/A2A stable request IDs propagate;
- x402 dedup atomic.

---

## CR-04 — Audit-chain finality/linearity
**Severity:** Critical / P0

Primary work:
**WP7**

Exit:
- terminal records only enter hash chain;
- one canonical chain head;
- no genesis race;
- no x402 finalization race;
- topology tests prove one linear chain.

---

## CR-05 — Execution-policy divergence
**Severity:** High / P1

Primary work:
**WP8**

Exit:
- `/v1/do`, solutions, MCP, A2A, x402 all consume one eligibility policy;
- no legacy autoactivation;
- spend caps and lifecycle policy are universal.

---

## CR-06 — Quality evidence/metrology
**Severity:** High / P1

Primary work:
**WP9**

Exit:
- immutable invocation facts;
- solution component calls represented;
- infrastructure/test-harness failures cannot be blamed on capability quality;
- quality-floor decisions use canonical facts.

---

## CR-07 — Assurance gaps
**Severity:** High / P0

Primary work:
**WP1**

Exit:
- ephemeral Postgres CI;
- hard-kill tests;
- mutation/discrimination tests for critical paths;
- package-behavior tests;
- no test-only duplicate billing logic.

---

## CR-08 — Autonomous job durability
**Severity:** Medium-High / P1

Primary work:
**WP10**

Exit:
- schedules are wall-clock/durable;
- boot time does not reset cadence;
- failed jobs have durable retry/recovery state;
- onboarding retry is actually scheduled.

---

## CR-09 — Account/wallet/trial lifecycle
**Severity:** High / P0

Primary work:
**WP11**

Exit:
- account creation + wallet/trial ledger atomic;
- trial eligibility centralized;
- Stripe credits based on authoritative paid state;
- erasure/closure ledger-consistent.

---

## CR-10 — Credential/admin hardening
**Severity:** High / P0

Primary work:
**WP0, WP11**

Exit:
- proof-before-key-rotation;
- no emailed reusable bearer secrets;
- admin secret strength enforced;
- admin auth single authority.

---

## CR-11 — Non-HTTP egress safety
**Severity:** High / P0

Primary work:
**WP12**

Exit:
- raw TCP/TLS host resolution is rebound-safe;
- IPv6 private/ULA/link-local blocked;
- egress policy shared by all socket consumers.

---

## CR-12 — Resource amplification
**Severity:** High / P0

Primary work:
**WP0, WP12**

Exit:
- request/body/remote-response limits;
- x402 preverify concurrency/rate limits;
- public deep-health restricted;
- media operations bounded.

---

## CR-13 — Dependency/CI supply chain
**Severity:** Medium-High / P1

Primary work:
**VERIFY-DEP → WP13**

Exit:
- actual reachable advisories understood;
- GitHub Actions permissions minimized;
- action pinning policy decided and enforced.

---

## CR-14 — Unsafe publication of ops/test data
**Severity:** High / P0

Primary work:
**WP0, WP14**

Exit:
- test output never auto-published;
- public ops surfaces contain no raw customer/test payloads;
- examples curated/synthetic.

---

## CR-15 — Retention/erasure/privacy truth
**Severity:** High / P0

Primary work:
**WP14**

Exit:
- public privacy claims match runtime;
- 90d customer-content model enforced;
- referer/client metadata minimized;
- payer hashes classified/retained intentionally;
- erasure claims match actual linkage.

---

## CR-16 — Processor/vendor contract evidence
**Severity:** High / P0

Primary work:
**VERIFY-LEGAL → WP14**

Exit:
- DPA gating correct;
- Dilisense status resolved;
- subprocessor claims evidence-backed.

---

## CR-17 — Contract assent evidence
**Severity:** Medium-High / P1

Primary work:
**WP14**

Exit:
- ToS/DPA version actually presented and accepted;
- backend assent record reflects UI reality.

---

## CR-18 — GDPR/DPIA classification
**Severity:** Medium-High / P1

Primary work:
**WP14**

Exit:
- sanctions/PEP/adverse-media data classes properly categorized;
- DPIA rationale reflects actual Art 9/10/legitimate-interest analysis.

---

## CR-19 — Trusted client-IP provenance
**Severity:** Conditional High

Primary work:
**VERIFY-IP**

Exit:
- proxy chain documented;
- `X-Forwarded-For` trust assumptions verified in deployment.

---

## CR-20 — Low-value CI/runtime waste
**Severity:** Low-Medium / P2

Primary work:
**WP15**

Exit:
- real sleeps removed where practical;
- deterministic/live network lanes separated;
- stale ratchets removed;
- E2E/browser overhead right-sized.

---

## CR-21 — Internal retrieval quality
**Severity:** High / P0-P1 product risk

Evidence:
- Capabilities-page natural-language grid retrievability: **~1.3%**
- live semantic Top-1 acceptable: **42.6%**
- live colloquial Top-1: **25%**
- live ambiguous/multi-step Top-1: **20%**
- 10/10 intentionally unsupported queries received semantic recommendations.

Primary work:
**WP16**

Exit:
- clear supported Top-1 ≥90%;
- clear Recall@3 ≥95%;
- colloquial Top-1 ≥80%;
- colloquial Recall@3 ≥90%;
- candidate Recall@10 ≥99%;
- unsupported false-positive ≤10%;
- explicit geography wrong-selection near zero;
- strict scope/granularity ≥90%.

---

## CR-22 — External agent discoverability
**Severity:** High / P1

Includes:
- cold Need→Strale discovery weak;
- 406-skill A2A overload;
- x402 indexing completeness unassured;
- MCP registry metadata drift;
- stale package/framework copy;
- no external discovery observability.

Primary work:
**WP16.5–WP16.7**

Exit:
- canonical metadata projections;
- A2A progressive disclosure;
- MCP registry version sync;
- x402 expected-vs-indexed census;
- selected directory coverage monitored;
- external-discovery benchmark runs periodically.

---

# 5. Master implementation sequence

## Phase M0 — Freeze and reconcile
**Do before WP0.**

1. Compare current `main` with audited SHA.
2. Produce `audit-delta.md`.
3. Classify changes:
   - already fixes finding;
   - conflicts with planned work;
   - unrelated.
4. Rebaseline line/file references.
5. Do not silently reuse stale assumptions.

**Gate:** clean understanding of current main.

---

# WP0 — Immediate containment

## Objective
Reduce confirmed/high-confidence harm before deeper refactors.

## Changes

### Data/publication
- disable live test-output → public schema example publication;
- remove raw test input/output from public ops;
- make examples curated/synthetic only.

### Credential/account
- require mailbox proof before API-key rotation;
- stop emailing reusable bearer keys;
- enforce admin-secret minimum strength.

### Resource abuse
- Stripe webhook body-size cap before expensive auth/parse;
- x402 preverify IP/concurrency limiter;
- restrict or protect `/health/deep`;
- bound remote response bytes;
- bound media operations.

### Network
- temporary containment around raw socket consumers until WP12.

### Privacy
- strip/minimize full Referer/client metadata immediately.

### Discoverability containment
- fix capability-dropdown wrong-type routing;
- stop using whole-query substring filtering as the final Capabilities result set;
- make MCP fallback capable of returning no match.

## Tests
Every P0 fix requires pre-fix failure / post-fix pass where mechanically testable.

## Exit
No known easy exploitation/publication path remains open.

---

# WP1 — Proof floor

## Objective
Make critical refactors testable before changing architecture.

## Build

1. Ephemeral Postgres CI lane.
2. Real DB-contract tests for:
   - wallet locking;
   - reservations;
   - audit chain;
   - idempotency uniqueness;
   - Stripe webhook crediting.
3. Hard-process-kill tests:
   - after reservation;
   - during execution;
   - after x402 verification;
   - after settlement request;
   - before canonical recording.
4. Mutation/discrimination tests for:
   - money;
   - output validity;
   - audit;
   - solution gates;
   - idempotency.
5. Published package behavior tests.
6. Remove test-only duplicate billing/payment logic.
7. Create retrieval benchmark harness as a permanent eval asset:
   - frozen 200-query set;
   - live catalog-presence validation;
   - strict scope labels;
   - geography labels;
   - unsupported/no-match set.

## Exit
Critical invariants can be falsified by tests.

---

# WP2 — Wallet Service

## Objective
Create one authority for wallet mutations.

## Introduce
`WalletService`

Operations:
- get available balance;
- reserve;
- capture;
- release;
- credit;
- adjustment;
- closure refund;
- hourly spend accounting.

## Migrate
- `/v1/do`;
- solution routes;
- Stripe crediting;
- deletion/closure;
- trials;
- admin adjustments.

## Delete
- route-level wallet updates;
- absolute-balance refund logic.

## Guard
CI grep/static rule forbids direct wallet balance mutation outside WalletService/migration code.

## Exit
All money writes use one authority.

---

# WP3 — Durable wallet reservations

## Objective
Eliminate crash-window money corruption.

## State machine

```text
created
  → reserved
  → executing
  → captured
  ↘ released
```

Persist:
- reservation ID;
- principal;
- amount;
- idempotency key/fingerprint;
- execution reference;
- deadline;
- terminal state.

Add reconciler:
- stale `reserved`;
- stale `executing`;
- orphaned execution;
- duplicate capture/release.

## Exit
A process crash cannot permanently misstate spend.

---

# WP4 — Capability Runner + ExecutionOutcome

## Objective
Make “what happened?” a single business fact.

## Canonical types

`OutputAssessment`
- structurally valid;
- semantically usable;
- contract valid;
- quality flags.

`ExecutionOutcome`
- success/failure;
- failure class;
- billable;
- retryable;
- provider fault vs Strale fault;
- output assessment;
- provenance;
- latency/cost facts.

## Rules
- payment consumes `billable`;
- breaker/quality consumes canonical outcome;
- audit consumes terminal outcome;
- solution orchestrator aggregates outcomes.

## Exit
No route decides success/billability independently.

---

# WP5 — x402 durable payment state

## Objective
Make x402 recoverable and economically canonical.

## State machine

```text
verified
  → claimed
  → execution_usable
  → settlement_requested
  → settled
  → recorded
```

Add:
- durable payment intent;
- atomic payment-hash claim;
- recovery worker;
- canonical transaction creation;
- settlement/record reconciliation.

## Remove
- hybrid x402 `/v1/do` ambiguity.

## Exit
Every successful settlement maps to one canonical recorded execution/payment.

---

# WP6 — Idempotency & replay

## Objective
One request = one business effect.

## Key
Bind:
- principal;
- idempotency key;
- request fingerprint.

Same key:
- same fingerprint → equivalent result;
- different fingerprint → conflict.

Propagate stable IDs through:
- REST;
- MCP;
- A2A;
- solution execution;
- x402.

## Exit
Retries cannot double-charge or change request meaning.

---

# WP7 — Audit finality

## Objective
One linear, final audit chain.

## Changes
- terminal records only;
- canonical chain-head row / serialization;
- fail-closed hash admission;
- x402 recording before/with finalization;
- explicit chain topology verification.

## Exit
No branches, genesis races, or non-final records.

---

# WP8 — Policy convergence

## Objective
One execution eligibility authority.

## Consolidate
- lifecycle;
- active/degraded/probation;
- breaker;
- spend caps;
- schema validation requirement;
- payment rail eligibility;
- catalog visibility.

## Delete
- legacy solution autoactivation;
- route-local eligibility predicates;
- duplicated catalog predicates.

## Exit
Same product/request yields same eligibility decision across protocols.

---

# WP9 — Capability Invocation Facts

## Objective
Replace reconstructed quality meaning with immutable facts.

Record:
- invocation ID;
- product/solution;
- component relationship;
- provider;
- execution outcome;
- failure classification;
- output validity;
- infrastructure/test-harness status;
- timestamps;
- quality eligibility.

Quality floor consumes these facts.

## Exit
Instrumentation cannot blame product quality without canonical evidence.

---

# WP10 — Durable Job Coordinator

## Objective
Remove boot-relative/process-memory scheduling.

Own:
- next run;
- recurrence;
- lease;
- retry;
- deadline;
- recovery;
- last result.

Migrate:
- quality-floor cadence;
- onboarding retry;
- autonomous recurring jobs;
- retention jobs where appropriate.

## Exit
Deploy/restart does not reset business cadence.

---

# WP11 — Account / trial / Stripe lifecycle

## Objective
Make account creation, credits, closure, and erasure ledger-consistent.

## Changes
- transactional user + wallet + trial creation;
- one trial-eligibility authority;
- authoritative Stripe payment/currency/amount checks;
- retry/recovery for paid-but-uncredited;
- ledger adjustment on closure/erasure;
- account enumeration reduction.

## Exit
No orphan wallet/trial/Stripe state.

---

# WP12 — Network/resource safety substrate

## Objective
One safe network boundary.

## Build
- canonical host/IP resolution policy;
- DNS rebinding protection;
- IPv4/private/link-local blocking;
- IPv6 ULA/link-local/private blocking;
- safe TCP/TLS connect;
- response-byte limits;
- decompression/media limits;
- concurrency budgets.

Migrate:
- port check;
- SSL check;
- certificate chain;
- reputation/connectivity tools;
- remote downloads.

## Exit
All network-capable tools consume one substrate.

---

# WP13 — Supply chain

## Precondition
Run `VERIFY-DEP`.

## Changes based on evidence
- triage reachable npm advisories;
- upgrade/pin only where justified;
- GitHub Actions explicit permissions;
- action SHA-pinning policy;
- lockfile/runtime compatibility checks.

## Exit
No untriaged exploitable dependency or CI supply-chain finding.

---

# WP14 — Legal & Data Policy Authority

## Immediate work begins during WP0; full consolidation here.

## Build
`LegalDataPolicyRegistry`

Own:
- retention duration by data class;
- public privacy wording;
- processor/controller role;
- DPA requirement;
- subprocessor evidence;
- transfer mechanism;
- example/publication policy;
- erasure behavior;
- audit retention;
- payer-hash classification.

## Specific fixes
- align Privacy with 90d customer-content clearing;
- resolve Dilisense reseller/DPA status;
- prevent raw output publication;
- fix “failed calls not charged” contractual mismatch;
- reconcile closure refunds;
- correct “user_id severed” claim;
- minimize Referer/client metadata;
- correct Art30/Colorado claims;
- revise sanctions/PEP/adverse-media DPIA classification;
- evidence-driven subprocessor claims;
- narrow Swedish bookkeeping retention claim;
- real ToS/DPA assent.

## Exit
Runtime, legal docs, and product claims agree.

---

# WP15 — CI/runtime hygiene

## Do last.

- replace real sleeps/jitter with fake timers;
- separate deterministic correctness from live canaries;
- reduce repeated full-app bootstraps;
- clean stale console/error ratchets;
- convert syntax-only assurance scripts into meaningful checks or remove;
- reduce frontend grandfathered lint debt;
- right-size Playwright coverage.

## Exit
CI is faster/cleaner without weakening proof.

---

# WP16 — Discovery & Retrieval Authority

This workstream consolidates all Phase 8 findings.

## WP16.0 — Discovery containment

### Fix now
1. Capabilities page:
   - stop whole-query substring filtering;
   - use backend-ranked result set;
   - preserve type on navigation.

2. MCP:
   - fallback must support empty/no-match;
   - do not present weak local substring matches as semantic certainty.

3. Search UI:
   - distinguish “no match” from “search failed.”

## Exit
No known UI path confidently routes to a wrong/nonexistent product.

---

## WP16.1 — Evaluation system

### Turn Phase 8B into a permanent benchmark

Maintain:
- 200-query frozen gold set;
- catalog-presence validation;
- primary target;
- acceptable alternatives;
- strict scope target;
- geography;
- product type;
- unsupported/no-match;
- dangerous false positives.

Add metrics:
- Top-1;
- Recall@3/5/10;
- MRR;
- candidate Recall@10;
- wrong geography;
- wrong granularity;
- failed abstention;
- catalog drift.

### CI model
- cheap deterministic benchmark on PR;
- semantic benchmark scheduled/release-gate;
- no provider calls on every trivial PR unless cached/mockable.

## Exit
Retrieval regressions are measurable.

---

## WP16.2 — Discovery Metadata Registry

Create canonical metadata schema.

For each product:
- slug/type/name;
- human description;
- agent description;
- category;
- geography;
- canonical aliases;
- intent phrases;
- input concepts;
- output concepts;
- workflow granularity;
- negative/scope hints;
- lifecycle/visibility;
- price rails.

Generate projections for:
- website;
- MCP;
- A2A;
- x402;
- OpenAPI;
- llms;
- package metadata where applicable.

### Fix known drift
- `server.json` version authority;
- stale capability/country counts;
- renamed/inactive benchmark products;
- inconsistent categories.

## Exit
No hand-authored duplicate discovery facts.

---

## WP16.3 — Hybrid candidate retrieval

### Target

```text
query
  → normalize
  → exact / slug / alias candidates
  → lexical candidates
  → semantic candidates
  → structured/schema candidates
  → candidate union
```

Do not rerank only the embedding top-10.

Instrument pre-rerank candidates in tests/evals.

## Exit
Candidate Recall@10 ≥99% on supported benchmark.

---

## WP16.4 — Structured constraints + granularity + abstention

### Query understanding
Extract:
- jurisdiction;
- task class;
- atomic capability vs workflow;
- explicit “only/just”;
- “without/no/not” exclusions;
- required evidence/output;
- unsupported intent likelihood.

### Hard constraints where safe
- explicit geography;
- lifecycle/visibility;
- impossible product type;
- unsupported payment rail.

### Reranking
Use structured features plus semantic relevance.

### Abstention
Return no match when:
- candidate scores too low;
- reranker confidence low;
- semantic/lexical disagreement severe;
- unsupported intent detected.

## Exit
- unsupported false positive ≤10%;
- wrong geography near zero;
- strict scope/granularity ≥90%.

---

## WP16.5 — Surface convergence

Migrate:
- Solutions search;
- Capabilities search;
- MCP `strale_search`;
- A2A natural-language routing;
- agent-facing search API.

All consume A13.

Delete:
- frontend independent ranking;
- MCP independent semantic substitute;
- route-local aliases/ranking copies.

## A2A progressive disclosure
Primary Agent Card should emphasize:
- Search/Discover;
- Execute;
- Trust/Quality;
- small set of coarse/flagship skills.

Do not make 400+ skills the default selection context.

Expose full catalog through queryable/extended discovery.

## Exit
Same query intent produces coherent ranking across protocols.

---

## WP16.6 — x402 discovery assurance

Maintain expected x402 resource inventory.

Scheduled checks:
- CDP Bazaar;
- selected downstream indexes;
- expected vs observed;
- metadata version;
- category;
- description;
- price;
- schema presence.

Alert on:
- missing indexed resource;
- stale metadata;
- wrong taxonomy;
- unexpected price/schema.

## Exit
External indexing is measured, not assumed.

---

## WP16.7 — External discovery program

Track selected high-reach surfaces:
- official MCP Registry;
- Glama;
- selected MCP directories;
- A2A directories;
- x402 directories;
- npm/PyPI wrappers;
- web search;
- llms/OpenAPI fetchability.

Monthly benchmark:
- 25 generic web needs;
- 25 MCP searches;
- 25 x402 searches;
- A2A presence;
- metadata freshness;
- correct landing surface;
- invocation readiness.

Focus content on high-value jobs:
- supplier/company verification;
- sanctions/PEP;
- payment validation;
- VAT/IBAN/BIC;
- invoice verification;
- domain/email trust;
- paid-API preflight.

## Exit
Need→Strale is a measured funnel.

---

# 6. Verification gates

## VERIFY-IP
Confirm:
- proxy topology;
- trusted hop;
- actual `X-Forwarded-For` behavior;
- spoofability.

Do not “fix” before evidence.

---

## VERIFY-DEP
Run:
- `npm audit`;
- outdated dependency inventory;
- transitive reachability analysis;
- relevant CVE exploitability.

Output:
- reachable;
- unreachable;
- dev-only;
- false-positive;
- upgrade required.

---

## VERIFY-LEGAL
Confirm:
- Dilisense contractual role;
- DPA status;
- subprocessor terms;
- notification mechanisms;
- actual customer assent evidence.

---

## VERIFY-P3
Runtime/deployment facts:
- process-kill recovery behavior;
- scheduler cadence;
- x402 settlement timing;
- reconciliation outputs;
- production state shape.

---

# 7. Master execution order

Use this sequence unless a newly confirmed P0 changes priority:

```text
M0  Reconcile current main
↓
WP0 Immediate containment
↓
WP1 Proof floor
↓
WP2 Wallet Service
↓
WP3 Durable reservations
↓
WP4 ExecutionOutcome
↓
WP5 x402 durable state
↓
WP7 Audit finality
↓
WP6 Idempotency/replay
↓
WP8 Policy convergence
↓
WP9 Invocation facts
↓
WP11 Account/trial/Stripe lifecycle
↓
WP12 Network/resource substrate
↓
WP10 Durable jobs
↓
WP14 Legal/Data authority
↓
WP16 Discovery & Retrieval Authority
↓
WP13 Supply chain
↓
WP15 Hygiene
```

Parallel evidence gates:
- VERIFY-IP during WP0–WP12 planning;
- VERIFY-DEP before WP13;
- VERIFY-LEGAL from WP0 onward;
- VERIFY-P3 during WP1–WP5.

### Why WP16 is after runtime/legal authorities

Do not couple search refactoring to money/runtime refactoring.

But start **WP16.0 containment and WP16.1 benchmark immediately**.

The deeper hybrid retrieval work can wait until the core execution/payment authority changes stabilize.

---

# 8. Package execution rules for Claude Code / Codex

For every package:

## Before changing code

1. Re-read current main.
2. Map finding(s) to files.
3. State invariants being changed.
4. Identify all current authorities.
5. Identify migrations/deploy implications.
6. Write regression tests that discriminate pre/post behavior.

## During implementation

- one package only;
- no opportunistic unrelated cleanup;
- no mega-refactor;
- no production mutation;
- no real provider/payment calls in deterministic tests;
- use ephemeral Postgres for DB-critical behavior;
- maintain compatibility until migration completes.

## After implementation

Report exactly:

1. files changed;
2. risks/findings addressed;
3. invariants now enforced;
4. tests added and why they discriminate;
5. full test results;
6. migration/deploy impact;
7. old authority removed?;
8. bypass guard added?;
9. residual risks;
10. git status + recommended next package.

**STOP.**

Do not automatically begin the next package.

---

# 9. Refactor deletion policy

Every authority-consolidation package is incomplete until:

1. all consumers use the new authority;
2. old paths are deleted;
3. CI prevents reintroduction.

Examples:

- WalletService introduced but route SQL remains → **not complete**
- RetrievalAuthority introduced but frontend `.includes(query)` remains → **not complete**
- Legal registry introduced but Privacy page still hardcodes retention → **not complete**
- Durable scheduler introduced but old `setInterval()` still runs → **not complete**

---

# 10. Deployment policy

For every package ask:

1. Does schema change?
2. Is migration reversible?
3. Is existing accumulated state compatible?
4. Is there a backlog that will run when feature is re-enabled?
5. Could deploy restart trigger a job?
6. Does old and new authority coexist temporarily?
7. Is shadow mode needed?
8. What reconciliation query proves correctness?

Money/audit/lifecycle packages should prefer:
- shadow read;
- compare;
- migrate consumer;
- reconcile;
- delete old writer.

---

# 11. Master exit invariants

The remediation program is complete only when all are true.

## Money
- no direct wallet mutation outside authority;
- reservations recover from hard crash;
- Stripe/x402 reconcile exactly;
- no successful paid call can be “free” or unrecorded.

## Execution
- one canonical outcome;
- output validity affects billability;
- all protocols share eligibility.

## Audit
- one linear hash chain;
- terminal-only admission;
- canonical execution/payment/audit linkage.

## Quality
- immutable invocation facts;
- infrastructure failures not blamed on capabilities;
- component calls represented.

## Security
- recovery proof-before-rotation;
- no bearer secrets in email;
- bounded bodies/downloads/media;
- safe raw socket resolution;
- trusted proxy assumptions verified.

## Legal/data
- privacy docs match runtime;
- DPA/processor rules evidence-backed;
- retention and erasure are data-class specific;
- public examples synthetic/curated.

## Jobs
- schedules durable;
- retries real;
- deploy/restart does not reset cadence.

## Discoverability
- one discovery metadata authority;
- one retrieval authority;
- website/MCP/A2A converge;
- clear supported Top-1 ≥90%;
- colloquial Top-1 ≥80%;
- candidate Recall@10 ≥99%;
- unsupported false-positive ≤10%;
- wrong explicit geography near zero;
- strict scope correctness ≥90%;
- A2A no longer relies on default 400+ direct-skill selection;
- x402 index completeness monitored.

## CI
- DB-critical behavior gated with ephemeral Postgres;
- mutation/discrimination tests exist for critical invariants;
- live canaries separated from deterministic correctness;
- no hollow assurance scripts.

---

# 12. What not to do

Do **not**:

- rewrite the application framework;
- build a giant god service;
- merge lifecycle/breaker/quality into one undifferentiated state;
- replace specialist safety mechanisms that already work;
- make semantic search the sole retrieval authority;
- point every surface to current `/v1/suggest` before WP16.3/16.4;
- add more manual search aliases as the primary search strategy;
- treat MCP/A2A/x402 listing presence as proof of discoverability;
- spend time on lint/style cleanup before P0/P1 work;
- accept tests that merely reproduce production logic in test helpers;
- leave old authorities “temporarily” after migration without a deletion gate.

---

# 13. First recommended execution

When coding capacity returns:

> **Run M0, then WP0 only. Stop.**

After review:

> **Run WP1 only. Stop.**

Then proceed package-by-package in the master order.

For discovery work in parallel, only:
- WP16.0 containment;
- WP16.1 benchmark maintenance.

Do not begin the deeper retrieval redesign until its package is explicitly started.

---

# 14. Final architecture thesis

The remediation program is not primarily about reducing lines of code.

It is about reducing the number of places that can independently decide the same fact.

The desired Strale architecture is:

> **specialist mechanisms underneath, canonical authorities above them, thin protocol/UI consumers at the edges, and tests that prove those authority boundaries cannot be bypassed.**

That principle should govern every remediation decision in this plan.


---

# 17. ADDITIONAL PHASE 8 EVIDENCE — REQUIRED CONTEXT

The remediation plan above already includes WP16, but these empirical facts must remain explicit because they determine architecture.

## Phase 8B live benchmark

200 queries:
- 190 supported;
- 10 intentionally unsupported.

Live typeahead:
- Top-1 acceptable: 28.9%
- Recall@3: 47.4%
- Recall@5: 54.7%
- Recall@10: 62.6%

Live semantic `/v1/suggest`:
- Top-1 acceptable: 42.6%
- Recall@3: 53.7%
- Recall@5: 57.4%
- public response observed relevant target in only ~58.4% by returned list depth;
- clear-supported Top-1: 56.7%;
- colloquial/outcome Top-1: 25%;
- ambiguous/multi-step Top-1: 20%;
- solution-vs-capability acceptable Top-1: 60%.

Critical correction:
- all 10 unsupported queries received a semantic recommendation;
- generated benchmark summary incorrectly reported 0% false positive because the PowerShell scorer threw on null gold sets after successful API responses;
- actual unsupported false-positive recommendation rate was 100% in this benchmark.

Examples:
- Rome itinerary → wallet-age-check
- restaurant booking → sql-generate
- reminder → invoice-verify-se
- logo generation → api-quality-check
- Apple shares → web3-pre-trade
- skin rash diagnosis → image-to-text
- groceries → phone-type-detect

Other live failures:
- explicit country often returned wrong jurisdiction;
- broad solutions over-selected over exact capabilities;
- “only/just/no/without” scope handling weak;
- dense live catalog degraded quality substantially vs reduced static slice.

Do not simply route all surfaces to current `/v1/suggest`.

Target:
- hybrid candidate union;
- structured constraints;
- explicit granularity;
- calibrated abstention;
- one retrieval authority.

## Phase 8C external discoverability

Confirmed strengths:
- official MCP Registry presence;
- npm MCP package;
- Glama / third-party MCP directories;
- public A2A Agent Card indexed;
- individual x402 resources indexed by multiple downstream directories.

Key findings:
- cold Need→Strale discovery weak;
- official MCP metadata version drift exists;
- root `server.json` was 0.2.3 while package was 0.2.6 at audited SHA;
- public A2A aggregator observed roughly 406 declared skills;
- default direct selection among 400+ skills is likely hostile to reliable model selection;
- x402 resources are distributed but index completeness cannot be inferred from local correctness;
- downstream taxonomy drift exists;
- package/framework copy can go stale;
- external discovery metadata has too many authorities;
- no systematic external-index coverage/observability loop.

Target:
- Discovery Metadata Registry;
- A2A progressive disclosure;
- registry/package version synchronization;
- x402 expected-vs-indexed census;
- external discovery benchmark.

---

# 18. FIRST ACTION

Start now with:

1. INITIAL FABLE RE-AUDIT
2. M0 reconciliation
3. WP0

If no human-escalation condition is triggered, continue autonomously through the master package order.

Do not stop after WP0 merely because earlier drafts of the plan suggested human review after each package. This final orchestrator supersedes that workflow.

Human involvement should be exceptional, not routine.

---

# 19. FINAL SUCCESS CONDITION

The program is complete only when:

- all accepted packages are recorded in the ledger;
- all master exit invariants hold;
- all required Codex reviews pass;
- all mandatory Fable acceptance reviews pass;
- old authorities are deleted;
- bypass guards exist;
- migrations/reconciliation are complete;
- unresolved verification gates are either closed or explicitly documented;
- no critical/high finding remains silently open;
- final full-suite tests pass;
- repository is clean;
- final architecture review concludes that no material duplicate authority remains in the audited domains.

At completion, produce:

`docs/remediation/FINAL-REMEDIATION-REPORT.md`

with:
- before/after architecture;
- findings closed;
- findings deferred and why;
- tests/verification;
- migrations;
- remaining risks;
- external follow-ups;
- current production-readiness assessment.

