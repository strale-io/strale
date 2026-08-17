# `apps/api/scripts/` right-sizing survey

Readiness WS2 overbuilt-trim input. Read-only survey, repo at `main` (8a393a3), 2026-08-12.

**182 files** in `apps/api/scripts/` (incl. `lib/`, `archive/`, `validate-phase-3/`):
175 executable scripts + 5 allowlist/config data files + 1 `.sql` + 1 `archive/README.md`.

---

## 1. Summary counts by disposition

| Disposition | Count | Share |
|---|---|---|
| KEEP-AS-IS | 44 | 24% |
| PROMOTE-TO-CI | 4 | 2% |
| MERGE-INTO (into 7 targets) | 62 | 34% |
| ARCHIVE | 55 | 30% |
| DELETE | 17 | 9% |
| **Total** | **182** | |

Net effect if executed: **182 files → ~66 live files** (44 keep + 4 promoted + 7 merge targets + 11 data/README/lib files retained), a 64% reduction in the live surface, with 55 files preserved under `archive/` as pattern reference rather than destroyed.

### Invocation-surface reality check

The bloat signal the brief predicted is confirmed and is worse than "nobody schedules it":

| Surface | Scripts | Note |
|---|---|---|
| CI-wired (`ci.yml` / `coverage-matrix-validation.yml`) | 13 | direct `node …` or via `npm run lint:*` |
| Cron-wired (`weekly-drift.yml`) | 5 | +1 **referenced but nonexistent** (see §5 CRITICAL-1) |
| Skill/command-wired (`.claude/`, `.agents/`) | 11 | `/activity`, `/go`, `/end-session`, `vendor-switch` |
| Referenced from `apps/api/src/` | 11 | mostly prose comments; 2 are real operator instructions |
| Referenced only by another script | 14 | |
| Referenced only in handoff/archive prose (historical record) | 47 | i.e. "was run once, written about, never again" |
| **Zero references anywhere outside `scripts/`** | **76** | **42% of the directory** |

76 scripts have no reference in CI, cron, `src/`, docs, skills, handoffs, or any other script. They are prose.

---

## 2. Full inventory

Surface legend: `CI` = GitHub Actions · `CRON` = weekly-drift · `SKILL` = `.claude`/`.agents` skill or command · `DOC` = CLAUDE.md/AGENTS.md · `SRC` = mentioned from `apps/api/src` · `SCRIPT` = only another script references it · `PROSE` = only handoff/archive write-ups · `NONE` = zero references anywhere.

### 2.1 KEEP-AS-IS (44)

