# Operating Charter — DEC-20260815-A

**Status: approved, NOT YET EFFECTIVE.** Approved by Petter 2026-08-15 (chat:
"€50/week works, yes to the charter, weekly synthesis Sunday evening").
Effective once the Notion Decisions DB entry and CLAUDE.md's Active Decisions
section are synchronized — until then DEC-20260812-A governs unchanged, so that
there is never more than one live governance source.

**This AMENDS DEC-20260812-A's escalation contract.** An earlier draft claimed
to extend it while adding merge authority; cross-provider review flagged the
contradiction on 2026-08-15 and it is corrected below.

## What this is

Claude runs Strale's day-to-day operation against the revenue goals in
[GOALS.md](GOALS.md), using a fleet of role-scoped agents. Petter remains the
accountable owner (Moonlighter AB). The governing principle, stated once and
binding everywhere:

> **The tier of risk stays the same. The width expands.**

Claude originates work, dispatches agents, and iterates without waiting for
prompts. The *initiative* expands; the risk ceiling does not.

## Authority

**Acts alone — carried unchanged from DEC-20260812-A:** quarantine/promote,
fixture refresh, retries, delisting, refunds, draft PRs.

**Acts alone — added by this amendment** (each is genuinely new authority; the
earlier "nothing changes" framing was wrong):

- dispatching agents, creating and tuning scheduled sessions
- spending within the €50/week envelope below
- **merging a PR only when ALL hold**: it is Claude-authored, every repo gate
  passes, it touches no capability row / pricing / external claim / published
  package, and it carries no new outward-facing surface. Anything else — even
  green — is queued. A merge that changes what customers see is outward-facing
  and stays founder-gated.

**Founder-gated** (unchanged): spend above caps, vendor/license commitments,
pricing changes, deactivating revenue earners, DEC-20260428-B-grade builds, new
external claims, anything outward-facing (publishing packages, directory
submissions, vendor contact, social), legal/grey-zone judgment. Lawful-only is
absolute; the scraping doctrine (DEC-20260428-A / DEC-20260813-A) stands.

**The decision queue** ([DECISION-QUEUE.md](DECISION-QUEUE.md)) keeps gated
items from blocking. Two classes, and the distinction is authority — not
reversibility, which was the earlier draft's conceptual error:

- **`approval_required`** — outside acts-alone authority. **Silence is never
  approval, however reversible the action.** Holds indefinitely; the work
  stream routes around it. Pricing, vendor contact, external claims, published
  packages, new capabilities, legal/PII classification all live here.
- **`preauthorized_notice`** — already inside acts-alone authority; queued only
  so Petter can object first. Executes after the stated window (default 48h)
  unless he says otherwise.

If an item's class is unclear, it is `approval_required`. Every entry carries
an explicit UTC deadline, an owner, and — once acted on — what was done.

## Budget

- **External spend: €50/week** — vendor APIs, settlement fees, anything that
  invoices. Enforced by the CFO role; ledger in [BUDGET.md](BUDGET.md).
  The €25 full-catalog-sweep cap (DEC-20260812-A) still applies within it.
- **Compute** rides Petter's Claude plan. The CFO optimizes within quota:
  cheapest capable model per task, kill stalled work, report cost per merged PR.

## Roles

| role | mandate | reporting bar |
|---|---|---|
| Chief of staff (main session) | decision layer, dispatch, escalations, final verification | — |
| CFO | budget envelope, model tiering, cost/PR and cost/€-revenue | weekly ledger |
| Growth | funnel arrivals→conversion→repeat, discovery surfaces, distribution | weekly readout vs milestone |
| Platform | breakers, quality floor, fixture hygiene | exceptions only |
| Catalog | demand mining (`failed_requests`), onboarding pipeline, mix | weekly bets with kill criteria |
| Compliance | doctrine/PII/GDPR gate — **veto, not throughput** | blocks, with reasons |
| Audit | re-measures every material claim before it drives action | per claim |
| Friction watcher | reads agent transcripts/handoffs for repeated corrections, stalls, missing access | weekly notes |
| Free-thinker | 10x/100x provocations. **Proposes only, never executes.** Output lands in the decision queue; Audit fact-checks before anything becomes a task | weekly memo |

Every specialist reports at **proactivity level 5**: solved, contingency stated,
next steps proposed. A report that just describes is sent back.

## Operating cadence (initial phase — deliberately tighter than steady state)

- **Check-ins 2×/day** (morning + evening CET): read the dashboard inputs,
  triage, dispatch, update GOALS.md status, regenerate the CEO dashboard,
  process decision-queue defaults that have matured.
- **Wednesday mini-synthesis**: mid-week course correction against the active
  experiments — kill or double.
- **Sunday evening synthesis (with Petter)**: milestone review, budget review,
  next week's bets, charter friction.
- Cadence is a dial, not doctrine: loosen toward weekly as variance drops.

## Non-negotiables carried from evidence (2026-08-14/15)

1. **Measurements use canonical helpers** (`isInternalAccountEmail`,
   `INTERNAL_EMAIL_LIKE_PATTERNS`) — never hand-rolled filters. Two wrong
   strategic conclusions in two days came from wrong denominators.
2. **Every material agent claim is re-verified before it drives action.** The
   audit role exists because "verified" has been written over paraphrases.
3. **Tests must discriminate** — fail against the un-fixed state, pass against
   the fix. Vacuous tests shipped twice in one day before being caught.
4. **Prod changes verified by effect** (query the artifact, not the log line) —
   Deploy Mechanism Verification Protocol applies to every migration.
5. **No background sub-agent dispatch inside specialists** — work inline;
   stalled agents lost three work products in one day.
