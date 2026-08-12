# CLAUDE.md Enforcement Inventory — "code, not prose"

Readiness WS2 / DEC-20260812-A. Read-only audit of `C:\Users\pette\Projects\strale` at `8a393a3` (main).
Scope: every normative rule in CLAUDE.md mapped to an actual mechanism, verified by reading the mechanism.

**Classification key**
- `ENFORCED` — a guard exists AND is reachable from a gate that blocks (CI job `check`, or a hard runtime throw).
- `PARTIAL` — covered on some paths / some inputs / warn-only.
- `PROSE-ONLY` — no mechanism; relies on the agent reading CLAUDE.md.
- `STALE` — references a deleted mechanism.
- `CONTRADICTED` — CLAUDE.md asserts an enforcement that the code disproves.

**CI topology (the thing everything hangs off)**
- Branch protection on `main`: required status checks = `["check"]` only; `strict: true`; `required_approving_review_count: 0`; `enforce_admins: true`. **The `check` job in `.github/workflows/ci.yml` is the single machine gate on merge.** No human review is required.
- `.github/workflows/coverage-matrix-validation.yml` runs but is **not a required check** → a matrix PR can merge red.
- `.github/workflows/weekly-drift.yml` is a cron; see §1 — it is structurally incapable of failing.

---

## PART 1 — ORDERED BACKLOG (highest damage if violated first)

### 1. Weekly drift sweep never fails — all six sweeps report exit 0 unconditionally
**CONTRADICTED / BROKEN.** `.github/workflows/weekly-drift.yml`

Every sweep step has the shape:
```
set +e
<cmd> 2>&1 | tee /tmp/x.txt
echo "exit=$?" >> $GITHUB_OUTPUT
```
GitHub Actions' default shell for an unqualified `run:` is `bash -e {0}` — **no `pipefail`**. `$?` after a pipeline is the exit status of the *last* command, i.e. `tee`, which is always 0. Reproduced locally: `bash -e -c 'set +e; node ./nonexistent.mjs 2>&1 | tee /dev/null; echo $?'` → `0`.

Consequence: the `aggregate` step's `if [ "$MD" != "0" ] || …` can never be true → never `exit 1` → the `if: failure()` "Open drift-tracking issue" step has **never run**. Every step additionally carries `continue-on-error: true`, so even a real step failure is swallowed twice.

Blast radius: manifest↔DB drift, platform-facts drift, fetch-timeout coverage, migration prefixes, vendor-roster↔Decisions drift, and the backend↔frontend `AuditRecord` shape contract are all silently unmonitored. This is the exact "a check that exists but runs nowhere" incident class named in the task brief, in its most expensive form: the check *appears* to run, and produces green logs.