| File | Purpose | Surface | Last commit |
|---|---|---|---|
| `onboard.ts` | Canonical capability onboarding pipeline from YAML manifest — the mandated path per CLAUDE.md | CI(comment)+DOC+SKILL+SRC | 2026-05-13 |
| `validate-capability.ts` | Gate 1 structural validation for a capability | DOC+SKILL+SRC | 2026-05-12 |
| `smoke-test.ts` | E2E capability smoke test (Pipeline spec §7) | DOC+SKILL+SRC | 2026-05-12 |
| `session-close-check.ts` | Session close-out loose-end checker | SKILL (`/end-session`) | 2026-04-20 |
| `check-no-bare-catch.mjs` | F-0-009 guard: no `.catch(() => {})` | CI via `lint:no-bare-catch` | 2026-04-17 |
| `check-ssrf-inventory.mjs` | F-0-006 guard: no unguarded fetch in capability files | CI direct + PKG | 2026-04-17 |
| `check-no-new-console.mjs` | F-0-014 guard: no new `console.*` | CI via `lint:no-new-console` | 2026-04-19 |
| `check-no-external-column-access.mjs` | SCF-3 guard: no API access to `transactions.integrity_hash_status` | CI direct + PKG + SRC | 2026-04-20 |
| `check-framework-packages.mjs` | DEC-20260422-A hollow-package guard | CI + DOC | 2026-08-06 |
| `check-fetch-timeout-coverage.mjs` | Cert-audit C6: every `fetch()` timeout-bounded | CI + CRON + SKILL | 2026-04-30 |
| `check-manifest-guaranteed-consistency.mjs` | Phase 3b pipeline-bypass detector | CI | 2026-05-13 |
| `check-manifest-pii.mjs` | Manifest PII guard (no real names in examples) | CI | 2026-08-10 |
| `check-tier-coverage.mjs` | Tier-coverage structural gate (WARN-only, Phase 1) | CI | 2026-05-17 |
| `check-identity-fixture-shape.mjs` | DEC-20260513-D canonical-input sentinel | CI | 2026-05-13 |
| `check-shape-contracts.mjs` | Cross-repo type-shape contracts (AuditRecord) | CI + CRON + DOC | 2026-04-30 |
| `validate-coverage-matrix.mjs` | Coverage-matrix YAML schema validation | CI + PKG | 2026-05-17 |
| `regenerate-coverage-matrix-summary.mjs` | Regenerate `COVERAGE.md` from matrix YAMLs | CI + PKG | 2026-05-17 |
| `sweep-manifest-drift.ts` | Manifest↔DB drift sweep | CRON + SKILL + DOC | 2026-04-30 |
| `check-platform-facts-drift.ts` | PLATFORM_FACTS↔surface drift | CRON + DOC + SKILL + SRC | 2026-05-07 |
| `check-vendor-roster-drift.ts` | Vendor Roster↔Decisions DB drift | CRON + DOC | 2026-05-07 |
| `sync-manifest-canonical-to-db.ts` | Sync all manifest-canonical fields YAML→DB | SKILL (`vendor-switch`) | 2026-08-09 |
| `sweep-prod-catalog.ts` | Readiness P0 production catalog verification sweep (DEC-20260812-A) | DOC(docs/strategy) | 2026-08-12 |
| `build-disposition.ts` | Readiness disposition-table builder (DEC-20260812-A) | DOC(docs/strategy) | 2026-08-12 |
| `sweep-paid-fixtures.ts` | Operator sweep of every paid capability's known_answer fixture | DOC+PROSE | 2026-08-12 |
| `sync-known-answer-fixtures.ts` | Resync known_answer fixtures manifest→DB (Readiness P1) | PROSE | 2026-08-12 |
| `capture-tier-fixtures.ts` | Live capture pass feeding the tier-coverage gate | SCRIPT+PROSE | 2026-08-12 |
| `lib/internal-accounts.ts` | Re-export shim over `src/lib/internal-accounts.ts` | SCRIPT+SRC | 2026-08-12 |
| `lib/sweep-denylist.ts` | Money-safety: vendors sweep tooling must never call | SCRIPT | 2026-08-12 |
| `audit-placeholder-fixtures.ts` | Standing sweep for fixtures that would fail the readiness gate | SRC+PROSE | 2026-04-17 |
| `meta-monitoring-run.ts` | Scheduled meta-monitoring runner (Phase III) | SRC (`health-sweep.ts:174`) | 2026-03-18 |
| `lifecycle-transition.ts` | Admin CLI for capability lifecycle state | SRC+PROSE | 2026-05-05 |
| `reset-circuit-breaker.ts` | Reset a capability's circuit breaker | SRC | 2026-04-11 |
| `fix-corrupted-output-schemas.ts` | Repair stringified-JSON `output_schema` rows | SRC (`jsonb-value.ts:38` tells operators to run it) | 2026-04-14 |
| `prune-claude-worktrees.ts` | Janitor for orphan agent worktrees (WORKTREES.md Rule 3) | NONE | 2026-05-10 |
| `topup-test.ts` | Top up the test wallet | PROSE+SCRIPT | 2026-04-19 |
| `rotate-test-key.ts` | Rotate the test API key | PROSE | 2026-04-19 |
| `get-api-key.ts` | Print the current test API key | NONE | 2026-03-18 |
| `provider-health-check.ts` | Which providers does the scheduler see as unhealthy | PROSE | 2026-04-28 |
| `solution-execution-smoke.mts` | Solution execution success-path smoke (domain-trust) | NONE | 2026-04-05 |
| `smoke-openapi-resolver.ts` | Committed regression smoke, openapi-resolver × 8 WW-Top countries | NONE | 2026-05-16 |
| `generate-manifests.ts` | Generate onboarding manifests for all active capabilities | SCRIPT | 2026-03-18 |
| `generate-known-bad-tests.ts` | Generate known_bad test suites | NONE | 2026-03-20 |
| `console-allowlist.json` | Data for `check-no-new-console.mjs` | CI(indirect) | 2026-05-07 |
| `archive/README.md` | Archive convention doc — the model this survey extends | — | 2026-04-21 |

Plus 4 allowlist data files kept with their CI gates: `fetch-timeout-allowlist.txt` (2026-05-03), `manifest-consistency-allowlist.txt` (2026-05-13), `identity-fixture-shape-allowlist.txt` (2026-05-13), `tier-coverage-allowlist.txt` (2026-05-18).

### 2.2 PROMOTE-TO-CI (4)

These already describe themselves as CI gates or standing sweeps but are wired to nothing. Cheapest possible wins — the code exists and works.

| File | Purpose | Which check | Why | Last commit |
|---|---|---|---|---|
| `check-cost-class-coherence.mjs` | Assert manifest `cost_class` matches vendor shape in executor source | add step to `ci.yml` | Header literally says "Phase A0b **CI lint**". `src/lib/phase-b3-anthropic-paid-prepaid-slugs.ts:8` already claims this check "enforces" the invariant — it does not, because nothing runs it. | 2026-05-12 |
| `check-no-direct-getexecutor-in-scripts.mjs` | Prevent scripts bypassing the dispatcher gate | add step to `ci.yml` | Header says "Phase A0b CI lint". Guards a money-safety boundary (scripts calling paid executors directly, bypassing `sweep-denylist`). Zero enforcement today. | 2026-08-12 |
| `audit-placeholder-fixtures.ts` | Flag active fixtures that fail the readiness gate | add step to `ci.yml` (or fold into weekly cron) | Header says "Standing sweep… **Safe to run in CI**". Currently manual-only. | 2026-04-17 |
| `audit-capability-pairing.ts` | Forward-looking guard for the auto-register pipeline | weekly cron step | Self-describes as a guard; a guard nobody runs is documentation. | 2026-05-03 |

### 2.3 MERGE-INTO (62 scripts → 7 targets)

#### Target A — `ops-activity.ts` (13 → 1)
One CLI, subcommands `--today | --since-last | --window <from> <to> | --last-7d`, shared `--exclude-internal`.

