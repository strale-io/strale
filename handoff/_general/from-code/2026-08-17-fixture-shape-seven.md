# Intent: fix the seven capabilities the harness reported as broken while they answered every production call correctly

Follow-on from the 2026-08-17 morning check-in and PR #305. The task was framed
as "the fixtures assert a flattened shape against a nested response." That was
true, and it was not the whole story — it was one of three independent causes,
and not the one doing most of the damage.

## What the seven actually were

| cause | capabilities | what was wrong |
|---|---|---|
| **Stale fixture baseline** (dominant) | all six fixture-mode ones | the harness had not called the executor since March |
| **Declared-contract drift** | `iso-country-lookup`, `incoterms-explain`, `dangerous-goods-classify`, `beneficial-ownership-lookup` | `output_schema.properties` described a shape the executor stopped returning |
| **Placeholder fixture inputs** | `company-id-detect`, `skill-extract` | the suite asked the capability to find nothing, then failed it for complying |

Most needed two of the three fixed. Fixing only the manifests, as the task
described, would have left all six still failing.

## The finding that mattered: the harness had stopped running

`test_mode = 'fixture'` replays `baseline_output` instead of calling the
executor — and `captureBaseline` returned early whenever a baseline already
existed. Together those make a wrong baseline **permanent**: the executor is
never called again and the verdict can never change.

`iso-country-lookup`'s known-answer suite stores `{"query":"Sweden"}`. Its
baseline was captured 2026-03-13 from a *different suite's* input (`"land"`),
the suite's input was changed 2026-03-20, and the baseline was never
re-captured. **All 81 recorded runs over the last 7 days echoed `"land"`. Zero
executed `"Sweden"`.**

What isolated it: every *other* suite on that capability echoes its own input
exactly — `edge_case` returns `";"`, `known_bad` returns
`INVALID_TEST_VALUE_12345`, `dependency_health` returns `"land"`. Only the
fixture-mode one was frozen. The piggyback suite, fed by real customer traffic,
had returned `"Sweden"` correctly all along.

**Scope: 81 active fixture-mode suites carry a baseline older than their last
edit.** Six were failing; the other 75 pass only because their stale baselines
happen to still satisfy the rules. This was a latent trap across all of them.

## Shipped

**PR #308 — a fixture baseline older than its suite is not evidence.**
`isBaselineStale` stops the replay; `captureBaseline` refreshes instead of
declining. One `Date` is written to both timestamp columns — two `new Date()`
calls can differ by a millisecond, and *that is the staleness predicate*, so
every fresh baseline would be born stale and fixture mode would never be used
again. A stale baseline on a suite that costs money to re-run is reported as
`fixture_refresh_required` (classified `config`) rather than as a capability
failure — the rule #305 established this morning. All six casualties are
`external_cost_cents = 0`, so they repair themselves by re-executing.

**PR #309 — seven declared output contracts realigned with reality.** Every
shape was captured by calling production with the capability's own fixture
input. One source of truth in `lib/capability-output-contracts.ts`; migration
0090 writes it to the DB with `jsonb_set` on `properties` alone so hand-written
`example` blocks survive; the manifests are generated from the same module and
a test asserts they agree — that drift is precisely how this happened. Every
one of these manifests already carried a **regenerated `example` showing the
real shape next to a stale `properties`**: the example was maintained, the
contract was not.

Two fixture inputs replaced. `company-id-detect` was testing the literal string
`test_value`, which exercises the not-detected branch, so `best_match` was
legitimately absent every run. `skill-extract` was testing "This is a test input
for automated capability testing." — prose with no skills in it.

## Verification

**Contracts live in production:** all seven `properties` and
`output_field_reliability` match the module (checked key-order-insensitively —
my first comparison reported false drift on key ordering).

**End-to-end, read-only:** called production with each suite's *current* input,
then ran the real Gate 2 (`calculateNullFieldRatio`) and Gate 3
(`checkGuaranteedFieldsPresent`) against the *live DB* contracts:

```
name-parse                     PASS  gate3=ok  gate2=0% null of 3
beneficial-ownership-lookup    PASS  gate3=ok  gate2=n/a (<3 guaranteed)
skill-extract                  PASS  gate3=ok  gate2=0% null of 3
incoterms-explain              PASS  gate3=ok  gate2=0% null of 3
dangerous-goods-classify       PASS  gate3=ok  gate2=0% null of 3
company-id-detect              PASS  gate3=ok  gate2=n/a (<3 guaranteed)
iso-country-lookup             PASS  gate3=ok  gate2=n/a (<3 guaranteed)
```

A scheduler-tick confirmation was still running at handoff time — see "open
loop" below.

**Tests: 51 new across the two PRs, discrimination proven in both directions.**
5 of 10 stale-baseline tests fail when `isBaselineStale` is stubbed to `false`;
10 of 38 contract tests fail against the pre-fix declarations; the migration's
idempotency test fails when a guard is removed. Full suite 1884 passed, `tsc`
clean, shape-contract / platform-facts / manifest-consistency sweeps clean.

## Where coverage genuinely got weaker, stated plainly

Reliability levels were set to be *true*, not quiet — but two capabilities drop
below Gate 2's three-guaranteed-field minimum, so the null-ratio rule no longer
applies to them at all:

- **`iso-country-lookup`** — an exact hit returns `match`, a fuzzy hit returns
  `matches`/`total_matches`. Neither can honestly be guaranteed, leaving only
  `query`.
- **`beneficial-ownership-lookup`** — UK-only coverage makes the
  unsupported-jurisdiction response a real second shape, leaving `company_name`
  and `jurisdiction`.

For both, the sentinel still enforces the guaranteed keys and the suites'
explicit `not_null` checks remain. But an executor that returned a well-formed
envelope full of nulls would now pass Gate 2 on these two. If that matters, the
fix is a per-shape contract (assert `match` XOR `matches`), which Gate 2 cannot
currently express. I did not weaken anything to make the alarm stop — each
capability has a test proving a genuinely broken executor is still caught.

## Open loop for the next session

1. **Confirm the scheduler tick.** A background watcher was polling for
   post-deploy `known_answer` results across all seven and for any remaining
   `invariant_violation` events. The in-process check above predicts all seven
   pass; confirm against real runs, and confirm the four still-fixture-mode
   suites re-executed live and re-captured a correct baseline.
2. **The other 75 stale-baseline suites.** They now re-execute on their next
   tick under #308. Most will simply re-capture and carry on, but any that were
   passing *because* of a stale baseline will start failing — and those failures
   will be real. Worth watching for a day.
3. **`redirect-trace`** remains below the floor on genuine timeouts, and
   `barcode-lookup` / `vat-validate` sit at 83%. Not touched here.

## Note on method

The task's framing — "fixtures assert a flattened shape" — was a reasonable
read of the symptom and would have produced a fix that did not work. What
changed the diagnosis was one query: comparing each suite's *stored input*
against the input its results *echoed back*. Six of seven had never run at all.
Before editing a fixture because a test fails, check that the test is running.
