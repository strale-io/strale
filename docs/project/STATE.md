---
doc_type: project-state
authority_scope: none
status: active
complete: true
phase: M4
m1_template: false
authority_active: true
verified_at: 2026-09-12
backend_reviewed_ref: 596e9c7f6dbe474f89d31e035bd47dd81673cb0b
production_observed_ref: 596e9c7f6dbe
production_observed_at: 2026-08-31T23:31:38.346Z
production_status: ok
frontend_main_ref: 4be8d251b05e0abf6e23a195913c188ae318056e
frontend_redesign_ref: 998964716c8601be67d4e71a508a803160434517
state_evidence_ref: archive/sessions/2026-09-01-m2-canonical-state-production-snapshot.json
---

# Current State

> [!NOTE]
> **ACTIVE PROJECT AUTHORITY (M4).**
> This document is authoritative repo-native project truth on the `m4/cutover` integration branch. `AGENTS.md` and `CLAUDE.md` on `main` remain authoritative until the single M4 cutover merge folds this branch in.

## Executive state

Strale is live with externally paid production usage. Its public health endpoint
reported `ok` at the verification time below; that narrow probe is not a claim
that every backend behavior is healthy. Many remediation packages have formal
acceptance records: WP10 was ACCEPTED 2026-09-03 (commit `fadc8052`, PR #493;
`docs/remediation/CURRENT-STATE.md:13-31`), and WP13 remains open as a whole.
Exact package records—not this summary—govern acceptance. The project
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

Quiet Material is the retained marketing direction, now carried forward by a
dedicated program outside `cto-readiness`: `docs/programs/brand-website/PROGRAM.md`
(status `art-direction-in-progress`, started 2026-09-05). The founder selected
hero treatment B on 2026-09-06, and an accepted brand kit (atmosphere,
identity/typography, controls, patterns, illustrations) has its own index and
per-companion registries at `design/brand-kit/README.md`. Design acceptance
for continued work is distinct from production adoption: `design/tokens/active.json`
still controls what production runs, and promotion is a decision record plus
a file swap, not an edit in place. Remaining website-critical gaps are
tracked in `docs/programs/brand-website/system-completion.json`.

`docs/company/DESIGN-SYSTEM.md` governs internal operational reports and is not
the marketing website design system.

## Active reconciliation and residuals

- **Repo operating model:** M0 preservation, M1 foundation, and the M2
  evidence audit and exit-gap closure are complete (T1 and T10 done; zero
  blocking exit gaps in `docs/project/m2-closure-register.yaml`). M3
  repo-native workflows are complete (T6 done 2026-09-11; milestone review
  MET WITH CONDITIONS, all three named conditions settled,
  `archive/sessions/2026-09-11-m3-milestone-review.md`). M4 atomic authority
  cutover is now the active track (T7); see "Recent material changes" below
  for the batches merged so far. The operator-action and pending-founder
  views remain inactive candidates; no root entrypoint or Notion cutover has
  occurred, and `main` stays on the prior authority until the founder's
  single cutover merge.
- **#438 routing latency:** the script is prepared, but production still records
  `company-news = NULL` and `page-speed-test = 8000`; desired values are 28734
  and 20000. The corrected script requires an exact founder grant and captures
  its expected all-row digest before writing. It still needs independent review,
  explicit authority, controlled execution, and a new read-only query before
  reconciliation can close.
  The candidate lifecycle record is
  [`operator-actions.yaml`](../operations/operator-actions.yaml); it does not grant execution
  authority.