| File | Purpose | Surface | Last commit |
|---|---|---|---|
| `today-overview.ts` | Today's calls split internal/external | SKILL(`/activity`)+SRC | 2026-08-12 |
| `today-signups.ts` | Today's signups | SKILL+PROSE | 2026-04-18 |
| `today-x402.ts` | Today's x402 calls | SKILL+PROSE | 2026-04-18 |
| `since-last-ext.ts` | External activity since last check (state file) | SKILL+SRC+PROSE | 2026-08-12 |
| `daily-ext.ts` | Daily external-activity rollup | SKILL+PROSE | 2026-04-18 |
| `activity-7d.ts` | 7-day per-capability call/complete/fail totals | NONE | 2026-05-05 |
| `window-inputs.ts` | Transactions + inputs in a time window | SKILL | 2026-04-18 |
| `window-searches.ts` | `suggest_log` searches in a window | SKILL | 2026-04-17 |
| `window-users.ts` | Authenticated non-internal user activity in a window | PROSE | 2026-04-18 |
| `window-x402.ts` | x402 transactions in a window | PROSE | 2026-04-18 |
| `window-failed-requests.ts` | `failed_requests` rows in a window | PROSE | 2026-04-17 |
| `who-called.ts` | Who called since a hardcoded ISO timestamp | PROSE | 2026-04-17 |
| `drill-failures.ts` | Drill into recent failures | NONE | 2026-05-05 |

Evidence for merging: all 13 open a raw `postgres(process.env.DATABASE_URL!, {max:1, ssl:"require"})`, all filter the same `transactions ⋈ capabilities ⋈ users` join, and 9 carry a **hand-copied** `EXCLUDED_EMAILS` literal. `window-searches.ts` and `window-inputs.ts` differ only in the SELECT and the grouping.

#### Target B — `x402-inspect.ts` (5 → 1)
| File | Purpose | Surface | Last commit |
|---|---|---|---|
| `x402-audit-inspect.ts` | Audit trail of 5 most-recent x402 transactions | PROSE | 2026-04-18 |
| `x402-detail.ts` | One-line-per-row x402 summary since a hardcoded date | PROSE | 2026-04-18 |
| `x402-payer-history.ts` | All x402 transactions from a payer wallet | PROSE | 2026-04-18 |
| `diag-x402-users.ts` | x402 user summary | NONE | 2026-04-29 |
| `diag-x402-google-search.ts` | Non-'test' google-search x402 queries, last 14d | NONE | 2026-04-29 |

#### Target C — `diag-scheduler.ts` (17 → 1)
Scheduler / test-state read-only diagnostics. All hit the same `capabilities` + `test_suites` + `test_results` triple.

| File | Purpose | Surface | Last commit |
|---|---|---|---|
| `scheduler-coverage.ts` | Eligible caps vs actually tested in 24h | PROSE | 2026-04-27 |
| `staleness-distribution.ts` | Test-staleness distribution across active caps | PROSE | 2026-04-27 |
| `test-status-distribution.ts` | `test_suites.test_status` distribution | PROSE | 2026-04-27 |
| `last-tested-divergence.ts` | `last_tested_at` vs `MAX(test_results.executed_at)` | PROSE | 2026-04-27 |
| `caps-tested-recently.ts` | Which caps tested recently | PROSE | 2026-04-27 |
| `browserless-caps-recent.ts` | Have browserless caps been tested recently | NONE | 2026-04-28 |
| `check-suite-status.ts` | Suite status for one slug | NONE | 2026-03-18 |
| `check-test-timing.ts` | Test timing rows | NONE | 2026-03-18 |
| `check-lifecycle-states.ts` | Lifecycle-state counts | NONE | 2026-03-18 |
| `check-scores.ts` | Score dump | NONE | 2026-04-14 |
| `check-defaults.ts` | Column-default check | PROSE | 2026-03-18 |
| `check-output-schema.ts` | Output-schema dump | NONE | 2026-04-14 |
| `diag-scheduler-state.ts` | Scheduler state dump | NONE | 2026-04-29 |
| `diag-partial-failures.ts` | Recent failed runs for partial-failure caps | PROSE | 2026-04-28 |
| `inspect-ofr-drift.ts` | `output_field_reliability` drift for a slug | NONE | 2026-04-29 |
| `diagnose-low-scores.ts` | Diagnose low-scoring caps | NONE | 2026-04-14 |
| `bulk-test-overdue.ts` | Bulk-trigger overdue test runs via admin endpoint | PROSE | 2026-04-28 |

#### Target D — `catalog-lifecycle.ts` (8 → 1)
Parameterised deactivate/park/pause/suspend/reactivate. Every one of these is the *same operation* against a different hardcoded slug list.

| File | Purpose | Surface | Last commit |
|---|---|---|---|
| `drop-aggregator-kyb.ts` | Soft-deactivate 18 solutions, 6 EU jurisdictions | PROSE+SCRIPT | 2026-04-27 |
| `drop-sg-kyb.ts` | Soft-deactivate 3 SG solutions | SCRIPT | 2026-04-21 |
| `drop-se-deactivated-caps.ts` | Soft-deactivate 2 SE caps | NONE | 2026-04-26 |
| `park-company-intelligence-sdr.ts` | Park one solution (DEC-20260421-J semantics) | NONE | 2026-04-21 |
| `pause-it-solutions.ts` | Pause KYB solutions with deactivated chain members | NONE | 2026-04-28 |
| `suspend-pre-deploy-caps.ts` | Suspend 4 caps until PRs merge | NONE | 2026-05-01 |
| `reactivate-pre-deploy-caps.ts` | Undo the above | NONE | 2026-05-01 |
| `sync-deactivated-to-db.ts` | Sync `DEACTIVATED` map → DB catalog columns | NONE | 2026-04-28 |

