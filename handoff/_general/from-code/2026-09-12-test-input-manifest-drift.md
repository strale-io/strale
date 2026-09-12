Intent: confirm and fix the fixture-input-drift gap flagged as follow-up in
`handoff/_general/from-code/2026-09-11-recapture-refusal-lock.md`, three
`dependency_health` suites quarantined on a genuine failure (stored input no
longer resolves; the manifest's corrected input does), plus build a general
mechanism so this class of drift resyncs on `onboard.ts --backfill` and gets
swept for visibility going forward.

## 1. Confirmed the drift, per capability (live, read-only, free_unlimited, no cost)

All three capabilities carry `cost_class: free_unlimited`
(`manifests/irish-company-data.yaml:8`, `manifests/lithuanian-company-data.yaml:8`,
`manifests/swiss-company-data.yaml:7`), so all six live calls below cost
nothing external.

Ran each capability's real registered executor directly (not a
reimplementation) against both the stored `test_suites.input` and the
manifest's `test_fixtures.health_check_input`:

| capability | stored input | stored result | manifest input | manifest result |
|---|---|---|---|---|
| irish-company-data | `{"cro_number":"461onal"}` | THROWS: `No Irish company found matching "461onal".` | `{"cro_number":"513174"}` | SUCCESS: STRIPE PAYMENTS EUROPE, LIMITED |
| lithuanian-company-data | `{"company_code":"301524699"}` | THROWS: `No Lithuanian company found for code 301524699.` | `{"company_code":"304151376"}` | SUCCESS: AB "Energijos skirstymo operatorius" |
| swiss-company-data | `{"uid":"CHE-116.281.710"}` | THROWS: `No Swiss company found for "CHE-116.281.710"...` | `{"uid":"CHE-101.602.521"}` | SUCCESS: Roche Holding AG (via Zefix) |

The evidence confirms the premise for all three: the stored `dependency_health`
input no longer resolves, the manifest's corrected input does. Prod row ids
(read-only query against `test_suites`):
`dae1b5b2-f8fd-4ac8-9c23-300d27d6ac5d` (irish),
`c5260ec7-f02d-4d37-afc9-10e9a90f3497` (lithuanian),
`79197c2f-be82-4c2d-8f55-0f472768a48c` (swiss), all three
`test_status = 'quarantined'`, `quarantine_reason` starting
`fixture_recapture_exhausted:`, matching the brief exactly.

## 2. Mechanism: `onboard.ts --backfill --discover`/`--fix` now resyncs `dependency_health` too

New module `apps/api/src/lib/test-input-drift.ts`:
`deriveDependencyHealthInput(manifest)` mirrors `onboard.ts`'s
`buildTestSuites` derivation (`healthInput ?? knownAnswerEntries[0]?.input ?? {}`)
and `checkDependencyHealthDrift(slug, storedInput, manifest)` compares a
stored input against that derivation. Wired into `onboard.ts`'s backfill path
(`apps/api/scripts/onboard.ts`, right after the existing `known_answer` resync
block), gated the same way (`--discover` or `--fix`), so a plain `--backfill`
that only adds missing test types or limitations never touches an existing
`dependency_health` row.

Direction 1 (manifest corrected, DB stale, the actual incident): fixed. Running
`--backfill --discover` (or `--fix`) on an onboarded slug now also resyncs its
`dependency_health` input, clearing the baseline and forcing a fresh `live`
recapture, exactly mirroring what already happened for `known_answer`.

Direction 2 (DB hand-edited on purpose, manifest unchanged): NOT protected,
by design. `dependency_health`'s input is, by construction in `buildTestSuites`,
always derived from the manifest; there is no supported concept of a
permanently intentional divergence for this test type (unlike `known_answer`,
which can have multiple entry-point fixtures). If an operator wants a
different health probe, the manifest's `health_check_input` is where that
decision belongs. Documented explicitly in both the module's doc comment and
the onboard.ts call site.

