---
doc_type: project-state
authority_scope: none
status: candidate
complete: false
phase: M2
m1_template: false
authority_active: false
verified_at: 2026-09-01
backend_reviewed_ref: 596e9c7f6dbe474f89d31e035bd47dd81673cb0b
production_observed_ref: 596e9c7f6dbe
production_observed_at: 2026-08-31T23:31:38.346Z
production_status: ok
frontend_main_ref: 4be8d251b05e0abf6e23a195913c188ae318056e
frontend_redesign_ref: 998964716c8601be67d4e71a508a803160434517
state_evidence_ref: archive/sessions/2026-09-01-m2-canonical-state-production-snapshot.json
---

# Current State

> [!CAUTION]
> **M2 CANDIDATE — NOT ACTIVE PROJECT AUTHORITY.**
> Review this candidate in place. Existing `AGENTS.md`, `CLAUDE.md`, and Notion-backed workflows remain in force until M4 cutover.

## Executive state

Strale is live with externally paid production usage. Its public health endpoint
reported `ok` at the verification time below; that narrow probe is not a claim
that every backend behavior is healthy. Many remediation packages have formal
acceptance records, while WP10 remains under observation and WP13 remains open
as a whole. Exact package records—not this summary—govern acceptance. The project
is now balancing four outcomes: finish the repo-native operating model, close
bounded production/governance residuals, improve discovery, and turn early buyer
diversification into repeat habits.

This candidate distinguishes reviewed code, live production, branch-local
frontend source, and formal acceptance. Those states must not be collapsed.

## Verified refs

| Surface | Verified state |
|---|---|
| Backend reviewed main | `596e9c7f6dbe474f89d31e035bd47dd81673cb0b` |
| Live backend `/health` | `ok`, commit `596e9c7f6dbe` |
| Platform facts | observed `2026-08-31T23:31:38.346Z` |
| Frontend main | `4be8d251b05e0abf6e23a195913c188ae318056e` |
| Frontend redesign preservation | `998964716c8601be67d4e71a508a803160434517` |

Live and reviewed refs are recorded separately even when they happen to match.
A local or merged branch alone never proves deployment.

## Commercial state

The latest honest completed ISO week began 2026-08-24:

| Measure | Value |
|---|---:|
| External revenue | EUR 73.03 |
| Calls | 1,295 |
| Payer identities | 13 |
| Material buyers | 4 |
| Largest-buyer share | 76.0% |
| Returning non-top buyers | 3 |

The prior completed week was EUR 66.31 on 1,000 calls, with five payer
identities, 96.4% largest-buyer share, and no returning non-top buyer. The
improvement is real across comparable complete windows, but Strale remains far
below the revenue goal and above the M1 concentration limit. Thirteen payer
identities must not be reported as thirteen customers: nine spent less than one
euro combined.

The strongest new signal is broader demand. Material buyers entered through
`address-geocode` and `image-to-text`, while the card buyer used
`competitor-compare`. This supports demand-following without retiring the
compliance wedge. The no-outreach boundary for the specific card buyer remains
settled.

## Live platform facts

A dated read-only summary of the `/health` and `/v1/platform/facts` responses
used for this candidate is preserved in the
[production snapshot](../../archive/sessions/2026-09-01-m2-canonical-state-production-snapshot.json).
Capability, solution, free-tier, vendor, region, and retention values are mutable
runtime facts: read the endpoint or the future generated state view rather than
copying their values into authored project truth.

## Website and design

Homepage v2 is **not on frontend main and not live**. The redesign preservation
ref contains source for a no-index preview with Header, Hero, How Strale Works,
and Use Cases. Exact state: source-present, committed, and pushed; unreviewed,
unmerged, not build-verified by the M2 audit, undeployed, and non-live.

Quiet Material is the selected marketing direction. The durable preservation
ref identifies v0.5. The newer local v0.7 material is modified/untracked and has
no stable ref, hash manifest, review, merge, build, or deployment evidence. It
is a candidate to preserve and review, not current versioned authority.

`docs/company/DESIGN-SYSTEM.md` governs internal operational reports and is not
the marketing website design system.

## Active reconciliation and residuals

- **Repo operating model:** M0 preservation and M1 foundation are complete. The
  37-claim M2 evidence audit and PRODUCT/STATE/ROADMAP candidate batch are
  merged. The operator-action and pending-founder views are populated as
  inactive candidates; no entrypoint or Notion cutover has occurred.