Keep `sync-deactivated-to-db.ts`'s logic as the general form; it is the only one that reads the source of truth instead of a copy-pasted list.

#### Target E — `sync-manifest-canonical-to-db.ts` (3 merge in, target already exists)
| File | Purpose | Surface | Last commit |
|---|---|---|---|
| `sync-manifest-text-to-db.ts` | Sync description + schemas only | PROSE+SCRIPT | 2026-04-27 |
| `sync-limitations-2026-04-29.ts` | One-shot: sync `limitations` for specific caps | SCRIPT | 2026-04-29 |
| `sync-data-source-bulk.ts` | One-shot: sync `data_source` for 12 caps | NONE | 2026-04-28 |

`sync-manifest-canonical-to-db.ts`'s own header says it "Extends sync-manifest-text-to-db.ts (which only covers description + schemas)". The other two exist only because the canonical version didn't cover their field yet. It does now. This is a textbook one-off-variant cluster.

#### Target F — `diag-registry.ts` (10 → 1)
Ad-hoc per-country registry probes. Fold into one `--country <cc> --id <x>` probe.

| File | Purpose | Surface | Last commit |
|---|---|---|---|
| `test-krs.ts` | Raw fetch against PL KRS API | NONE | 2026-04-14 |
| `test-budimex.ts` | `polish-company-data` executor with one input | NONE | 2026-05-12 |
| `smoke-singapore.ts` | SG executor with a known UEN | PROSE | 2026-05-12 |
| `investigate-singapore.ts` | Why SG has no passing tests in 30d | PROSE | 2026-05-11 |
| `smoke-cy-directors-parse.ts` | CY DRCOR parse-only smoke | NONE | 2026-05-19 |
| `smoke-ee-directors-parse.ts` | EE directors parse-only smoke | NONE | 2026-05-18 |
| `ecb-investigate.ts` | ECB SDW geo-restriction investigation | PROSE | 2026-04-27 |
| `diag-cz-scheduler.ts` | CZ scheduler run counts | NONE | 2026-04-29 |
| `test-hmrc-sandbox.ts` | HMRC VAT sandbox retest (support ref 2026-CNS433) | PROSE | 2026-05-06 |
| `diag-adverse-media-variants.ts` | 3 zero-hit adverse-media entities | PROSE+DOC | 2026-04-29 |

#### Target G — `coverage-probe.ts` (3 → 1)
| File | Purpose | Surface | Last commit |
|---|---|---|---|
| `empirical-screening-coverage.ts` | PEP/sanctions/adverse-media empirical coverage | PROSE+DOC | 2026-05-03 |
| `empirical-vat-coverage.ts` | VAT validation coverage EU27+UK+NO+CH | PROSE | 2026-05-03 |
| `gleif-coverage-by-country.ts` | GLEIF LEI counts per jurisdiction | PROSE | 2026-05-03 |

Same shape (iterate jurisdictions → call a capability → tabulate hit-rate), same week, three files.

Remaining merge-cluster members counted above: `smoke-web3a.ts` (2026-05-02), `smoke-layerzero.ts` (2026-05-02) → fold into a `smoke-web3.ts`; `diagnose-low-3.ts` (2026-04-14) → Target C.

### 2.4 ARCHIVE (55) — move to `scripts/archive/`, successor named

The repo already has the convention (`archive/README.md`: "preserved as pattern reference, not for reuse"). These are completed one-shot operations whose successor exists.

