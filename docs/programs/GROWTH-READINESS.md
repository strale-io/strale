# Growth readiness: the single list

Petter approved this triage and roadmap on 2026-11-11 ("go with your recommendations",
strale-io/strale#1011). The proposal it came from, with its reasoning, is
`handoff/_general/from-code/2026-11-11-growth-readiness-triage-proposal.md`.

This page is the list of what stands between Strale and a growth push. It points at the
program registers and the decision queue; it does not replace them. A track's state lives in
its `tracks.yaml`, a decision's in `docs/company/DECISION-QUEUE.md`. The master's plan,
`docs/plan/PLAN.md`, carries the same work at item level (its ids A-1, B-1 and so on are its
own, not the ones below). No revenue figures here: the repository is public.

## The bar for new items

A new issue enters list A only if it charges wrongly, gives a wrong compliance answer, leaks
data or takes the service down. Everything else goes to list B (fix along the way) or list C
(park). Hardening continues, but it does not crowd out revenue, and legal work that can be
fixed along the way does not block.

## A. Must close before a growth push

| # | Item | Where it is tracked | State (2026-11-11) |
|---|---|---|---|
| A1 | Some paid tools can charge for a failed call. Waves 2 and 3 of the swallowed-failure fix, then counting and refunding past charges. Built by Claude (money path). | `docs/programs/promise-audit/tracks.yaml` T1 | Waves 2a and 2b and the 2b tail are merged (#1014, #1015, #1017). Wave 2c is in review (#1018). Wave 2d is next, then wave 3, the perturbation replays and the past-charge count. |
| A2 | Reference answers for sanctions-check and pep-check: listed names must be found. Scoped small. | `docs/programs/promise-audit/tracks.yaml` T2 | Not started. |
| A3 | `apps/web/src/pages/signup.astro` shows no Terms line while the backend stamps `tos_accepted`. One sentence; Petter approves the wording. | `docs/programs/cto-readiness/tracks.yaml` T16, blocker item 2 | Waiting on Petter's wording. |
| A4 | Tools on sale that cannot deliver: the customs-duty repair and the four DQ-41 tools. They wait on the database write key on Petter's PC. | `docs/programs/robustness/tracks.yaml` T4; DQ-41 and DQ-48 in `docs/company/DECISION-QUEUE.md` | Waiting on the database session at the PC. |
| A5 | Distribution clicks: PyPI trusted publishers and four releases, first npm publish of strale-ai-sdk and strale-cli, Zapier, n8n, Smithery, the Coinbase form, the 402 Index claim, the Claude connector. Sessions prepare and smoke-test. | `docs/programs/distribution/tracks.yaml` T2, T4 to T9, T12 | composio-strale 0.1.5 waits on Petter setting up its PyPI trusted publisher. The rest wait on Petter's click session. |

## B. Fix along the way

| Item | Where it is tracked |
|---|---|
| Input validation enforce mode | `docs/programs/platform-hardening/tracks.yaml` T6 |
| External log sink (Better Stack, DEC-20261029-A) | `docs/programs/platform-hardening/tracks.yaml` T8 |
| Dependency remediation (WP13) | `docs/programs/cto-readiness/tracks.yaml` T17 |
| Network and resource safety substrate (WP12) | `docs/programs/cto-readiness/tracks.yaml` T18 |
| Robustness R2 to R7 | `docs/programs/robustness/tracks.yaml` T2 to T7 |
| Evidence, privacy, availability, answer-quality and claims promises | `docs/programs/promise-audit/tracks.yaml` T3 to T7 |
| The Dilisense role and DPA: send one email, do not wait on it | `docs/programs/cto-readiness/tracks.yaml` T16, blocker item 1 |
| Swiss UID, Zefix and ARES terms replies | DQ-40 in `docs/company/DECISION-QUEUE.md` |
| Access2Markets terms contact | DQ-48 in `docs/company/DECISION-QUEUE.md` |

## C. Park

| Item | Where it is tracked |
|---|---|
| M4 atomic authority cutover, M5 to M7 closeout, discovery and retrieval authority | `docs/programs/cto-readiness/tracks.yaml` T7, T8, T9 |
| Human and machine brand kit, channel starter assets, the wordmark redraw | `docs/programs/brand-website/tracks.yaml` T5, T7 |
| Six registry test inputs (DQ-33), two production settings (DQ-27), four small founder items (DQ-14); validity not rechecked | DQ-33, DQ-27, DQ-14 in `docs/company/DECISION-QUEUE.md` |

## Roadmap

| Step | Target | Done when |
|---|---|---|
| 1. Sellable | about 2026-11-22 | A1, A3 and A4 closed; A2 scoped; this list written and the stale register lines corrected |
| 2. Listed | about 2026-11-29 | Petter's one click session for A5 done; a session has smoke-tested each published package |
| 3. Push | December 2026 | Weekly new payers read per channel; channels that produce none are dropped; hardening runs at a capped share of sessions |

The revenue plan (`docs/strategy/2026-11-06-revenue-plan.md`) keeps its own checkpoints; this
list sets the bar and the order and does not replace that plan.