- **WP10:** ACCEPTED 2026-09-03 (commit `fadc8052`, PR #493). The seven-day
  cadence gate (due 2026-08-30) was measured three days late: quality-floor
  and capability-promotion each ran ~7 times in 7 days with gaps averaging
  24.02-24.03h, and weekly-sweep's `next_run_at` held exactly 7 days apart
  across 47 merges to `main` since 2026-08-30. One item stays recorded but
  unverified rather than acted on: crash-recovery/watchdog-expiry events go
  to Better Stack, not a queryable DB table, so the observed
  `consecutive_failures=0` is a same-instant proxy, not a full history.
  Detail: `docs/remediation/CURRENT-STATE.md:13-31`.
- **VERIFY-IP / WP12:** VERIFY-IP RESOLVED 2026-09-02 (high confidence,
  empirical probe): exactly one Railway proxy hop sits in front of
  `api.strale.io`, no CDN, and client-supplied X-Forwarded-For / X-Real-IP
  values never reach the app because Railway's edge overwrites them — the
  leftmost XFF entry the code already reads is the true client IP. WP12
  moved BLOCKED -> UNBLOCKED_NOT_YET_STARTED: CIDR/IPv6 gaps, raw-socket
  DNS-rebinding TOCTOU, and byte/pixel caps remain real, unbuilt,
  VERIFY-IP-independent work needing its own session. Detail:
  `docs/remediation/CURRENT-STATE.md:50-75`,
  `docs/remediation/PACKAGE-GRAPH.yaml:176-197`.
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
- These PRODUCT/STATE/ROADMAP files were authored as review candidates on
  2026-09-01; they are activated as project authority on the `m4/cutover`
  integration branch by the M4 batch this document is part of (see below),
  but no root entrypoint, authority, or Notion workflow has been cut over on
  `main`.
- Subsequent reviewed M2 batches added the protected decision/collision graph
  and migrated sourcing doctrine, deploy/enforcement protocols, capability
  onboarding, source enumeration, vendor-evaluation methodology, and the April
  vendor-stack chain. Those records remain inactive candidates; their
  historical status must not be confused with current runtime vendor state.
- The vendor-stack closeout identified an M3 need: a shadow, refreshable
  separation of runtime vendor facts, operator-only account readiness, and
  historical Decisions/research. That work ran as T6 (M3 repo-native
  workflows), starting with batch 1 (inventory) and batch 2 (the repo-owned
  vendor-state model, recorded at
  `docs/strategy/2026-09-10-m3-vendor-state-model.md`); the M2 exit gate it
  was queued behind is closed.
- T4 remediation-program closure (2026-09-02, commit `fadc8052`, PR #493)
  is what corrected the WP10 and VERIFY-IP/WP12 entries above; see
  "Active reconciliation and residuals" for the current per-package state
  and `docs/remediation/CURRENT-STATE.md:1-146` for the full record.
- T6 (M3 repo-native workflows) is done as of 2026-09-11: seven change-item
  batches (vendor state, digest priority readers, distribution registry,
  session-end draft, scheduled-mechanism reachability, and full protocol
  extraction/coverage) landed in shadow or inactive form. The milestone
  review returned **M3 EXIT MET WITH CONDITIONS**
  (`archive/sessions/2026-09-11-m3-milestone-review.md`); all three named
  conditions are now settled: the digest's action-required list shows only
  founder decisions from `docs/company/DECISION-QUEUE.md`'s `your_call`
  entries (DQ-32), the Session Start mode declaration and review-before-close
  step stay outside the protocol-coverage manifest by recorded reason, and
  the production digest reads repository data from files copied into the API
  image after cutover, with a build-time presence check.
- T7 (M4 atomic authority cutover) is now the active track. Batches merged
  into the `m4/cutover` integration branch so far: batch 1 retiring the
  `.claude/` starter-kit files without losing a live rule (PR #665), a fix
  scoping the M2 closing review to its own reviewed record set (PR #670), a
  docs batch recording which CLAUDE.md active decisions remain in force
  (PR #671), a fix narrowing the pre-commit inventory gate to stale
  generated context (PR #672), and this batch (b1d) activating PRODUCT.md,
  STATE.md, ROADMAP.md, DECISIONS.md, PROTOCOL-ROUTER.md, and START-HERE.md.
  `main` and Notion remain authoritative until the founder's single cutover
  merge.
- The review route changed twice since the 2026-09-01 record above: the
  2026-09-07 founder policy removed the mandatory cross-provider review
  requirement, and DEC-20260910-A (2026-09-10) waived all 36 rows of
  `docs/programs/codex-review-backlog.yaml` that had passed their
  `policy.review_by` date under the superseded policy. See "Review route"
  below for the current route.

The [Operating Charter](../company/CHARTER.md) remains the authority for the
division of decisions. Codex/Claude decide technical execution and ordinary
operator actions; founder approval remains required for the Charter's legal,
outward-facing, new-capability, and other reserved decisions. The future pending
view must separate those founder decisions from executable operator actions.

## Blocked

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

Historical record: Claude Opus and Sonnet returned no verdict on the M2
evidence audit; separate high-effort Codex reviews found and closed its
blockers; on 2026-09-01 the founder ended further Claude check-ins for
Codex-authored work.

Current route: the 2026-09-07 founder policy removed the mandatory
cross-provider review requirement. A required independent review may use the
same provider in a separate review context; a different provider is
optional. Work is not blocked solely because another provider is
unavailable, exhausted, or has not reviewed it. The independent-review
requirement itself is not removed, nor are required tests or authorization
requirements for sending, publishing, deploying, spending, or destructive
actions (`CLAUDE.md` Review routing section). DEC-20260910-A (2026-09-10)
closed all 36 pending rows of `docs/programs/codex-review-backlog.yaml` as
`waived`, `waived_by: petter`; no new batches are added to that register,
and `npm run codex:check` still enforces its waived history as immutable.
Before the M4 cutover merge itself, review the then-current exact commit
with an independent review in a separate context (same provider is
sufficient) and resolve every material finding; the cutover PR states which
review ran.

## Evidence basis

Use the [M2 reconciliation](../../archive/sessions/2026-09-01-m2-product-state-reconciliation.md)
for the claim-level audit, the companion matrix for dispositions, and the two
dated JSON files there for exact WP10 and routing-latency production queries.
The [remediation current state](../remediation/CURRENT-STATE.md),
[package graph](../remediation/PACKAGE-GRAPH.yaml), and per-package records remain
the exact acceptance authorities until migrated.