| File | Purpose | Surface | Last commit | Successor |
|---|---|---|---|---|
| `phase-4b1-backfill-yamls.ts` | Phase 4b.1 YAML required-field backfill | NONE | 2026-04-21 | `onboard.ts --backfill` |
| `phase-4b1-fixup-transparency-tag.ts` | Phase 4b.1 transparency_tag fixup | NONE | 2026-04-21 | `onboard.ts --backfill` |
| `phase-4b1-snapshot-onboarding-manifest.ts` | Snapshot manifests → `onboarding_manifest` | SCRIPT | 2026-04-21 | `onboard.ts` (persists inline) |
| `phase-4b2-generate-orphan-yamls.ts` | Generate YAMLs for 17 web3 orphans | SCRIPT | 2026-04-21 | `generate-manifests.ts` |
| `gate4b-retrospective.ts` | Gate 4b dry-run composition retrospective | PROSE | 2026-04-11 | `onboarding-gates.ts` runtime gates |
| `gate5-retrospective.ts` | Gate 5 path-coverage retrospective | PROSE | 2026-04-11 | `onboarding-gates.ts` |
| `validate-phase-3/gate2-snapshot.mjs` | Snapshot a capability row pre/post | NONE | 2026-04-20 | phase complete |
| `validate-phase-3/gate2-rollback.mjs` | Restore `price_cents` to pre-state | NONE | 2026-04-20 | phase complete |
| `validate-phase-3/gate4-scan.mjs` | Gate 4 scan | NONE | 2026-04-20 | phase complete |
| `validate-phase-3/probe-prod.mjs` | Phase-3 prod probe | NONE | 2026-04-20 | `sweep-prod-catalog.ts` |
| `validate-phase-3/trigger-hook-failure.mjs` | Deliberately trigger hook failure | NONE | 2026-04-20 | phase complete |
| `verify-phase-c-state.mjs` | Phase C state verification | PROSE+SCRIPT | 2026-04-17 | phase complete |
| `prepush-diagnostics.ts` | Pre-push diagnostics for PR1 (SQS deletion) | PROSE | 2026-05-05 | SQS deleted per DEC-20260503-B |
| `trace-qp.ts` | Trace QP scoring | NONE | 2026-03-18 | **SQS engine deleted** |
| `diagnose-low-3.ts` | Diagnose 3 low-SQS caps | NONE | 2026-04-14 | SQS engine deleted |
| `preflight-2026-04-29-migrations.ts` | Pre-flight for 0052–0054 | PROSE | 2026-04-29 | `runStartupMigrations()` |
| `postflight-2026-04-29-migrations.ts` | Post-flight for 0052–0054 | PROSE | 2026-04-29 | `runStartupMigrations()` |
| `preflight-2026-04-30-migrations.ts` | Pre-flight for 0056/0057 | NONE | 2026-05-05 | `runStartupMigrations()` |
| `verify-deploy-2026-04-29.ts` | Post-deploy `/v1/verify` check | PROSE | 2026-05-05 | one-off |
| `cleanup-se-deactivation-2026-04-21.ts` | SE deactivation DB side-effects | PROSE+SCRIPT | 2026-04-21 | Target D |
| `deactivate-ecb.ts` | One-shot deactivate `ecb-interest-rates` | PROSE | 2026-04-27 | Target D |
| `backfill-art22-classifications.ts` | Backfill `gdpr_art_22_classification` | PROSE+SCRIPT | 2026-05-03 | manifest field + `onboard.ts` |
| `backfill-field-reliability.ts` | Backfill `output_field_reliability` | PROSE+SCRIPT | 2026-03-17 | `onboard.ts --discover` |
| `backfill-country-data-manifest-schemas.ts` | Backfill country-data output_schemas | SCRIPT | 2026-05-01 | `onboard.ts --discover` |
| `backfill-manifest-maintenance-class.ts` | Backfill `maintenance_class` DB→YAML | SCRIPT | 2026-05-01 | `sync-manifest-canonical-to-db.ts` |
| `populate-error-codes.ts` | Populate `error_codes_json` from registry | NONE | 2026-03-15 | `onboard.ts` |
| `populate-fallbacks.ts` | Populate fallback columns from `CAPABILITY_FALLBACKS` | NONE | 2026-03-15 | `onboard.ts` |
| `populate-rug-bytecodes.ts` | Populate rug-bytecode index | NONE | 2026-05-02 | one-off seed |
| `apply-test-status.ts` | Annotate won't-fix caps' test_status | PROSE | 2026-03-17 | manifest `limitations` |
| `convert-to-fixtures.ts` | Convert deterministic tests live→fixture | NONE | 2026-03-20 | `test_mode` column |
| `reclassify-unknowns.ts` | Reclassify "unknown" test results | SRC | 2026-03-20 | classifier ships inline |
| `add-name-fixtures.ts` | Add name-search fixtures for 5 caps | NONE | 2026-05-12 | `onboard.ts --discover` |
| `seed-kyb-solutions.ts` | Seed 60 KYB/Invoice solutions × 20 countries | PROSE+DOC+SCRIPT | 2026-05-01 | completed seed |
| `seed-search-tags.ts` | Seed `search_tags` | NONE | 2026-03-20 | completed seed |
| `seed-seo-solutions.ts` | Seed `local-seo-audit` solution | PROSE (untracked) | 2026-08-12 | completed seed — **commit or delete, currently untracked** |
| `audit-4caps.ts` | Audit 4 hardcoded slugs | NONE | 2026-05-05 | `sweep-prod-catalog.ts` |
| `audit-lifecycle-history.ts` | Lifecycle history for 4 hardcoded slugs | NONE | 2026-05-05 | `sweep-prod-catalog.ts` |
| `final-state-check.ts` | Final state for a hardcoded slug list | PROSE | 2026-03-18 | `sweep-prod-catalog.ts` |
| `diag-final-check.ts` | Final check, 2026-04-28 incident | NONE | 2026-04-28 | incident closed |
| `diag-cz-state-final.ts` | CZ final state, 2026-04-29 | NONE | 2026-04-29 | incident closed |
| `diag-deactivated-state.ts` | Deactivated-state dump | NONE | 2026-04-28 | Target D |
| `diag-affected-solutions.ts` | Solutions affected by a deactivation | NONE | 2026-04-28 | Target D |
| `diag-uk-property-solutions.ts` | UK-property solution state | NONE | 2026-04-28 | resolved |
| `fix-uk-property-solution.ts` | Fix the UK-property solution | NONE | 2026-04-28 | resolved |
| `diag-tos-backfill.ts` | ToS backfill state | NONE | 2026-05-05 | resolved |
| `diag-alert-spam.ts` | Alert-spam investigation | NONE | 2026-04-28 | resolved |
| `diag-meta-monitoring-events.ts` | Latest hourly summary payload | NONE | 2026-04-29 | `meta-monitoring-run.ts` |
| `verify-loose-threads.ts` | Hourly meta-monitoring tick verification | NONE | 2026-04-29 | `session-close-check.ts` |
| `diag-risk-narrative-model.ts` | Which Anthropic snapshot resolved | NONE | 2026-04-30 | capability records it now |
| `diag-browserless-probe.ts` | Browserless probe | NONE | 2026-04-28 | `provider-health-check.ts` |
| `lifecycle-sweep-light.ts` | Lifecycle sweep without scheduler | PROSE | 2026-03-18 | `lifecycle-transition.ts` |
| `lifecycle-transition-slim.ts` | Slim variant avoiding `src/app.js` import | SCRIPT | 2026-05-05 | `lifecycle-transition.ts` |
| `db-cleanup-now.ts` | One-off DB cleanup + reclaim space | NONE | 2026-04-15 | 2026-05-04 crash incident closed; `db-retention.ts` |
| `db-analyze.ts` | DB size analysis | NONE | 2026-04-15 | same incident |
| `find-leak.ts` | Find a leak (2026-03 incident) | NONE | 2026-03-18 | resolved |

