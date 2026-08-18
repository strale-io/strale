# Codebase Quality Program — 2026-08-16

**Intent:** Make the Strale codebase fit for purpose, evenly guarded, and unbloated.
Triggered by the 2026-08-16 triage: no widespread capability breakage, but uneven
quality gates (money path untested, frontend/SDKs/scripts never typechecked),
a failure taxonomy that punishes correct refusals under an armed quality floor,
and ~⅓ of `apps/api/scripts/` being dead one-off tooling.

**Operating model:** Fable (Opus-class session) orchestrates and verifies.
Implementation is done by cheaper-model subagents (Sonnet) in isolated git
worktrees (Shared-Checkout Rule). Every diff gets cross-provider review via
model-os dispatch (Codex reviews Claude-authored code) before merge. No phase
is "done" until its exit criteria are verified by measurement, not assertion.

**Standing protocols that bind every phase:** Audit-Follow-up Test Coverage
(regression tests must fail-before/pass-after), Deploy Mechanism Verification
(CI/startup changes verified by reading the actual mechanism + post-deploy prod
query), Bulk-Operation Deploy (backlog audit before re-enabling silent bulk
ops), code-review gate (`/go` before session end).

---

## Phase 0 — Stop the self-harm (urgent)

**Goal:** The platform can no longer delist healthy capabilities for correct
behavior, and the one real customer-facing outage cause (scraper rate limiting)
is diagnosed.

| # | Target | Verified by |
|---|--------|-------------|
| T0.1 | Failure classification distinguishes **correct refusals** (policy refusals e.g. Trustpilot ToS, input-validation rejections, ambiguous-match refusals, coverage refusals) from **genuine failures** (upstream 5xx, timeouts, parse bugs). Refusals are excluded from quality-floor success-rate math. | Unit tests: each refusal class + each genuine-failure class asserted; tests fail against pre-fix code. Re-run of the 7-day failure query shows e.g. product-reviews-extract no longer "88% failure". |
| T0.2 | 30-day audit of quality-floor actions: every quarantine/deactivation listed and classified right/wrong. Wrongly delisted capabilities reinstated (platform-acts-alone per DEC-20260812-A). | Written audit table in the PR; DB state after reinstatement. |
| T0.3 | Browserless 429 root cause known: quota exhaustion vs burst vs target-site limits, with a costed recommendation. | Investigation report. Spend/plan decision escalated to Petter (escalation contract — vendor spend is human-decided). |

**Exit criteria:** T0.1 merged + deployed with green tests; T0.2 table produced and reinstatements applied; T0.3 report delivered.

## Phase 1 — Guard the money and the heart

**Goal:** The two most critical untested surfaces — wallet/Stripe and the
`/v1/do` execution path — have real regression tests.

| # | Target | Verified by |
|---|--------|-------------|
| T1.1 | `routes/wallet.ts` covered: top-up session creation (Stripe mocked), balance read, transaction list, error paths. | New test file(s) green in `npm test`; deliberate mutation of wallet code makes them fail. |
| T1.2 | `routes/do.ts` core paths covered: happy path, no-match, insufficient balance, idempotency replay, dry_run, structured error shape (both documented response shapes). | Same standard: green, and mutation-tested by spot check. |
| T1.3 | Any real bug found while writing tests is fixed in its own commit with fail-before/pass-after evidence. | Commit-by-commit review. |

**Exit criteria:** suite green; wallet.ts and do.ts no longer test-free; Codex review passed.

## Phase 2 — Close the gates

**Goal:** Nothing that can break ships without an inspector at the door.

