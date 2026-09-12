---
doc_type: project-roadmap
authority_scope: none
status: active
complete: true
phase: M4
m1_template: false
authority_active: true
verified_at: 2026-09-12
---

# Roadmap

> [!NOTE]
> **ACTIVE PROJECT AUTHORITY (M4).**
> This document is authoritative repo-native project truth on the `m4/cutover` integration branch. `AGENTS.md` and `CLAUDE.md` on `main` remain authoritative until the single M4 cutover merge folds this branch in.

This roadmap orders outcomes, not issues. GitHub issues and work packages remain
execution records; they do not become project truth merely by opening or closing.

## Execution shape

- **Cutover gate:** outcome 1 must finish before repo-native files become active
  authority or Notion is retired.
- **Reconciliation gate:** outcome 2 must finish before #438 can be called
  reconciled; WP10 is already ACCEPTED (see outcome 2). It does not block
  safe work in other lanes.
- **Sequenced product work:** begin WP16.0 containment and WP16.1 benchmarking
  after the current operating-model batch; the non-blocking WP9, WP15, and WP13
  residuals do not gate those two steps. Deeper retrieval changes wait for the
  benchmark and relevant runtime/payment authorities to stabilize.
- **Continuous parallel lanes:** commercial measurement and reversible website
  preservation/review continue alongside the gated work. Founder-blocked tracks
  remain separate and do not stop unrelated work.

## 1. Finish the repo-native operating model

**Outcome:** a clean Codex or Claude session can learn what Strale is, current
state, recent changes, decisions, roadmap, and mandatory protocols from one
small repo-native read path.

