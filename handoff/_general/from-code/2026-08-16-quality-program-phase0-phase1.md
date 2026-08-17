# 2026-08-16 — Codebase Quality Program: Phase 0 shipped, Phase 1 in flight

Intent: triage Petter's "is a large chunk of the platform broken?" concern, then stand up and execute the Codebase Quality Program (docs/strategy/2026-08-16-codebase-quality-program.md) — Fable orchestrating, Sonnet implementing, Codex externally validating every diff.

## Answers to the opening question
- **Not broken.** The alarming 206 "failed requests" in /activity were six x402 crawlers probing stale slug lists — 11/11 real customer calls succeeded in the window. Catalogs verified clean.
- Real 7-day failures decomposed into: correct refusals miscounted as failures (biggest bucket — fixed by PR #278 from the parallel morning session, independently re-verified here by revert: 29/75 tests fail without it), Browserless free-plan burst 429s (5 capabilities, one cause), and small upstream flakes.
- Harness: 97.7% pass over 107k runs; 30 caps <90% (uniform ~83% cluster suspected shared-cause — Phase 4 target).

## Shipped (merged + deployed + prod-verified)
- **PR #302 — quality-floor promotion grace.** Floor evidence window clamps to since-last-enforce-promotion; promotion job auto-reverses floor takedowns on recovery (human/doctrine takedowns excluded); repeat-bounce escalates to human; TOCTOU write guard recognizes the arrow-form lifecycle events all five real producers emit (the old prefix match had never matched a real suspend). 3 implementation rounds + 4 Codex reviews (2 blockers, 2 majors found); final verdict approve-no-findings.
- **PR #303 — web-extract shared resilience.** Routed through web-provider (retry/backoff/concurrency) with skipFallback protecting the rendered-DOM contract and skipCache keeping live-fetch provenance honest. Shared-layer wins for all ~47 callers: tier+waitUntil-namespaced cache keys (blocker: cross-tier contamination), 408 transient, minHtmlLength cache revalidation, fixed-string errors (no upstream bytes — two HIGHs killed here), permanent net-errors (net::ERR_*) skip the retry, scoped to 5xx. 4 implementation rounds + 5 Codex reviews.
- **us-company-data reinstated** (T0.2 audit: quarantine was 100% taxonomy-bug-driven; recomputed 100% completion). Audit + dry-run script on branch `fix/t02-quality-floor-reinstatement-audit` (pushed, unmerged — docs+ops-script only).
- **screenshot-url re-listed + x402-enabled** (manual operator promotion per DEC-20260815-A decide-then-tell: root cause fixed 2026-08-05 PR #150, 520/520 verified; the job's clamped green-week needs ~2 more days and both fragile-class + repeat-bounce route to human — this was that human review). Enforce-mode event written so the clamp arms. **Floor tick passed without a bounce** — the 13-minute-re-quarantine bug is dead in prod.
- **CAPABILITY_PROMOTION_ENFORCE=true armed on Railway.** First enforce tick 20:30:09Z: **brazilian-company-data auto-promoted with x402** (199-run green week). Both re-listed slugs verified in the served /x402/catalog.

## Also done this session
- **model-os removed everywhere** (Petter confirmed discarded): hooks + dirs deleted from strale and 11 other project checkouts; wow-core source repo deliberately left intact (Petter's call). Codex validation now runs as direct `codex exec` on worktree diffs — worked well (12+ substantive findings across the day, incl. 4 blockers/HIGHs that Claude rounds missed).
- **CLAUDE.md Shared-Checkout rule 5 added**: never `git stash` in any worktree (refs/stash is repo-wide; a cross-agent pop ate an implementer's edits mid-session — recovered byte-perfect via git fsck + rescue patch).
- Task chips spawned for two side-findings: SSRF URL-scheme gap (gopher://, file:// reach the fetch layer), and a mystery internal empty-input url-to-text "fetch failed" stream (~138/14d, call site unknown).

## In flight at handoff time
- **Phase 1 (T1.1/T1.2): COMPLETE — PR #304 merged 20:55Z.** 20 tests (wallet.ts's first ever + do.ts core paths), 15 documented mutation proofs across 3 Codex review rounds; final verdict approve-no-findings. Production code byte-identical (test-only). The program doc landed in the same PR. Honest uncovered do.ts paths documented in the PR body (async/DEC-22, x402 unauthenticated, free-tier branches, pg-timeout catch, conversion email) — Phase 1 follow-up work.
- Agent worktrees under `.claude/worktrees/` (t02 audit, promotion-grace, web-extract, phase1) left in place with their branches pushed/merged; clean with `git worktree remove` (never rm -rf) when convenient. Branch `fix/t02-quality-floor-reinstatement-audit` remains unmerged (audit doc + ops script only).
- Watch next 7 days: brazilian-company-data's real-traffic completion (its quarantine driver was customer-side ReceitaWS 429s the harness doesn't reproduce — if it re-quarantines on ≥10 new eligible calls, that's the system learning, and repeat-bounce will then hold it for human review).

## Petter's open decisions
1. **Browserless $25/mo Prototyping upgrade** (T0.3: free plan's 2-concurrent ceiling caused all real scraper-side 429s; recommendation stands; confirm current plan in the dashboard first).
2. wow-core repo: keep as archive or delete.
3. (Standing, pre-existing) Openapi.com addendum case 151296 — unblocks AT/NL/PT company-data reactivation.

## Deploy-verification receipts (DEC-20260504-C)
- PR #302: prod /health `7574e55` post-merge; enforce tick events in health_monitor_events.
- PR #303: prod /health `62a40b7` = origin/main HEAD.
- Promotion arming: `railway variables --json` read back true; enforce tick_complete event 20:30:09Z mode=enforce.
- Re-listings: capabilities rows + served /x402/catalog both confirmed.