`archive/phase-dec-b-backfill.ts` and `archive/phase-dec-b-park.ts` (both 2026-04-21) are **already archived and correctly documented** — no action.

### 2.5 DELETE (17) — evidence per row

Held to a high bar: each is either machine-broken, a literal 2–3 line throwaway trivially re-typed, or verifies a migration that has since shipped and been superseded. None has pattern value the archive would preserve. All have **zero** references in CI, cron, `src/`, `package.json`, skills, docs, or any other script (verified by `rg --hidden` full-repo sweep, hidden dirs included).

| File | Last commit | Evidence for DELETE |
|---|---|---|
| `verify-locks.mjs` | 2026-04-17 | **Machine-broken**: hardcodes `config({path: "C:/Users/pette/Projects/strale/.env"})`. Cannot run on any other checkout, in CI, or on Railway. Only mention is one archived session report. |
| `auto-register-baseline.ts` | 2026-05-03 | 3 lines total: `await autoRegisterCapabilities(); console.log(getRegisteredCount())`. Zero refs. |
| `diag-drizzle-migrations.ts` | 2026-04-30 | 2 lines: `SELECT hash, created_at FROM drizzle.__drizzle_migrations … LIMIT 15`. Zero refs. |
| `check-migrations.ts` | 2026-03-18 | Same query, different formatting. Superseded by `runStartupMigrations()` (`index.ts:69`). Zero refs. |
| `run-migration-0021.ts` | 2026-03-16 | Applies migration 0021; current head is 0057+. Superseded by startup migrations. Zero refs. |
| `apply-0024.ts` | 2026-03-18 | Applies migration 0024 (3 `ALTER TABLE`s). Same. Only ref is one handoff. |
| `verify-0055.ts` | 2026-04-29 | Checks whether one column exists post-0055. Migration shipped. Only ref is one handoff. |
| `one-off-backfill-drizzle-tracker.sql` | 2026-04-20 | Filename declares one-off; the drizzle tracker backfill completed. Zero refs. |
| `check-manifest-jsonb.ts` | 2026-04-29 | Single hardcoded slug (`adverse-media-check`) JSONB probe. Zero refs. |
| `check-pkn-fixture.ts` | 2026-04-14 | Single-fixture probe. Zero refs. |
| `test-drizzle-windows.ts` | 2026-03-18 | Windows-specific drizzle spike; the drizzle-quirks question was resolved 2026-05-13. Zero refs. |
| `diagnose-low-scores.ts` | 2026-04-14 | Reads SQS scores. **SQS engine deleted** per DEC-20260503-B — the columns it selects are on PR2's drop list. Zero refs. |
| `check-scores.ts` | 2026-04-14 | Same: SQS score dump against deleted engine. Zero refs. |
| `check-defaults.ts` | 2026-03-18 | Prints column defaults; `\d capabilities` does this. Only ref is one handoff. |
| `check-output-schema.ts` | 2026-04-14 | Prints `output_schema` for a slug; superseded by `sweep-manifest-drift.ts`. Zero refs. |
| `check-paid-api-preflight.ts` | 2026-05-02 | Superseded by `lib/sweep-denylist.ts` + `check-no-direct-getexecutor-in-scripts.mjs`, both newer (2026-08-12) and structurally stronger. Zero refs. |
| `check-suite-status.ts` | 2026-03-18 | Defaults to hardcoded `address-geocode`; one query. Zero refs. |

**Explicitly NOT proposed for delete** despite zero references, because pattern value or re-run likelihood is real: `smoke-*` parse smokes, `empirical-*` coverage probes, `prune-claude-worktrees.ts`, `get-api-key.ts`, `generate-known-bad-tests.ts`, `solution-execution-smoke.mts`. Wrong keep is cheap.

---

## 3. Duplicate-logic clusters → extraction proposals

### Confirmed from the brief

**C1 — Hand-copied internal-account lists (9 files).** Canonical list is `apps/api/src/lib/internal-accounts.ts` (`EXCLUDED_INTERNAL_EMAILS`), re-exported by `scripts/lib/internal-accounts.ts`. Only **2 scripts import the shim** (`build-disposition.ts`, `sweep-prod-catalog.ts`). Nine still carry a verbatim 5-element literal:

`since-last-ext.ts` · `today-overview.ts` (as `INTERNAL_EMAILS`) · `today-signups.ts` · `today-x402.ts` · `window-inputs.ts` · `window-users.ts` · `activity-7d.ts` · `daily-ext.ts` · `drill-failures.ts`

The canonical file's own docstring already flags this: *"The hand-copied lists still in since-last-ext.ts / today-overview.ts / window-*.ts are a P2 cleanup item."* This survey confirms the scope is 9 files, not 3, and adds a tenth divergence: `src/lib/daily-digest/fetch-platform.ts` maintains a *separate* `EXTRA_EXCLUDED_EMAILS = ["petterlindstrom@hotmail.com"]` that is **not** in the canonical list — so the daily digest and the quality floor exclude different sets today. **Extraction:** replace all 9 literals with the shim import; fold `petterlindstrom@hotmail.com` into `EXCLUDED_INTERNAL_EMAILS` (or document why the digest differs). This one is load-bearing — the quality floor (DEC-20260812-A) reads completion rates, so a divergent exclusion set changes catalog decisions.