Regression tests in `apps/api/src/lib/test-input-drift.test.ts` (6 tests),
each proved by planting: `deriveDependencyHealthInput` temporarily forced to
return `{}` unconditionally made 5 of 6 tests fail (including the "reports no
drift once matching" and "scoped to one capability, unrelated capability
untouched" cases); restoring the real derivation made all 6 pass again.

## 3. Released the three rows, startup migration block 0114

`apps/api/src/lib/startup-migrations.ts`
`runMigration0114_releaseCorrectedDependencyHealthFixtures` (ledger `M057`),
same shape as block 0113 (`M056`): append-only, ledger-guarded (a
`startup_migration_ledger` row short-circuits every later boot), predicate
scoped to `test_type = 'dependency_health' AND quarantine_reason LIKE
'fixture_recapture_exhausted:%' AND capability_slug IN ('irish-company-data',
'lithuanian-company-data', 'swiss-company-data')`, cannot touch a row outside
those three by construction (no other slug matches the IN list, and a row for
one of the three not currently carrying that exact quarantine reason fails
the WHERE). Rewrites `input` to the live-verified corrected value per
capability, resets `test_status`/`quarantine_reason`/`fixture_recapture_failures`,
clears the baseline, sets `test_mode = 'live'` (not `canary`, these are
verified-working corrections, not the structurally-incapable-of-a-baseline
refusal types 0113 handles), and writes one `health_monitor_event` per
released row.

Workload this resumes (Bulk-Operation Deploy Protocol, DEC-20260504-B): 3
suites move from permanently refused to normal scheduling; all three
registries are `free_unlimited`, so this does not reach a paid upstream, and
three independent per-capability test suites resuming their existing per-suite
cadence is not the bulk-DELETE-style resumption event the protocol targets,
so no pre-drain or self-throttle is needed beyond the exact-predicate scope
already built in.

Ledger entries M056/M057 both write `test_suites.quarantine_reason`,
`test_suites.test_status`, `test_suites.test_mode`,
`test_suites.fixture_recapture_failures`, `test_suites.baseline_output`,
`test_suites.baseline_captured_at`. Added `known_overlaps` entries for
`quarantine_reason` and `test_status` (new) and extended the existing entries
for the other four columns, each note arguing disjointness by `test_type`
(dependency_health vs negative/edge_case/known_bad, no row can match both
predicates at once).

`npm run migrations:check`: pass. `npm run migrations:test`: pass (17/17,
receipt below).

## 4. Sweep, how wide this is

Ran the existing `apps/api/scripts/fixture-drift.ts` / `src/lib/fixture-drift.ts`
(PR #674, already on `main`, this incident's own general-purpose sweep tool,
not something built this session) against production, read-only, `--days 30`.
Receipt: `archive/receipts/2026-09-12-sweep-test-input-manifest-drift.json`.

- 326 active `dependency_health` suites, 350 manifests.
- Actionable set (differs from manifest AND never passes in the 30-day
  window, the tool's own deliberately narrow conjunction, see its doc
  comment): **34** suites, including the three named above. Two more
  (`canadian-company-data`, `spanish-company-data`) are the same root-cause
  class, a corrected manifest and a stale production entity that no longer
  resolves or matches confidently, already the flagship example in
  `fixture-drift.ts`'s own doc comment. The remaining roughly 29 hold a
  generic placeholder input (`"test"`/`"test_value"`) that a `paid_prepaid`
  `ALLOW_MATRIX` policy refuses from `internal_test` context, or (one case,
  `danish-company-data`) a `free_quota` budget exhaustion, a different
  failure shape (policy or quota refusal, not registry non-resolution),
  though structurally the same "differs and never passes" signal.
- Raw divergence (differs from manifest, regardless of pass/fail, ALL active
  `dependency_health` suites, no time window): **81 of 322** active suites
  (2 more on 5 inactive suites). Reported for the fuller picture the brief
  asked for; NOT the actionable set. Most of the extra roughly 47 are passing
  suites where production's stored input works fine and the manifest's
  fixture is simply a different (often richer or more current) value, which
  `fixture-drift.ts`'s own doc comment documents is not itself a fault (nine
  of those were rewritten at runtime by `self-heal.ts`, a third writer of
  `test_suites.input` besides onboarding and hand edits; two go the other
  way, with the manifest holding the stale value).

`onboard.ts --backfill --discover` (this session's mechanism) is available to
resync any of the 81 on a case-by-case basis; it was not run against the 78
outside the three named rows, that is out of this session's scope, per the
brief.

## Gates

- `apps/api`: `npx tsc --noEmit -p .`, pass (after
  `npm --workspace=packages/mcp-server run build`, the pre-existing
  worktree node_modules/mcp-server-types artifact gap, unrelated to this
  change, see WORKTREES.md).
- `apps/api`: vitest on `test-input-drift.test.ts`, `startup-migrations.test.ts`,
  `onboard-guards.test.ts`, `onboard-scheduling.test.ts`,
  `onboarding-gates-orchestrator.test.ts`, `onboard-dependency-health.test.ts`,
  pass. Receipt: `archive/receipts/2026-09-12-test-run-test-input-manifest-drift.json`.
- `npm run migrations:check`, pass.
- `npm run migrations:test`, pass.
- `npm run env:check`, pass.
- `npm run context:check`, pass (ran `context:generate` twice first, per
  protocol).
- `npm run receipts:check`, pass (11 pre-existing unrelated warnings from
  early-September handoffs, not from this session).
- `npm run archive:index`, pass (regenerated `archive/README.md` /
  `handoff/README.md`).

## Not done / out of scope

- The wider 78-row (81 minus the 3 released) drift population is reported,
  not repaired, the brief scoped repair to the three named rows.
- No PR opened, per the brief.
