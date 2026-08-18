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
| T2.1 | **Backend half CLOSED 2026-08-17** — `npm run typecheck` covers `apps/api/src`, `apps/api/scripts`, `apps/api/test` and all four published TS packages. **Dashboard half NOT closed — root fix built and green, but still an open PR.** Investigation (empirical, not config-reading): strale-frontend's CI runs test → build → lint:ratchet, all green, and *none* type-checks — `vite build` uses SWC (strips types without checking), vitest runs untyped, the ESLint ratchet is not type-aware, Cloudflare Pages runs the same untypechecked build, and no `typecheck` script existed. Injecting `const x: number = "str"` fails `tsc -b` and passes `vite build` on the same tree. Fix is strale-io/strale-frontend#19 (adds `typecheck: tsc -b`, runs it in that repo's CI before Test/Build); its CI is green and the Typecheck step is confirmed executing `tsc -b`. **It is not merged, so the gate is not yet on that repo's default branch — this target closes on merge, not before.** A PR gate in THIS repo was built and then deliberately removed: strale-frontend depends on no backend package, so a backend change cannot break its compilation — gating backend PRs on it would only surface pre-existing frontend errors and blame unrelated PRs. What remains here is one weekly-drift backstop that watches whether the frontend's own gate still exists and still passes. Note it will correctly report `PRIMARY GATE MISSING` until #19 merges. | Frontend: strale-frontend#19 CI run 32128937922, step `Typecheck` → `tsc -b`, conclusion success; fail-before proven by the injected-error probe. Backstop: dispatched run linked in the PR body — required before this row may be marked closed. |
| T2.2 | Zero orphaned guard scripts: each of the 11 unwired `check-*` scripts is either wired into CI/package.json or moved to `scripts/archive/` with a one-line reason. | Grep proves no `check-*` script exists that is referenced by nothing. |
| T2.3 | Warn-only and weekly-only gates re-tiered deliberately: tier-coverage promoted to blocking or its Phase-2 deferral documented; cross-repo shape contract (`AuditRecord`) checked on PRs that touch `routes/audit.ts`, not only Mondays. | CI config diff + a deliberately-broken test PR demonstrating the block. |
| T2.4 | CI changes obey Deploy Mechanism Verification: each new gate proven to actually execute (workflow run link), not assumed. | Links in PR body. |

**Exit criteria:** a type error, a broken shape, or an unwired guard can no longer reach `main` silently.

### T2.4 outcome — post-deploy verification made standard (branch `ops/automate-deploy-verification`)

DEC-20260504-C's "query prod for the expected effect" step had been followed
correctly but by hand every time (e.g. manually confirming migration block
0093's column existed in prod before flipping suites to fixture mode,
2026-08-16/18) — pure discipline, nothing failed if a session skipped it.

**What shipped.** `schema-validator.ts`'s `validateSchema()` — already wired
blocking into `index.ts` right after `runStartupMigrations()`, before the API
starts listening — now derives what to check from `startup-migrations.ts`'s
own SQL (`apps/api/src/lib/migration-artifact-audit.ts`) instead of the
hand-maintained `REQUIRED_COLUMNS` array it used to carry. The old list's
last entry covered migration 0050; `startup-migrations.ts` had shipped 43
more blocks since (up to 0093) with zero startup verification that any of
their columns, tables, or indexes actually existed. Deriving from the SQL
that block authors already have to write — instead of a parallel list they
have to remember to update — closes that gap permanently and structurally,
per the "derived beats curated" rule: a new migration block gets startup
verification for free, no second registration step.

Every boot now performs, automatically, the exact class of check that used
to be a manual `\d table` after watching the deploy log go green — and does
it *before* traffic is served, which is strictly stronger than a post-hoc
check. Read-only verification against real production (`information_schema`
+ `pg_indexes`, SELECT-only) during development confirmed the deriver finds
all 36 artifacts across blocks 0029-0093 and all 36 are present in prod
today.