**C2 — Sweep denylists.** Already correctly centralised in `scripts/lib/sweep-denylist.ts`, imported by both `sweep-paid-fixtures.ts` and `sweep-prod-catalog.ts`. **No action** — this is the model the other clusters should follow.

**C3 — Manifest-loading boilerplate (21 files).** Every one re-implements "glob `manifests/*.yaml` → `yaml.load` → coerce". Consumers: `onboard.ts`, `generate-manifests.ts`, `sweep-manifest-drift.ts`, `sync-manifest-{text,canonical}-to-db.ts`, `sync-limitations-2026-04-29.ts`, `sync-data-source-bulk.ts`, `sync-known-answer-fixtures.ts`, `capture-tier-fixtures.ts`, `inspect-ofr-drift.ts`, `audit-capability-pairing.ts`, `phase-4b1-{backfill,snapshot}`, `phase-4b2-generate-orphan-yamls.ts`, and the 5 `.mjs` CI gates (`check-cost-class-coherence`, `check-manifest-guaranteed-consistency`, `check-identity-fixture-shape`, `check-manifest-pii`, `check-tier-coverage`) plus `validate-coverage-matrix.mjs`, `regenerate-coverage-matrix-summary.mjs`. **Extraction:** `scripts/lib/manifests.ts` exporting `loadAllManifests()` / `loadManifest(slug)` / `manifestPath(slug)`. Note the `.ts`/`.mjs` split — the CI gates are `.mjs` and cannot import a `.ts` lib without a build step, so either ship the lib as `.mjs` (importable from both under NodeNext) or convert the 5 gates to `.ts`. **Recommend `.mjs`** — it is the smaller change and keeps CI free of `tsx`.

**C4 — Postgres connection boilerplate (72 files).** 72 scripts open a raw connection; 51 use `getDb()` from `src/db`. The raw ones split into two incompatible dialects — `postgres(process.env.DATABASE_URL!, {max:1})` and `postgres(process.env.DATABASE_URL!, {max:1, ssl:"require"})`. **Extraction:** `scripts/lib/db.ts` (+ `.mjs` twin) exporting `opsSql()` with the `ssl:"require"` default and a `DATABASE_URL` presence assertion. This also fixes a live inconsistency: several scripts omit `ssl:"require"` and therefore behave differently against prod than their siblings.

**C5 — dotenv-path boilerplate (109 files).** `config({path: resolve(import.meta.dirname, "../../../.env")})` appears in 109 files, with three spelling variants (`import.meta.dirname` vs `fileURLToPath(import.meta.url)` vs — in `verify-locks.mjs` — a hardcoded absolute Windows path) and two depth variants (`../../../` at top level vs `../../../../` in `validate-phase-3/`). **Extraction:** `scripts/lib/env.mjs` with a single `loadEnv()`. Folding C4+C5 into one `scripts/lib/bootstrap.mjs` (`loadEnv()` + `opsSql()`) removes ~6 lines × 109 files.

### Clusters not named in the brief

**C6 — Time-window query scaffold (13 files).** `const from = process.argv[2]; const to = process.argv[3]; if (!from || !to) { usage; exit(1) }` followed by the same `transactions ⋈ capabilities ⋈ users WHERE created_at BETWEEN` join. Drives Target A above. **Extraction:** `scripts/lib/window.ts` exporting `parseWindowArgs()` and `txInWindow(sql, from, to, {excludeInternal})`.

**C7 — Hardcoded slug-array one-offs (14 files).** `const SLUGS = [...]` then iterate. `audit-4caps.ts` and `audit-lifecycle-history.ts` carry the *identical* 4-element array (`html-to-pdf`, `landing-page-roast`, `singapore-company-data`, `nl-bag-address`). Also `final-state-check.ts`, `suspend-pre-deploy-caps.ts`/`reactivate-pre-deploy-caps.ts` (paired lists that must stay in sync and have no mechanism enforcing it), `drop-*`, `pause-it-solutions.ts`. **Extraction:** none — the fix is Target D, a `--slugs` flag. The slug list belongs in the invocation, not the file.

**C8 — `test_results` recency aggregation (8 files).** `scheduler-coverage`, `staleness-distribution`, `last-tested-divergence`, `caps-tested-recently`, `browserless-caps-recent`, `test-status-distribution`, `diag-partial-failures`, `check-test-timing` each re-derive "last execution per capability" with a slightly different `DISTINCT ON` / `MAX()` / window-function formulation. `last-tested-divergence.ts` exists *specifically because* two of these formulations disagreed. **Extraction:** `scripts/lib/test-recency.ts` with one `lastExecutionPerCapability(sql)`. This is the cluster most likely to produce a wrong operational conclusion, since the variants genuinely return different answers.

**C9 — Two parallel scripts directories.** `apps/api/src/scripts/` also exists, holding `audit-live-registries.ts` and `dk-cvr-retry-2026-05-06.ts`. These live under `src/` (so they compile, and `tsc` type-checks them) while the 175 in `apps/api/scripts/` do not. There is no documented rule for which directory a new script goes in. **Proposal:** state the rule explicitly — `src/scripts/` for anything that must type-check and ship in the image; `scripts/` for operator tooling excluded from the build — and note it in CLAUDE.md's Project Structure block, which currently mentions neither.