| # | Target | Verified by |
|---|--------|-------------|
| T2.1 | **CLOSED 2026-08-18.** `npm run typecheck` (and CI) covers: `apps/api/src`, `apps/api/scripts`, `apps/api/test`, and all published TS packages (`sdk-typescript`, `mcp-server`, `langchain`, `semantic-kernel-strale`) — landed 2026-08-17, see `ci.yml`'s `npm run typecheck` step. The "including the dashboard" half (strale-frontend, a separate private repo hosting the dashboard) landed 2026-08-18 via `.github/workflows/frontend-typecheck.yml` (blocking PR gate, scoped to `apps/api/src/routes/**` + `apps/api/src/lib/platform-facts.ts`) plus a weekly backup step in `weekly-drift.yml`. **Investigated before building, per the target's own instruction:** strale-frontend's own CI (`ci.yml`) runs `npm run test` → `npm run build` → `npm run lint:ratchet`, all green on every recent run — but none of the three actually type-checks. `npm run build` transpiles via `@vitejs/plugin-react-swc` (SWC strips types, doesn't check them); `vitest run` has no `--typecheck` flag configured; `lint:ratchet` runs typescript-eslint's non-type-aware `recommended` config (no `parserOptions.project`). No `typecheck` script exists in strale-frontend's `package.json`, and Cloudflare Pages runs the same non-typechecking `npm run build`. Proven empirically, not just read off configs: a deliberately injected `const x: number = "a string"` made `npx tsc -b --force` fail (exit 2) while `npx vite build` succeeded cleanly (exit 0) on the same tree — a real type error can reach production today via nothing checking it. This was a genuine gap, not one already covered elsewhere: the cross-repo `AuditRecord` shape-contract gate (`check-shape-contracts.mjs`) only textually diffs one named interface, it compiles nothing. So this target was built, not descoped. | CI run on the PR shows the wider scope executing and green. Frontend half: `frontend-typecheck.yml` run on its own introducing PR (DEC-20260504-C — link in the PR body) shows `tsc -b` actually executing against a real strale-frontend checkout. |
| T2.2 | Zero orphaned guard scripts: each of the 11 unwired `check-*` scripts is either wired into CI/package.json or moved to `scripts/archive/` with a one-line reason. | Grep proves no `check-*` script exists that is referenced by nothing. |
| T2.3 | Warn-only and weekly-only gates re-tiered deliberately: tier-coverage promoted to blocking or its Phase-2 deferral documented; cross-repo shape contract (`AuditRecord`) checked on PRs that touch `routes/audit.ts`, not only Mondays. | CI config diff + a deliberately-broken test PR demonstrating the block. |
| T2.4 | CI changes obey Deploy Mechanism Verification: each new gate proven to actually execute (workflow run link), not assumed. | Links in PR body. |

**Exit criteria:** a type error, a broken shape, or an unwired guard can no longer reach `main` silently.

## Phase 3 — Debloat

**Goal:** The repo matches its own documented structure; dead weight is archived.

| # | Target | Verified by |
|---|--------|-------------|
| T3.1 | The ~60 dead one-off scripts (`diag-*`, `fix-*`, `backfill-*`, date-stamped, etc.) moved to `apps/api/scripts/archive/` after grepping for references. Top-level scripts dir contains only live tooling. | Reference-grep output in PR; CI green after moves. |
| T3.2 | `audit/`, `audit-output/`, `audit-reports/` contents routed to `archive/sessions/` per the Report Filing Convention; repo root matches the documented structure list. | Directory listing diff. |
| T3.3 | Loose handoff notes committed; `AGENTS.md` / `.claude/model-os/` / `.agents/` resolved as tracked-or-gitignored (Petter's call). | git status clean of stray categories. |
| T3.4 | `test/` vs `tests/` naming confusion resolved (one canonical location or a README pointer). | Path check. |

**Exit criteria:** `git status` noise gone; nothing valuable deleted (archive, not rm, for anything with doubt); CI green.

## Phase 4 — Capability truth pass

**Goal:** Harness health reflects reality, and the weak tail is root-caused.

| # | Target | Verified by |
|---|--------|-------------|
| T4.1 | The uniform ~83–84% cluster (name-parse, npm-package-info, iso-country-lookup, etc. — identical rates, ~500 runs) root-caused as a shared harness issue or disproven; fixed at the shared cause. | Pass rates for the cluster >95% over the following 7 days of runs. |
| T4.2 | Weak registries (danish 38%, page-exists 38%, french 50%, polish 57%, us-company-data 60%, uk-gazette 59%, us-court-search 66%…) each root-caused: fixed, or quarantined with a written reason. | Per-capability disposition table. |
| T4.3 | ≤5 capabilities under 90% harness pass rate (7-day window), refusal-classification corrections from Phase 0 already applied. | Re-run of the harness health query. |

**Exit criteria:** the harness dashboard is trustworthy enough that "a large chunk is broken" can be answered with one query, confidently.

---

## Iteration loop (every phase)

1. Sonnet implementer in an isolated worktree (npm install inside it; removed via `git worktree remove`).
2. Fable verifies against the phase's targets: runs the tests, runs the measurement queries, checks fail-before/pass-after.
3. Codex external review via model-os dispatch. Findings fixed and re-verified.
4. PR opened (draft PRs are platform-acts-alone), merged only when green + reviewed.
5. Post-deploy: prod queried for the expected effect (not just clean logs).
6. Loop until exit criteria measured true; then next phase.

**Sequencing:** 0 → 1 → 2 → 3 → 4, with 1‖2 parallelizable in separate worktrees if review bandwidth allows. Phase 3 deliberately after 2 (moving scripts is safer once typecheck covers them).

**Petter-owned decisions surfaced by this program:** Browserless spend/plan (T0.3); tracked-vs-ignored for model-os/AGENTS.md (T3.3); any deactivation of revenue-earning capabilities (always, per DEC-20260812-A).