Done: the M2 closure audit and its disposition register (T1, T10; zero
blocking exit gaps), the M3 vendor-current-state shadow replacement plus
digest, distribution-registry, session-end-draft, scheduled-mechanism, and
full protocol-coverage batches (T6, done 2026-09-11 with its milestone
review's three conditions settled).

Active now (T7, M4 atomic authority cutover): the batch sequence in
[the cutover inventory](../../archive/sessions/2026-09-11-m4-cutover-inventory.md)
section 7 -- retire the `.claude/` starter-kit files, rewrite CLAUDE.md and
AGENTS.md as peer entrypoints with an entrypoint-parity check, activate the
repo-native end-session and vendor-switch flows, wire the digest's
repo-native readers into production, retarget the weekly vendor-roster drift
off Notion, add the Notion anti-regression check and make report-only checks
blocking, and last the schema/authority-marker flip this document is part
of. Each batch merges into the `m4/cutover` integration branch, never
`main`; the final PR from `m4/cutover` to `main` needs an independent review
and the founder's yes.

Execution source: the
[repo-native operating-model migration plan](../strategy/2026-08-31-repo-native-operating-model-migration.md)
and [the cutover inventory](../../archive/sessions/2026-09-11-m4-cutover-inventory.md).

## 2. Close prepared versus reconciled production state

### #438 routing metadata

<!-- acceptance-blocked: OA-20260830-ROUTING-LATENCY-438 -->

For [issue #438](https://github.com/strale-io/strale/issues/438), independently
review the corrected founder-gated script and its pre-write global digest guard,
obtain the exact authority, execute only through the established ephemeral-write
boundary, and store an independent read-only post-write result. Prepared,
executed, and reconciled remain distinct states. This remains the only open
item in this outcome: [WP10](../remediation/packages/WP10-RECONCILIATION.md)
was ACCEPTED 2026-09-03 (commit `fadc8052`, PR #493) on the stored cadence
query and application-log evidence -- see
[STATE](STATE.md#active-reconciliation-and-residuals) for the acceptance
detail.

## 3. Establish change attribution

Deliver [WP17](../remediation/packages/WP17.yaml) as a narrow ledger for executed capability-state changes: who
changed what, when, and under what authority. Do not turn it into the lifecycle
for actions that have not executed; that belongs to `operator-actions.yaml`.

## 4. Close bounded technical residuals

- Fold [WP9](../remediation/ORCHESTRATOR.md#wp9--capability-invocation-facts)'s non-blocking transaction linkage into the next relevant producer
  touch without rewriting historical facts.
- Make the integration lane create/drop a uniquely named database
  ([WP15](../remediation/ORCHESTRATOR.md#wp15--ciruntime-hygiene)).
- Reconcile [WP13](../remediation/ORCHESTRATOR.md#wp13--supply-chain)'s delivered dependency/publishing sub-work with its still-open
  formal package and VERIFY-DEP scope.

## 5. Build Discovery & Retrieval Authority

[WP16](../remediation/ORCHESTRATOR.md#wp16--discovery--retrieval-authority) is the next major forward-looking product/technical program:

1. WP16.0 — contain the current discovery surface;
2. WP16.1 — freeze an approximately 200-query retrieval benchmark;
3. only then change metadata, candidate retrieval, ranking, constraints,
   abstention, and surface convergence;
4. verify x402 and external machine discovery against the benchmark.

The goal is simple: an agent states a job and reliably finds the right Strale
capability or solution.

## 6. Grow multiple recurring buyer habits

Continue measuring complete commercial windows, meaningful buyers, largest
buyer share, non-top repeat behavior, revenue excluding the largest buyer, and
entry capability for each material new buyer.

Prioritize task-oriented machine discovery, accurate x402 metadata, strong
schemas/contracts, targeted marketplace corrections, and demonstrated demand
gaps. Do not reopen outreach to the transaction-inferred card buyer.

## 7. Reconcile and complete the website

**Direction (founder, 2026-09-02; decision record DEC-20260902-A to be filed
on the founder's confirmation of its text):** the website redesign is built
inside this repository as `apps/web`, making it a monorepo. Preserve
the existing frontend material first (done in T11: tags, release
`preserve-2026-09-02`, tracked candidates), then build the redesign here;
`strale-frontend` is swept and kept until the cutover ships, not extended.

A dedicated program (`docs/programs/brand-website/PROGRAM.md`, status
`art-direction-in-progress`, started 2026-09-05) now carries this work
forward: the founder selected hero treatment B on 2026-09-06, and an
accepted brand kit (atmosphere, identity/typography, controls, patterns,
illustrations) has its own index at `design/brand-kit/README.md`. Design
acceptance for continued work is distinct from production adoption. The
remaining gaps -- product-proof evidence, asset-rights clearance, editorial
and illustration briefs, page-level accessibility/performance checks, and
production token adoption -- are tracked in
`docs/programs/brand-website/system-completion.json`, not restated here.

After that, complete the remaining homepage outcomes—Featured Tools,
Developers/x402, Reliability, Pricing/Access, closing CTA, footer, and a final
full-page cohesion pass—without mistaking branch source for live state.

Design values for both preserved candidates (and the live theme) are tracked
as data in `design/tokens/`, not restated here — see `design/README.md` and
`design/PROVENANCE.md` before any promotion decision.

## Blocked tracks

- **WP14:** VERIFY-LEGAL and founder/legal decisions.
- **Domain migration:** explicit founder decision before irreversible public or
  infrastructure change.

WP12 is no longer blocked: VERIFY-IP resolved 2026-09-02 (see
[STATE](STATE.md#active-reconciliation-and-residuals)), and it moved to
UNBLOCKED_NOT_YET_STARTED -- unstarted implementation work, not a founder or
evidence block.

Blocked items do not stop unrelated repo, commercial, discovery, or website
work.

## Evidence basis

Ordering and qualifications come from the
[2026-09-01 M2 reconciliation](../../archive/sessions/2026-09-01-m2-product-state-reconciliation.md)
and its 37-claim matrix. Update this candidate when an outcome changes
materially; do not turn it into a completed-work diary.