**Chosen design, and why the alternatives were rejected.**
- Rejected: a new curated "artifacts to verify" registry (would rot exactly
  like `REQUIRED_COLUMNS` did, and like the four stale Browserless
  dependency lists).
- Rejected: a post-deploy CI step polling `/health` then asserting prod
  state (viable, but strictly weaker than blocking startup — it lets a
  broken deploy serve traffic before the check runs, and needs its own new
  CI wiring to prove per T2.4's own standard).
- Rejected: a brand-new invariant-checker check (`jobs/invariant-checker.ts`)
  — that job is Tier-1/Tier-2 alert-and-continue by design, not
  boot-blocking, so it would report the PR-42 class bug rather than prevent
  it from serving traffic.
- Chosen: extend the schema artifact check that already blocks boot
  (`schema-validator.ts`, wired at `index.ts:118-121`), and make its
  artifact list derived instead of curated. Smallest change that closes the
  actual gap: no new wiring to verify, no new failure mode, same
  `StartupFatalError` / operator-alert contract as before.

**Boot-safety hardening (added in review).** This gate aborts startup, which
makes its two failure directions wildly asymmetric: under-deriving is a
smaller safety net, but **over-deriving is a production crash-loop on every
deploy**. Review found three ways the first draft could do the wrong one, all
now fixed and covered by fail-before/pass-after tests:

- **Multi-column `ALTER TABLE`** (`ADD COLUMN a, ADD COLUMN b`) matched only
  the first column — silently, with no error. Worse than the stale list it
  replaced: a stale list is visibly stale, a regex miss is invisible. Now
  parsed in two stages, bounded to the statement so it cannot bleed onto the
  next table.
- **No `DROP`/`RENAME` subtraction.** The first block to remove a column
  would have made boot demand an artifact that is correctly gone — prod down,
  and staying down, until someone edited the parser. No block does this
  today, which is precisely why it would have shipped unnoticed. Dropped and
  renamed artifacts are now subtracted.
- **A collapsed parse reported "all clear."** Zero derived artifacts meant
  zero missing, so a broken parser certified the schema — the hollow-gate
  shape this program already found three times in one week. Deriving nothing
  from a file that plainly contains migration blocks now throws instead.

**Verification (DEC-20260504-C, done properly rather than reasoned about).**
Deploy path confirmed by file: `Dockerfile CMD → dist/index.js → dynamic
import ./lib/schema-validator.js → validateSchema`, running after
`runStartupMigrations()`. The deriver reads its *compiled* sibling at runtime,
so that was tested, not assumed: a real project build to a temp `outDir` puts
`startup-migrations.js` and `migration-artifact-audit.js` side by side in
`dist/lib`, and parsing the compiled `.js` yields **the identical 36-artifact
set** as the `.ts` source. Finally, all 36 were checked read-only against
**production** before merge — all present, so this gate will not block boot on
deploy. That last check is the one that matters: shipping it unverified is
exactly the "code is correct ≠ deploy will behave" failure DEC-20260504-C
exists for.

**Scope boundary.** The other manual practice named in the trigger — polling
`/health` until its commit matches the merge commit — is not automated by
this change; it stayed a documented human/CI step. It answers a different
question (did *this* deploy reach prod) than the one closed here (did the
deploy's *schema effect* land), and folding it in would have widened this
fix past "smallest thing that works."

Tests: `apps/api/src/lib/migration-artifact-audit.test.ts` (parser
correctness, including a fail-before/pass-after regression on a real bug
the parser itself shipped with during development — see the file's
docstring) and `apps/api/src/lib/schema-validator.test.ts` (fail-before
verified against the actual pre-fix file via `git show origin/main`: the
old `REQUIRED_COLUMNS`-based check resolves cleanly even when a real
migration's column, table, or index is simulated absent from prod, because
it never queries for anything past migration 0050).

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