---

## 4. Top-10 cheapest wins

Ordered by (value ÷ effort). 1–4 are pure-config or single-file edits.

| # | Win | Effort | Why it pays |
|---|---|---|---|
| 1 | **Fix `weekly-drift.yml`: `check-migration-prefixes.mjs` does not exist** | 1 line | CI references a file that was never committed. See §5 CRITICAL-1. |
| 2 | **Fix the exit-code capture in `weekly-drift.yml`** | 6 lines | `cmd \| tee f; echo "exit=$?"` captures **tee's** status, not the script's. Every sweep reports `exit=0` regardless of findings, so the aggregate never fails and the drift-tracking issue has never been opened. See §5 CRITICAL-2. |
| 3 | **Wire `check-cost-class-coherence.mjs` + `check-no-direct-getexecutor-in-scripts.mjs` into `ci.yml`** | 2 lines | Both self-describe as CI lints; `src/lib/phase-b3-*.ts:8` already claims the first one "enforces" an invariant it does not enforce. Code is written and working. |
| 4 | **Replace 9 hand-copied `EXCLUDED_EMAILS` literals with the shim import** | 9 one-line edits | Canonical file already flags this as P2. Divergence directly affects the DEC-20260812-A quality floor. |
| 5 | **Reconcile `EXTRA_EXCLUDED_EMAILS` in `src/lib/daily-digest/fetch-platform.ts`** | 1 line | Daily digest and quality floor currently exclude *different* account sets. Fold into canonical or document the difference. |
| 6 | **DELETE the 17 in §2.5** | delete-only | Removes 9% of the directory with zero behavioural risk. Includes `verify-locks.mjs`, which cannot run anywhere but Petter's machine, and 4 scripts querying SQS columns that DEC-20260503-B PR2 will drop. |
| 7 | **ARCHIVE the 55 in §2.4** | `git mv` + README rows | Convention and README already exist. Halves the directory without destroying anything. |
| 8 | **Merge Target A (13 activity scripts → `ops-activity.ts`)** | ~1 day | Biggest single reduction; also the directory's most-used surface (`/activity` command) and the one where C1 drift bites. |
| 9 | **Extract `scripts/lib/bootstrap.mjs` (C4+C5)** | ~2h | Removes boilerplate from 109 files and fixes the inconsistent `ssl:"require"`. Do it as a mechanical pass *after* the deletes and archives, so it touches 66 files instead of 182. |
| 10 | **Extract `scripts/lib/test-recency.ts` (C8)** | ~2h | Eight scripts disagree on "last tested"; one of them exists only to diagnose that disagreement. Highest correctness payoff of the extractions. |

Sequencing note: run **6 → 7 → 8 → 9**. Deleting and archiving first means the boilerplate extraction touches a third as many files.

---

## 5. Defects found in passing (outside the brief's scope, but blocking)

**CRITICAL-1 — `weekly-drift.yml` invokes a nonexistent script.**
`.github/workflows/weekly-drift.yml` step `migration-prefixes` runs:
```
node apps/api/scripts/check-migration-prefixes.mjs
```
The file does not exist anywhere in the repo (verified: `find` + `rg --hidden` across all of `apps/`, `packages/`, and hidden dirs). It is named in three handoff docs (`2026-04-30-cert-audit-track-a-and-b-shipped.md`, `2026-05-11-in-ts-migrations-convention-pr88-phase3.md`, `2026-05-13-drizzle-quirks-verification.md`) as if it shipped. Either it was never committed or it was removed without updating the workflow. **Migration prefix-collision checking has never actually run in the cron.**

**CRITICAL-2 — every `weekly-drift.yml` sweep reports success regardless of outcome.**
All six steps use the shape:
```
set +e
<script> 2>&1 | tee /tmp/x.txt
echo "exit=$?" >> $GITHUB_OUTPUT
```
With `pipefail` unset (the default), `$?` after a pipeline is the exit status of the **last** command — `tee` — which is essentially always 0. So `MD`/`FD`/`FT`/`MP`/`VR`/`AR` are all `0` on every run, the aggregate `if` never fires, the job never fails, and the "Open drift-tracking issue" step (`if: failure()`) has never executed. Combined with CRITICAL-1 — whose missing-file error is also swallowed — **the weekly drift sweep has been reporting clean since it was introduced, whatever the actual drift.** Fix: `set -o pipefail`, or capture `${PIPESTATUS[0]}`.

This is the same swallow-visibility failure mode DEC-20260504-A was written about (`db-retention.ts` logging "pruned successfully" while every rule errored), reappearing in the CI layer.

**MINOR-1 — doc drift on file extension.** CLAUDE.md, AGENTS.md, and `.claude/skills/vendor-switch/SKILL.md` all reference `apps/api/scripts/check-platform-facts-drift.mjs`. The file is `.ts`. (A `.mjs` of that name does exist in the *frontend* repo, which is likely the source of the confusion — but the backend instruction as written would fail.)

**MINOR-2 — `seed-seo-solutions.ts` is untracked.** Present in the working tree, referenced by a handoff doc, never committed. Either commit it or remove it; right now it is invisible to every guard in CI.

**MINOR-3 — `.claude/PROTOCOL.md` references `scripts/audit-workflow.ts`**, which does not exist (hedged in the doc as "or equivalent", so lower severity).