**Fix:** add `shell: bash` to each step (GHA's explicit-bash form sets `-eo pipefail`), or capture with `${PIPESTATUS[0]}`, or drop `| tee` and use `tee` via process substitution. Then verify by deliberately breaking one sweep and confirming the issue opens.

### 2. `check-migration-prefixes.mjs` is a dead reference in the drift cron
**CONTRADICTED.** Added in `968bc82`, **deleted in `3e60d5d` (PR #89, in-ts startup-migrations)**. Not present in HEAD (`git ls-files` → nothing). `.github/workflows/weekly-drift.yml:63` still invokes it. Commit `ef9f664`'s own message asserts "migration-prefixes … continue running" — it does not; it MODULE_NOT_FOUNDs, and §1 hides that.

Migration-prefix collision is a schema-corruption class of bug. Either restore the guard (and CI-wire it) or delete the step and the aggregate variable.

### 3. `check-platform-facts-drift` is claimed as a CI guard and is not one
**CONTRADICTED.** CLAUDE.md ("Drift-prevention surfaces"): *"The `apps/api/scripts/check-platform-facts-drift.mjs` CI guard catches new hardcoded values introduced into surface files."*

Three defects in one sentence:
1. Wrong path — the file is `apps/api/scripts/check-platform-facts-drift.ts` (converted in `bfa6f2d`).
2. It is **not in `ci.yml` at all**. Its only invocation is `weekly-drift.yml:49`.
3. It is invoked there **without `--strict`**. Its own header: *"default — print findings + exit 0 (informational)"*. So even with §1 fixed, it reports zero.

Net: the flagship drift-prevention rule — the one written in response to the RED-2 "methodology page named OpenSanctions for 3 days" cert-audit finding — has zero machine enforcement. The `vendor-switch` skill that CLAUDE.md points at is an agent instruction, not a gate.

**Fix:** add `node`/`tsx` invocation with `--strict` to `ci.yml`'s `check` job (backend surfaces only; frontend path skips cleanly), and keep the cron for the cross-repo sweep.

### 4. Cross-repo `AuditRecord` shape contract is effectively unenforced
**PARTIAL → effectively PROSE-ONLY.** `apps/api/scripts/check-shape-contracts.mjs`

- In `ci.yml:102` it runs with no `STRALE_FRONTEND_PATH` and no frontend checkout → hits the `existsSync` guard at line 79 and `process.exit(0)` with "Skipping shape-contract check". **Always a no-op in PR CI.**
- Its only real firing is `weekly-drift.yml` with the sibling checkout — which is broken per §1, and whose checkout step is itself `continue-on-error: true`.

CLAUDE.md states "the check fails and an issue is auto-opened." Neither happens today. `CONTRACTS` currently registers exactly one contract (`AuditRecord`).

**Fix:** either check out `strale-frontend` in `ci.yml` (it's the same org) or accept cron-only enforcement — but then §1 must be fixed first, and CLAUDE.md's claim needs softening.

### 5. Three "CI lint" scripts exist that no workflow runs
**PROSE-ONLY (guard written, never wired).** Same incident class as §1–2.

| Script | Self-described as | Actually run by |
|---|---|---|
| `apps/api/scripts/check-cost-class-coherence.mjs` | "Phase A0b CI lint" — asserts manifest `cost_class` matches the vendor shape in the executor (ANTHROPIC/OPENAI/BROWSERLESS/OPENREGISTER key reads) | nothing |
| `apps/api/scripts/check-no-direct-getexecutor-in-scripts.mjs` | "Phase A0b CI lint" — prevents scripts bypassing the `guardedExecute` dispatcher gate via raw `getExecutor` | nothing |
| `apps/api/scripts/verify-settlement-order-mutations.mjs` | mutation-verifier proving the DEC-14 settlement-order regression test actually catches the original bug shapes | nothing |

`verify-settlement-order-mutations.mjs` is notable: it is **the only mutation-verifier in the repo**, i.e. the only mechanical implementation of DEC-20260504-A step 2 ("the test must fail against the un-applied fix"). Leaving it unwired means the one place that discipline was mechanised is itself unenforced.

The first two guard the money-adjacent cost controls: `check-cost-class-coherence` is what stops a paid-vendor executor being labelled `free_quota` and thereby becoming schedulable by the test scheduler (the ALLOW_MATRIX consults `cost_class`, so a mislabel defeats the matrix).

**Fix:** three `- run:` lines in `ci.yml`. Cheapest high-value work in this inventory.

### 6. DEC-20260428-A Tier-2 provenance disclosure is warn-only and single-path
**PARTIAL.** `apps/api/src/lib/provenance-builder.ts:165-226`, wired at `apps/api/src/routes/do.ts:2488`.

`validateProvenanceAtBoundary` detects both doctrine violations (`acquisition_method: "vendor_scraping"` without `upstream_vendor`/`primary_source_reference`; `data_source_type: scrape` without `acquisition_method`) — but only `logWarn`s, **deduplicated per-slug for process lifetime** (`_shapeWarnedSlugs`), and returns `ok: true` with `tier2Incomplete: true` which no caller acts on. The response ships regardless.

Worse, it is called from **`/v1/do` only**. The x402 gateway (`x402-gateway-v2.ts`, both the `/:slug` and `/solutions/:slug` handlers) and `solution-executor.ts` do not call it. Since x402 is the primary rail per DEC-20260812-A, the doctrine's disclosure requirement is unenforced on the growth path.

**Fix:** call it from the x402 handlers and the solution executor; escalate `tier2Incomplete` from a dedup'd warn to a per-response alert (or a 500 in non-prod) so it's visible.

### 7. Circuit breaker is not applied on the x402 payment path
**PARTIAL — code contradiction with the "Circuit-breaker logic on `capability_health` survives" claim.**

`checkCircuitBreaker()` (`apps/api/src/lib/circuit-breaker.ts:29-83`) is called at `apps/api/src/routes/do.ts:794`. It is **not imported or called in `apps/api/src/routes/x402-gateway-v2.ts`** — that path's only pre-execution gate is `assertGuardedAllow` at line 1201 (the cost-class gate, not the health gate).

So a capability whose upstream is down and whose breaker is open still gets invoked-and-charged over x402. Combined with §6, x402 is systematically the less-protected rail while being the strategic one.

### 8. Cost Principle A (`skipAuth` on paid health probes) has no guard
**PROSE-ONLY, cleanly automatable.** `apps/api/src/lib/dependency-manifest.ts:39-42` documents `skipAuth`; `dependency-health.ts:8` restates it. Nothing cross-references a provider's paid tier against `healthProbe.skipAuth`. The stated cost of violation is 120+ wasted paid API calls/month per provider, silently.

**Guard sketch:** a vitest in `apps/api/src/lib/` that imports `PROVIDERS` from `dependency-manifest.ts` and asserts `every(p => p.tier !== "paid" || p.healthProbe?.skipAuth === true)`. Runs under `npm test` (already the last CI step, so zero workflow change). Failure mode: named provider + "paid provider health probe must set skipAuth: true (CLAUDE.md Principle A)".

### 9. Cost Principle B (validate input before paid API call) is 3-capability-deep
**PARTIAL.** The structural control that actually holds is the guarded-executor ALLOW_MATRIX (`apps/api/src/capabilities/guarded-executor.ts:96-140`), which hard-**throws** for `paid_prepaid` from `internal_test`/`health_probe`/`ci`, and for any `cost_class IS NULL`. That protects the *test* budget well and is CI-tested (`guarded-executor.test.ts` under `npm test`).

What is not protected is the **customer-traffic** budget, which the ALLOW_MATRIX allows unconditionally (`customer_paid` → allow for every cost class). The per-executor "reject empty/null/sub-2-char before the network call" rule is convention; the only mechanical coverage is `apps/api/src/capabilities/serper-input-validation.test.ts`, which pins exactly 3 Serper-backed capabilities via a throwing `fetch` spy.

**Guard sketch:** generalise the Serper test into a table-driven suite: for every capability whose manifest `cost_class` starts with `paid_`, stub `fetch` to throw and assert `executor({})`, `executor({field:""})`, `executor({field:"a"})` all reject without a network call. Runs under `npm test`. Failure mode: "paid capability `<slug>` reached the network on degenerate input".

### 10. DEC-20260504-A (regression test per cert-audit commit) is entirely judgment
**PROSE-ONLY, partially automatable.** The four sub-rules:

| Sub-rule | Status |
|---|---|
| 1. every cert-audit follow-up commit ships a regression test | PROSE-ONLY |
| 2. test must fail against the un-applied fix | PROSE-ONLY (only mechanised instance is the unwired `verify-settlement-order-mutations.mjs`, §5) |
| 3. bind-param shape: no `Date`/`Buffer` into `sql\`\`` | PARTIAL — case-study tests exist (`db-retention.test.ts`, `do.spend-cap.test.ts`); no generic guard |
| 4. swallow-visibility on catch blocks | PARTIAL — `check-no-bare-catch.mjs` **is** CI-wired (`ci.yml:35`), covers bare catch but not "summary log reports success while every rule errored" |

**Guard sketch (3), highest value:** a CI lint that regex/AST-walks every `db.execute(sql\`…\`)` / `tx.execute(sql\`…\`)` template in `apps/api/src` and flags any interpolated expression whose inferred type is `Date` or that is a `new Date(...)` / `.toISOString?` -less date expression. Cheap heuristic version: flag `${` operands matching `/\bDate\b|Buffer\.from/` inside `execute(sql`. Runs in `ci.yml`. Failure mode: file:line + "postgres-js cannot encode Date in a sql template — pass an ISO string or use sql\`\`::timestamptz". This is a direct re-run guard for the PR-43 incident.

**Guard sketch (1):** a PR-time lint that, when the commit message or PR title matches `/\b(Y|A|B|RED|MED|CRIT|F-AUDIT)-\d+\b/`, requires the diff to touch at least one `*.test.ts`. Failure mode: "cert-audit follow-up without a test — add one or cite the test-harness exemption in the PR body".

### 11. Capability onboarding pipeline: the mandatory steps are not the CI-gated ones
**PARTIAL.** The pipeline splits cleanly into what CI sees and what only a human/agent runs.

CI-gated (all inside the `check` job):
- `manifest-completeness.test.ts` (under `npm test`) — scans every `manifests/*.yaml` through `validateManifest`: slug, name, description ≥20, category, price_cents, input/output_schema, data_source, data_source_type, maintenance_class, processes_personal_data, output_field_reliability, limitations, `test_fixtures.known_answer.{input,expected_fields}`. **This is the real onboarding gate.**
- `check-manifest-guaranteed-consistency.mjs --strict` — guaranteed fields enumerated in `output_schema`.
- `check-manifest-pii.mjs --strict` — PII-bearing arrays in manifest examples empty/synthetic.
- `check-identity-fixture-shape.mjs --strict` — canonical-input sentinel for Identity caps.
- `check-fetch-timeout-coverage.mjs --strict` — the "all external calls must have `AbortSignal.timeout()`" rule.
- `check-tier-coverage.mjs` — **warn-only by design** (Phase 1; exits 0 regardless). Phase 2 promotion to `--strict` is still open.

NOT CI-gated (manual CLI; the `/go` skill invokes them, but `/go` is an agent instruction, not a machine gate):
- `scripts/onboard.ts` — including `--strict` fixture live-verify. Without `--strict` a fixture mismatch only warns ("Continuing with mismatched fixtures").
- `scripts/validate-capability.ts` — its own 16 DB-row checks.
- `scripts/smoke-test.ts` — 11 steps.
- `checkReadiness()` (`apps/api/src/lib/capability-readiness.ts:117-250`) — **the only place `avg_latency_ms` is enforced** (Onboarding Protocol step 4). Nothing in CI checks it.
- `validateCapabilityStructure` gate 15 (`onboarding-gates.ts:387-401`) — confirms CLAUDE.md's claim that gate 15 validates `gdpr_art_22_classification` against the enum. But it fires from the **post-insert** `onCapabilityCreated` hook, so a bad value is caught *after* the row exists (`lifecycle_state='hook_failed'`, insert not rolled back).

**Contradiction to flag:** CLAUDE.md says "All new capabilities MUST go through the manifest-driven pipeline." Nothing prevents a DB capability row without a corresponding `manifests/*.yaml`. The completeness test only validates manifests that exist.

**Guard sketch:** a vitest that queries `capabilities` for `is_active = true` and asserts every slug has `manifests/<slug>.yaml` (and vice versa, modulo the `DEACTIVATED` map in `auto-register.ts`). Needs DB access — better as a step in the weekly cron once §1 is fixed, or as an offline check against a committed catalog snapshot.

### 12. Wire-shape rule targets a deleted surface
**STALE.** CLAUDE.md's "Wire-shape rule for `/v1/public/ops/trust/*` endpoints" governs endpoints that no longer exist: `apps/api/src/app.ts:413-414` — *"/quality and /trust mounts retired with the SQS engine (DEC-20260503-B); internal-quality.ts and internal-trust.ts deleted."* `PUBLIC_OPS_ALLOWLIST` (`app.ts:387-403`) has no trust entries.

The *generalised* rule ("money is always integer cents; scores 0-100 or 0-1; dates ISO 8601; `*_formatted` additive") is still sound and worth keeping — but it is PROSE-ONLY with no guard, and it is currently written as if scoped to a dead route family. A grep of `apps/api/src/routes` for currency symbols / `_formatted` found no live violations (the one hit in `x402-gateway-v2.ts:1345-1356` is the x402 protocol's own string `price` field, correctly annotated).

**Fix:** rewrite the rule to be surface-agnostic; add a guard that walks route response literals for `/[€$£]\s*\d/` string templates. Failure mode: file:line + "emit `*_cents` integer; formatting is the consumer's job".

### 13. Report Filing Convention is drifting now
**PROSE-ONLY + live drift.** Repo root `*.md` is clean (`AGENTS.md`, `CLAUDE.md`, `DISTRIBUTION_PR_PREFLIGHT.md`, `README.md`, `REVIEW_TEMPLATE.md`, `WORKTREES.md` — all genuine canon).

But three root-level report directories hold 57 tracked files that the convention routes to `archive/sessions/`: `audit/` (22), `audit-output/` (15), `audit-reports/` (20) — including `*_RESEARCH`- and `*-audit-report`-shaped files explicitly named in the convention. Plus untracked `audit-output/exhaustive-enumeration-*.md` and `registry-source-research-2026-05-18.md` in the current working tree. `archive/sessions/` itself has 47 entries, so the convention is understood — it is just not applied to these three directories.

**Guard sketch:** a CI lint asserting (a) root `*.md` ∈ an allowlist, and (b) no *new* files matching `/(AUDIT-|_INVENTORY|_RESEARCH|SESSION_|RESOLUTION_REPORT|REVIEW_FINDINGS|FIX_PHASE)/i` land outside `archive/sessions/`. Grandfather the existing 57 via an allowlist file (same pattern already used by `fetch-timeout-allowlist.txt` and `manifest-consistency-allowlist.txt`).

### 14. `coverage-matrix-validation.yml` is not a required check
**PARTIAL.** The workflow is well-built (schema validation, filename/content alignment, `COVERAGE.md` staleness exit-2) but branch protection requires only `check`. A PR that reddens it merges anyway.

**Fix:** add its job to the required-checks list, or fold the step into `ci.yml`'s `check` job behind a path guard.

### 15. DEC-9 Idempotency-Key is optional at the handler
**PARTIAL — by design, worth an explicit acknowledgement.** `do.ts:507` reads the header; the replay path at `510-543` runs only `if (idempotencyKey && user)`. No 400 when absent. The DB-side partial unique index (`schema.ts:315-317`) is hard, so *supplied* keys are safe. DEC-9's wording ("Idempotency-Key header on POST /v1/do") reads as mandatory; the implementation is opt-in. Either soften the DEC text or make it required for paid calls.

### 16. DEC-14 has one documented deviation
**PARTIAL — acknowledged exception, keep it acknowledged.** `executeSync` is true charge-on-success (`do.ts` wallet `FOR UPDATE` 1639-1643 → executor 1697 → debit 1701-1705; failure path 1760-1797 does not debit). All x402 paths defer settlement correctly (`x402-gateway-v2.ts:1279` after executor at 1220; catch block explicitly does not settle; solutions handler gated on `anyStepSucceeded`).

`executeAsync` (`do.ts:1979-2192`) debits **upfront** and refunds on failure (`executeInBackground` catch, 2288-2337). This is a deliberate deviation, self-documented at line 2048. CLAUDE.md's DEC-14 line does not mention it. Add the carve-out to DEC-14's text so a future reader doesn't "fix" it or, worse, cite DEC-14 to justify pre-charging a new path.

### 17. Stale line citation: Principle C
**STALE (cosmetic, but it's a load-bearing citation).** CLAUDE.md: "The test scheduler excludes them from all runs (test-runner.ts line 117)." Actual filter is `apps/api/src/lib/test-runner.ts:128` — `not(eq(testSuites.testType, "piggyback"))`. Line 117 is unrelated. The exclusion itself is real and hard (query-level). Cite the symbol, not the line number.

### 18. Rate limiting (DEC-21, 10 req/s) is explicitly not a safety control
**PARTIAL — self-acknowledged.** `apps/api/src/lib/rate-limit.ts:8` — *"EXPLICITLY A CHEAP HEDGE, NOT A SAFETY CONTROL (F-0-002)"*; in-memory, non-durable, single-replica assumption (lines 24-28). The €100/h spend cap is the real control and is hard: `spendCapWouldExceed` (`do.ts:295-315`) runs inside the wallet-locked tx at `do.ts:1658-1675` / `2030-2045`, with a documented Y-11 double-count window (`do.ts:277-285`) that can only false-reject, never double-bill. Tests: `do.spend-cap.test.ts` + `do.spend-cap.integration.test.ts` under `npm test`.

### 19. Bulk-Operation Deploy Protocol (DEC-20260504-B)
**PROSE-ONLY, mostly correctly so.** Steps 1-4 (identify latency, audit accumulated workload, pick pre-drain or self-throttle, reject "ship and pray") are judgment. Partially automatable: a PR-time lint that, when the diff touches a known bulk-op file (`src/jobs/db-retention.ts`, reindex/archival/reconciliation jobs), requires the PR body to contain a `## Accumulated workload` heading. Weak but non-zero — it forces the estimate to be written down, which is where the 2026-05-04 crash came from skipping.

### 20. Deploy Mechanism Verification Protocol (DEC-20260504-C)
**PARTIAL.** The *specific* case that produced the outage is now structurally fixed and tested: `runStartupMigrations()` is called at `apps/api/src/index.ts:102` (inside `withStartupDbRetry`), and `Dockerfile:44` is `CMD ["node", "apps/api/dist/index.js"]` — so the import graph from the real entrypoint reaches it. Pinned by `startup-migrations.test.ts` and `admin-apply-migrations.test.ts` (both under `npm test`, both CI-wired).

The *general* rule ("for ANY new deploy-dependent code path, read the deploy mechanism and confirm reach by file path; post-deploy, query prod for the effect") remains PROSE-ONLY and is genuinely a judgment call. Accept as an acknowledged exception.

### 21. Distribution PR Integrity Protocol (DEC-20260422-A)
**PARTIAL.** Step 3 is `ENFORCED`: `check-framework-packages.mjs` runs in `ci.yml:53` and asserts every framework-named `packages/*-strale/` contains a real import from the framework it claims (skipping dirs with `DEPRECATED.md`). This is the guard that makes the hollow-package incident non-repeatable, and it is correctly wired.

Steps 1, 2, 4, 5 (verify every imported symbol before touching an external PR; run the 4-point preflight in `DISTRIBUTION_PR_PREFLIGHT.md`; one framework package per PR with a framework-primitive test and a README that only references what's in the module; polishing is not verification) are PROSE-ONLY — they govern actions on *external* repos, which no local guard can see. Partially automatable: extend `check-framework-packages.mjs` to also require ≥1 test file per package that imports a framework primitive (covers 4(b) mechanically).

### 22. Notion Workflow Invariants
**PROSE-ONLY, unautomatable from this repo.** "NEVER edit Journal entries / Decision content / Deferred content", "NEVER delete anything in Notion", "corrections → new Journal entry type=course-correction", "global decisions → ALWAYS get confirmation", "supersessions → ALWAYS use Contradiction Protocol", the Notion Governance Rules, and the Conflict Duty all live on the MCP side. Accept as acknowledged exceptions — unless the Notion MCP surface grows a write-policy hook.

Adjacent and *not* prose-only: `apps/api/src/lib/claude-md-protocols.test.ts` (CI, under `npm test`) asserts CLAUDE.md still contains all five protocol DEC IDs, so a rebase can't silently drop a protocol. Good pattern; extend it (see backlog #9).

### 23. Session checklists / code-review gate
**PROSE-ONLY.** "Never run `/end-session` over unreviewed code — halt and run `/go`" is an agent instruction. `apps/api/scripts/session-close-check.ts` exists and is real (git integrity, DB↔code parity, stuck caps, open breakers, uncommitted handoff files; exit 0/1/2) and `.claude/commands/end-session.md` step 1 invokes it — but nothing forces `/end-session` to be run, and the Stop hooks in `.claude/settings.json` are MODEL-OS routing/evidence gates, not CLAUDE.md protocol gates. Feature-branch naming (`type/kebab-description`) has no guard either.

### 24. Scoring Integrity / SQS references
**STALE but correctly marked.** CLAUDE.md's Scoring Integrity section correctly declares itself retired. The deletion is genuinely guarded: `apps/api/test/integration/no-sqs-keys.smoke.test.ts` (CI, under `npm test`) walks public endpoint responses for 15 forbidden SQS-shaped keys.

One live stale pointer: `.claude/skills/go/SKILL.md` still instructs *"Never edit `src/lib/sqs.ts` to 'fix' a score"* — that file no longer exists. Harmless but it's the kind of dangling reference that made §2 possible.

### 25. Side finding (out of scope, worth a line)
`.claude/settings.json` (untracked) contains a live-format Strale API key embedded in a Bash permission-allow rule. Untracked, so not a repo-credential leak — but it is one `git add -A` from becoming one, two commits after `94d51eb chore(security): scrub two committed credentials`. No tracked file contains a real key (the `sk_live_` hits in `CLAUDE.md`, `README.md`, `app.ts`, `auth.ts` are prefix mentions and format checks).

---

## PART 2 — COUNTS

| Class | Count | Rules |
|---|---|---|
| **ENFORCED** (CI-wired guard or hard runtime throw) | 16 | manifest completeness (`validateManifest` via `manifest-completeness.test.ts`); guaranteed↔schema consistency; manifest PII; identity fixture shape; fetch `AbortSignal` coverage; SSRF inventory; no-bare-catch; no-new-console; no-external-column-access; framework-package integrity; guarded-executor ALLOW_MATRIX (throws; CI-tested); auto-register DEACTIVATED sync; DEC-8 wallet `FOR UPDATE`; DEC-21 spend cap; free-tier 10/day (fail-closed); Principle C piggyback exclusion; no-SQS-keys smoke; CLAUDE.md protocol-ID presence; DEC-14 on sync + all x402 paths (+ settlement-order regression test) |
| **PARTIAL** | 12 | DEC-14 (async deviation); DEC-9 idempotency; DEC-21 req/s limiter; circuit breaker (absent on x402); Principle B (3 caps + ALLOW_MATRIX for test budget only); DEC-20260428-A provenance (warn-only, `/v1/do` only); onboarding protocol (manifest gated, readiness/latency/smoke not); gate 15 (post-insert, not authoring-time); tier-coverage (warn-only by design); DEC-20260504-A sub-rules 3 & 4; DEC-20260504-C (specific case fixed, general rule prose); DEC-20260422-A (step 3 only); coverage-matrix workflow (runs, not required) |
| **PROSE-ONLY** | 14 | Principle A skipAuth; wire-shape money/scores/dates; report-filing convention; cross-repo `llms.txt` / `sitemap.xml`; vendor-switch checklist; DEC-20260504-A steps 1-2; DEC-20260504-B (all 4 steps); DEC-20260422-A steps 1,2,4,5; Notion workflow invariants; Notion governance rules; conflict duty; session checklists + `/go` gate; branch naming; DEC-20260428-B engineering bar (beyond gate 15) |
| **STALE** | 4 | wire-shape rule scoped to deleted `/v1/public/ops/trust/*`; Principle C line-117 citation; `/go` skill's `src/lib/sqs.ts` reference; Scoring Integrity section (correctly self-marked) |
| **CONTRADICTED by code** | 5 | weekly drift sweep can never fail; `check-migration-prefixes.mjs` deleted but still invoked; `check-platform-facts-drift.mjs` claimed as CI guard (wrong ext, not in CI, no `--strict`); `check-shape-contracts` "fails and opens an issue" (always skips in CI); "all new capabilities MUST go through the pipeline" (nothing binds a DB row to a manifest) |

Additionally: **3 guard scripts written and wired nowhere** (§5).

---

## PART 3 — TOP-10 GUARD-BUILDING BACKLOG

Ordered by (damage if violated) × (cheapness of the guard).

| # | Guard | Effort | Where it runs |
|---|---|---|---|
| 1 | Fix the drift-cron exit capture (`shell: bash` or `${PIPESTATUS[0]}`) and delete/restore the `check-migration-prefixes` step. Verify by deliberately breaking one sweep. | XS | `weekly-drift.yml` |
| 2 | Wire the three orphaned guards into `ci.yml`: `check-cost-class-coherence.mjs`, `check-no-direct-getexecutor-in-scripts.mjs`, `verify-settlement-order-mutations.mjs`. | XS | `ci.yml` `check` |
| 3 | Add `check-platform-facts-drift.ts --strict` to `ci.yml` (backend surfaces; frontend path skips cleanly). Correct CLAUDE.md's filename + claim. | S | `ci.yml` `check` |
| 4 | Principle A guard: vitest asserting every paid provider in `dependency-manifest.ts` has `healthProbe.skipAuth === true`. | XS | `npm test` (already CI) |
| 5 | Call `validateProvenanceAtBoundary` from both x402 handlers + `solution-executor.ts`; promote `tier2Incomplete` from a dedup'd warn to an alert. | S | runtime |
| 6 | Apply `checkCircuitBreaker()` on the x402 wildcard + solutions handlers, matching `do.ts:794`. | S | runtime |
| 7 | Bind-param shape lint: walk `db.execute(sql\`\`)` / `tx.execute(sql\`\`)` interpolations, flag `Date` / `Buffer.from`. Direct re-run guard for PR-43. | M | `ci.yml` `check` |
| 8 | Principle B generalisation: table-driven vitest over all `cost_class: paid_*` capabilities with a throwing `fetch` stub and degenerate inputs. | M | `npm test` |
| 9 | Extend `claude-md-protocols.test.ts` into a citation-integrity test: assert every file path and script name CLAUDE.md names actually exists on disk. Would have caught §2 and §3 at authoring time, and §17. | S | `npm test` |
| 10 | Report-filing lint (root `*.md` allowlist + report-shaped files must live in `archive/sessions/`), grandfathered via an allowlist file. | S | `ci.yml` `check` |

Runner-up (worth doing, below the line): add `coverage-matrix-validation` to required checks; cert-audit-commit-requires-a-test PR lint; capability-row↔manifest parity check; wire-shape currency-literal lint.

**Meta-observation.** The dominant failure mode in this repo is not missing guards — 15 real guards exist and the CI job is genuinely strong. It is **guards that are written, correct, and disconnected**: three unwired scripts, one deleted-but-still-invoked script, one always-skipping check, and a cron whose exit-code plumbing swallows all six of its results. Guard #9 (citation integrity) is the cheapest structural defence against that class, because every one of these was *documented as enforced* in CLAUDE.md while being inert.
