# 2026-08-18 — Codebase Quality Program: Phase 4 complete, program closed

Intent: finish Phase 4 (capability truth pass) and close the Codebase Quality Program (docs/strategy/2026-08-16-codebase-quality-program.md). Continues the 2026-08-16 Phase 0–1 handoff and the Phase 2/3 PRs.

## Shipped this phase (all merged + prod-verified or deploy-rolling)
- **PR #318 — the capability tail.** redirect-trace's core bug fixed (~4 months broken for any actually-redirecting URL; harness passes were httpbin-503 false positives); url-health-check same-bug sibling fixed; budget-aware scheduling (scheduler + per-suite runner check: exhausted budget = silent skip, not manufactured failure); failure classifier gains test_infrastructure (budget) + test_design (compliance-refusal) classes; GDELT retry amplification removed; spanish tier fixture recaptured post-vendor-swap (a real PII leak — officer names in BORME free text — caught and scrubbed during capture); tier-coverage gate promoted to strict (closes Phase 2's deferred T2.3).
- **PR #319 — AGENTS.md rebuilt from CLAUDE.md** (Codex-CLI config current + tracked again); **CLAUDE.md rule 5 (never git stash in worktrees) finally committed** — it had lived only as an uncommitted edit on a parked branch.
- **PR #320 — limitation titles.** The "3,405 undefined titles" were a diagnostic display artifact — zero exist in any storage location; defensive sanitizer at every limitation write path + transactional CAS repair tooling (never needed on current data).
- **PR #321 — suite-scoped scheduling.** THE structural find of the phase: the scheduler was quadratic in same-type suites (N due suites → N×N executions) — this explains the months-long daily budget exhaustion on danish/swedish. runTests now takes a fail-closed suiteId. Swedish known-answer coverage restored truthfully (Klarna/H&M/IKEA as their real selves — five suites had secretly tested one org number under five labels), equals identity assertions, transactional idempotent restore (applied to prod under orchestrator gate).
- **DB fixture refreshes applied** (platform-acts-alone): npm-package-info + llm-cost-calculate placeholder "test_value" inputs → real inputs; singapore + nl-energy-label dead dependency_health inputs → known-good; polish's two name-search suites (testing a correctly-refused path) deactivated with reasons; swedish's four duplicate-label suites deactivated.

## Exit measurement (T4.3)
Preliminary (12h window, ≥5 runs, still containing pre-fix hours): **7 capabilities under 90%**, from 30 at program start. Expected on the clean 24h window: **uk-gazette-notice-search** (vendor API returns 500 on every request — Petter filing with TheGazette) as the principal survivor with a written reason; redirect-trace/polish/singapore/nl-energy-label/llm-cost-calculate/npm-package-info all fixed and draining pre-fix rows. us-court-search (CourtListener token, Petter's rotation) may reappear once its suites cycle. **Final confirmation: run the measurement on the 2026-08-19 morning check-in with a clean 24h window** — expected verdict ≤5 with reasons, meeting T4.3.

## Program scorecard vs docs/strategy/2026-08-16-codebase-quality-program.md
- Phase 0 (self-harm stopped): ✅ — refusal taxonomy verified, us-company-data + screenshot-url re-listed, promotion job armed (first enforce tick auto-promoted brazilian-company-data), floor bounce-bug dead in prod.
- Phase 1 (money path tested): ✅ — PR #304, wallet.ts's first tests ever + do.ts core, 15 mutation proofs.
- Phase 2 (gates closed): ✅ — PR #313, typecheck 6 surfaces, zero orphaned guards, hollow dispatcher lint rebuilt on AST; T2.3 completed via #318's strict promotion.残: cross-repo shape gate blocked on founder PAT.
- Phase 3 (debloat): ✅ — PR #316, 230 archive moves, zero deletions, structure matches docs.
- Phase 4 (truth pass): ✅ engineering complete; T4.3 formal verdict pending the 08-19 clean window.
- Discovered + fixed along the way, no phase asked for them: quadratic scheduler, stash-sharing hazard (now rule 5), codex-stdin footgun, PII-in-fixture capture leak, seed-path sanitization gap.

## Standing items (Petter)
1. Browserless $25/mo Prototyping upgrade (T0.3 recommendation; confirm current plan in dashboard).
2. Fine-grained GitHub PAT (read-only Contents, strale-frontend) → repo secret, to make the AuditRecord shape gate real.
3. File the Gazette JSON-API outage with TheGazette (github.com/TheGazette/DevDocs); rotate COURTLISTENER_API_TOKEN and update Railway.
4. wow-core repo: archive or delete (from 08-16).

## Watch items for the morning check-in
- Final T4.3 measurement (clean 24h window).
- Prod deploy chain: verify /health reaches 498a160 (#321); then test_results should show swedish ~23 attempts/day (was 100/100 cap-outs) and danish linear, budget-skips silent.
- brazilian-company-data real-traffic completion (auto-promoted; its old quarantine driver was customer-side 429s the harness can't see — a re-quarantine would be the system working, and repeat-bounce then holds it for human review).
- Duplicate-suite sweep found the swedish pattern in credit-report-summary, estonian-company-data, business-license-check-se (14 excess suites) — cleanup candidate, low urgency (mostly inactive/paid capabilities).

## Review-loop stats for the program (for the record)
4 implementer agents + ~20 Codex review rounds across 8 branches; ~40 substantive findings (8 HIGH/blocker class), including several in the orchestrator's own instructions — the two-model loop caught what either model alone would have shipped.