- **#438 routing latency:** the script is prepared, but production still records
  `company-news = NULL` and `page-speed-test = 8000`; desired values are 28734
  and 20000. The corrected script requires an exact founder grant and captures
  its expected all-row digest before writing. It still needs independent review,
  explicit authority, controlled execution, and a new read-only query before
  reconciliation can close.
  The candidate lifecycle record is
  [`operator-actions.yaml`](../operations/operator-actions.yaml); it does not grant execution
  authority.
- **WP10:** formally merged and deployed, but still under observation. Stored evidence shows
  daily cadence and a weekly sweep scheduled a week apart, but not every
  historical overlap/recovery/watchdog condition. Acceptance needs a separate
  reviewed transition using the correct application-log source.
- **WP9:** accepted package with a non-blocking historical transaction-linkage
  residual and an evidence-condition observation exit. Do not rewrite history.
- **WP15:** bounded residual: integration CI should create and drop a uniquely
  named database.
- **WP17:** specified, not started; narrow scope is attribution of executed
  capability-state changes—who, when, and under what authority. Prepared action
  lifecycle belongs to the future operator-action registry instead.
- **WP13:** important dependency and publishing sub-work shipped, but the whole
  package is not accepted; VERIFY-DEP remains partial in the formal graph.

## Recent material changes — verified 2026-09-01

- The founder confirmed that the supplied context pack is the complete founder
  input. A separate founder product audit is no longer expected; evidence
  reconciliation and technical decisions belong to Codex and Claude.
- The M2 37-claim reconciliation is merged. It corrected the website/live-state,
  WP10, WP13, WP17, and #438 distinctions reflected above.
- These PRODUCT/STATE/ROADMAP files are now authored review candidates, but no
  root entrypoint, authority, or Notion workflow has been cut over.
- Subsequent reviewed M2 batches added the protected decision/collision graph
  and migrated sourcing doctrine, deploy/enforcement protocols, capability
  onboarding, source enumeration, vendor-evaluation methodology, and the April
  vendor-stack chain. Those records remain inactive candidates; their
  historical status must not be confused with current runtime vendor state.
- The vendor-stack closeout identified an M3 need: a shadow, refreshable
  separation of runtime vendor facts, operator-only account readiness, and
  historical Decisions/research. That work remains queued behind the M2 exit
  gate; it is not the immediate continuation task.

The [Operating Charter](../company/CHARTER.md) remains the authority for the
division of decisions. Codex/Claude decide technical execution and ordinary
operator actions; founder approval remains required for the Charter's legal,
outward-facing, new-capability, and other reserved decisions. The future pending
view must separate those founder decisions from executable operator actions.

## Blocked

- **WP12 / VERIFY-IP:** Railway trusted-hop semantics remain unresolved. Do not
  guess X-Forwarded-For policy.
- **WP14 / VERIFY-LEGAL:** remaining legal text, vendor/DPA, assent, publication
  approval, and legal-policy questions remain founder/legal work.
- **Public domain migration:** both `strale.dev` and `strale.io` are recorded as
  owned, but irreversible brand/infrastructure migration is not decided here.

## Production and package authority

Autonomous/local production DB access is read-only. Operator writes require the
restricted write role and an ephemeral per-command credential; no standing write
secret belongs in repo or `.env`. A prepared script is not execution authority.

npm trusted publishing is established. External package changes still require a
post-publish production-contract smoke on the actual published artifact. This
does not close WP13 as a whole.

## Review route

Claude Opus and Sonnet returned no verdict on the M2 evidence audit. Separate
high-effort Codex reviews found and closed its blockers. On 2026-09-01 the
founder ended further Claude check-ins, so the former Claude backlog is now
historical evidence rather than pending work. Before M4 activation, review the
then-current exact commit with a fresh separate `gpt-5.6-sol`/xhigh Codex task
and resolve every material finding.

## Evidence basis

Use the [M2 reconciliation](../../archive/sessions/2026-09-01-m2-product-state-reconciliation.md)
for the claim-level audit, the companion matrix for dispositions, and the two
dated JSON files there for exact WP10 and routing-latency production queries.
The [remediation current state](../remediation/CURRENT-STATE.md),
[package graph](../remediation/PACKAGE-GRAPH.yaml), and per-package records remain
the exact acceptance authorities until migrated.
