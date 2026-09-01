---
doc_type: project-roadmap
authority_scope: none
status: candidate
complete: false
phase: M2
m1_template: false
authority_active: false
verified_at: 2026-09-01
---

# Roadmap

> [!CAUTION]
> **M2 CANDIDATE — NOT ACTIVE PROJECT AUTHORITY.**
> Review this candidate in place. Existing `AGENTS.md`, `CLAUDE.md`, and Notion-backed workflows remain in force until M4 cutover.

This roadmap orders outcomes, not issues. GitHub issues and work packages remain
execution records; they do not become project truth merely by opening or closing.

## Execution shape

- **Cutover gate:** outcome 1 must finish before repo-native files become active
  authority or Notion is retired.
- **Reconciliation gates:** outcome 2 must finish before #438 or WP10 can be
  called reconciled or accepted. It does not block safe work in other lanes.
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

Next bounded work:

1. review the inactive operator-action and pending-founder candidates on their
   exact commit;
2. migrate formal product/project decisions in contradiction-checked topic
   batches—never convert context-pack `D-*` labels into formal IDs silently;
3. extract protocol routing without weakening existing mandatory gates;
4. prove entrypoint symmetry, replace active Notion consumers, and only then
   perform M4 cutover and retire Notion as an active authority.

The current candidate documents remain `authority_scope: none` until that gate.
Execution source: the
[repo-native operating-model migration plan](../strategy/2026-08-31-repo-native-operating-model-migration.md).

## 2. Close prepared versus reconciled production state

### #438 routing metadata

<!-- acceptance-blocked: OA-20260830-ROUTING-LATENCY-438 -->

For [issue #438](https://github.com/strale-io/strale/issues/438), independently
review the corrected founder-gated script and its pre-write global digest guard,
obtain the exact authority, execute only through the established ephemeral-write
boundary, and store an independent read-only post-write result. Prepared,
executed, and reconciled remain distinct states.

**[WP10](../remediation/packages/WP10-RECONCILIATION.md):** run the formal acceptance review using the stored cadence query plus
the correct application-log evidence for overlap, recovery, and watchdog
conditions. Record ACCEPT, EXTEND, or FAIL; do not infer acceptance from the
expired date.

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

First preserve and review the local v0.7 design-system candidate against the
durable v0.5 checkpoint. Rebase/reconcile Homepage v2 with frontend main, run
build and visual/accessibility verification, then decide what is accepted.

After that, complete the remaining homepage outcomes—Featured Tools,
Developers/x402, Reliability, Pricing/Access, closing CTA, footer, and a final
full-page cohesion pass—without mistaking branch source for live state.

## Blocked tracks

- **WP12:** VERIFY-IP / trusted-hop evidence.
- **WP14:** VERIFY-LEGAL and founder/legal decisions.
- **Domain migration:** explicit founder decision before irreversible public or
  infrastructure change.

Blocked items do not stop unrelated repo, commercial, discovery, or website
work.

## Evidence basis

Ordering and qualifications come from the
[2026-09-01 M2 reconciliation](../../archive/sessions/2026-09-01-m2-product-state-reconciliation.md)
and its 37-claim matrix. Update this candidate when an outcome changes
materially; do not turn it into a completed-work diary.
