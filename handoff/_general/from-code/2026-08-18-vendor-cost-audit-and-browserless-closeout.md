# 2026-08-18 — Vendor cost audit, Browserless closed for €0, shape-contract gate finally real

Intent: answer Petter's "can we avoid the $25/mo Browserless upgrade, and what other prepaid credits could run out silently?" — then close every loose end from the Codebase Quality Program. Continues 2026-08-16 (Phases 0–1) and 2026-08-18 Phase-4 close.

## The headline: Browserless needed no money, it needed a bug fix
Browserless usage was ~22,300 calls/30d. **Only ~505 were customers.** 87% was our own harness live-rendering for 12 capabilities classed `cost_class='free_unlimited'` — because `external_cost_cents = 0` means *free to the customer* (registry data is free) and nothing ever told the scheduler each render still burns a real infrastructure unit.

**Shipped (PR #330, applied to prod):** `test_mode='canary'` given real semantics (it was documented but dispatched identically to `live` — a phantom feature); 60 suites converted to fixture replay + 12 live daily canaries (one per capability, always `known_answer` because only that type feeds circuit-breaker evidence); fixture baselines given a 30-day TTL on `fixture_last_refreshed` (an orphaned column that now has a writer) so nothing stays green on stale evidence; failing recaptures **bounded** by a failure cap → quarantine marker that no automated path can clear or bypass.

**Verified in prod after deploy, in this order (safety net first):** migration 0093 column present → dry-run → `--apply` → post-state query. Result: 12 canary / 48 fixture / 28 untouched, 60/60 applied, 0 raced.
**~7,565 → ~408 Browserless calls/30d (94.6% cut).** Customer traffic untouched. Free plan is now comfortable.

## Decision: no Browserless upgrade (Petter, affirmed by data)
€25/mo against ~€190/mo revenue was rightly declined. Post-fix it isn't needed at all. Cloudflare Browser Rendering (free tier, managed → DEC-7 compliant) is the hedge if volume ever grows; Bright Data and similar are **disqualified on doctrine** (proxy-rotation/anti-bot evasion), not price.

## Vendor inventory (the "what else runs out silently" answer)
- **Serper**: receipt found — 50,000 credits bought 2026-05-08 for $62.50, burn ~470/mo. **No top-up needed; credits EXPIRE ~2026-11-08.** Revisit late October, not before. Login = `petter@strale.io` (Paddle receipt).
- **CDP/Coinbase x402**: 2,007 settlements/30d — past the 1,000 free tier, so ~$1/mo overage. Card confirmed by Petter on the **production entity** `28dcd11b-8752-5835-a764-42f94af91614` (not the portal default).
- **sec-api.io / EINsearch**: zero calls ever, no token configured anywhere, **zero emails in the mailbox** — no subscription exists. Nothing to cancel.
- **Dilisense**: only 20 calls/30d — the feared "80/mo test burn vs 100/mo cap" was stale. No urgency. Cheap insurance when convenient: re-add OpenSanctions as a paid fallback (~€1–2/mo at this volume) to end the single-vendor risk on sanctions-check/pep-check.
- **Do NOT self-host sanctions lists** to save money: touching raw OFAC/EU/UN feeds triggers DEC-20260428-B's full engineering bar. The "free" option costs days plus permanent ops.
- **Voyage**: inside the free 200M-token allowance. Do nothing.
- Anomaly logged, unexplained: a 7-day zero-x402-settlement window 2026-07-25→31, evidence points to a traffic lull rather than an outage.

## Also shipped
- **PR #327 — the AuditRecord shape contract is real for the first time.** The weekly checkout of the private `strale-frontend` had 404'd on **every run since the gate was written** (no cross-repo credential; `continue-on-error` swallowed it). Petter created `FRONTEND_READ_PAT`; both paths verified by log (`Syncing repository: strale-io/strale-frontend` → `✓ All shape contracts clean`, `AR=0`). Now blocking on PRs touching `audit.ts` + working weekly.
- **PR #328 / #329 — every "Browserless-dependent" list was wrong.** The health gate inferred dependency from `capability_type` (missed 4 hard-dependent `ai_assisted` caps, over-included 41 fallback-tier ones); the credential registry hand-maintained 52 slugs of which **19 had drifted**, and `latvian-company-data` was falsely skipped *twice* — via browserless and then again via an unwired SDDA entry three lines below. Both now derive from one curated source with a **bidirectional drift test** (comment-stripped, mutation-proven) so list-rot can't recur.

## Loose ends deliberately left
- **Main checkout stays parked on `ops/company-scaffold`** (documented condition). Its uncommitted `CLAUDE.md` diff is exactly the rule-5 stash prohibition, which **is already merged to main via PR #319** — redundant and safe to discard, but left alone rather than `git checkout --`ing over uncommitted work in a shared tree.
- Pre-existing `_tmp_*.ts` scripts and `audit-output/_partial_*` files in the main checkout predate this session (visible in its opening `git status`); not mine to clean.
- 8 agent worktree directories from other sessions left in `.claude/worktrees/` (mine — 13 — removed; main `node_modules` verified intact afterwards).

## Program close-out: T4.3 met, two Phase-2 targets deliberately left open
Final exit measurement (12h window, ≥5 runs, post-fix data): **4 capabilities under 90%** against the ≤5 target — down from 30 at program start. uk-gazette-notice-search (vendor API), cz-unreliable-vat-payer, tech-stack-detect and canadian-company-data at 89%. **T4.3 PASSED.**

Two Phase-2 targets did NOT land and are now tracked chips, not silently dropped:
1. **"Typecheck everything including the dashboard"** — the frontend is a separate repo and this repo's CI still never compiles it. What shipped was the AuditRecord *shape contract* (interface comparison), not a build. Newly unblocked by `FRONTEND_READ_PAT`. The chip explicitly instructs investigating whether strale-frontend's own CI already covers this — the right answer may be "descope deliberately", not "build redundant CI".
2. **"Post-deploy verification standard, not heroic"** — followed rigorously by hand all week (migration 0093 verified in prod before the suite conversion; /health polled to commit match), but nothing fails if a future session skips it. Chip filed to build the smallest mechanism that catches the PR-42 class of failure automatically.

## Open for Petter
Nothing blocking. Optional: delete the dead original `strale-frontend-readonly` fine-grained token now that its replacement works.
Flagged for your call (not actioned): (a) the To-do item "Decouple scheduled_testing_eligible from external_cost_cents" has been In-progress since 2026-05-11 and is the *root cause* today's Browserless work treated symptomatically — close as superseded or keep as the real structural fix; (b) the Browserless stay-on-free-tier posture may warrant a Decisions DB entry (yours to create); (c) Serper credit expiry ~2026-11-08 may deserve a To-do so it surfaces on its own.

## Watch next
- Harness data within ~24h should show Browserless calls collapsing toward ~400/30d and the 12 canaries running daily.
- First fixture TTL expiries land ~2026-09-17 (one live re-validation per suite); failing recaptures should quarantine at the cap rather than retry forever.
- Late October: Serper credit expiry decision.
