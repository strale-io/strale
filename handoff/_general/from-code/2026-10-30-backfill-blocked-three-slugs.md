Intent: record the state after deploying the discovery timestamp fix — one of
four suites repaired, three blocked by an opaque backfill failure — and what
has already been ruled out, so the next session does not repeat it.

# Three suites still carry frozen assertions; backfill fails opaquely

Follow-on from `2026-10-30-discovery-timestamp-freeze.md`. The fix is merged
(PR #849) and **deployed**: `GET /health` → `4991d1a22342`, confirmed before
any backfill was attempted.

## Where the four suites stand

| slug | state |
|---|---|
| `company-status-check` | **repaired.** Backfill with discover updated the known_answer suite and verification passed. |
| `eurostat-data` | still frozen: `as_of` = `…09:46:31.924Z`, `accessed_at` = `2026-10-30`, `updated` = `2026-10-22T21:00:00.000Z` |
| `entity-resolve` | still frozen: `as_of` = `2026-10-30T00:00:00Z` |
| `places-search` | still frozen: `overture_release` = `2026-10-21.0` |

The three stored assertions live in
`test_suites.validation_rules.checks`. All three suites are
`scheduled_testing_eligible` at `external_cost_cents = 0`, so the hourly
free-tier scheduler will report a false failure on each from the next run
(`entity-resolve` from the first midnight UTC after 2026-10-30).

**Blast radius, measured:** all three capabilities are `visible = false`,
`x402_enabled = false`, `lifecycle_state = validating`, so no customer path
reaches them. The quality floor keys on real customer calls (≥10 in 30 days),
not on test results, so a failing suite should not delist anything. The cost
is noise in health monitoring and in whatever reads scheduled-test outcomes —
which matters, because that is the F1 false-quality-attribution family, but it
is not customer-facing and not urgent.

## The failure

Every backfill of these three returns, per slug:

```
status: failed, timeMs: 4-5
errors: pipeline_error "Onboarding failed. Check the reviewed manifest and
        API logs before retrying."
        not_ready "Readiness has unresolved issues."
verification: { passed: null, entries: [] }   rows.updated: []
```

4–5 ms, `readiness: null`, no `stage` — it throws before anything executes,
and `pipeline_error` is the generic mapping for an exception that is not an
`OnboardingError`. The real message goes to `report()`/`log`, which runs
**inside the API process**, so it reaches Railway's logs and never the GitHub
job log or the artifact. That is the blocker: the diagnosis needs Railway log
access, which this session does not have.

## Ruled out, with the evidence

- **Not sequencing or the batch.** `eurostat-data` alone fails identically
  (run 41040623870, 4 ms).
- **Not discovery.** `discover: false` fails the same way (run 41041055507),
  so the throw is before the discovery stage.
- **Not the manifest-drift acknowledgement banner.** The route sets
  `force: true` (`internal-onboarding.ts:369`), so that gate is skipped.
- **Not manifest/DB drift on the authority-owned columns.** `price_cents`,
  `freshness_category`, `transparency_tag`, `data_source`, `cost_class` and
  `data_classification` all match between each manifest and its production row
  for all three, and for the two that work.
- **Not an invalid manifest.** `validate-capability.ts --slug eurostat-data`
  passes 19/19 locally, and an invalid manifest would return 422 from the
  route rather than a pipeline error.
- **Not backfill in general, and not the new deploy.** `json-repair` backfills
  on the same deploy in 42 ms with verification passed (run 41040888252), and
  `company-status-check` was repaired by this very deploy.
- **Not my fix.** `company-status-check` ran discovery successfully on the
  deployed code, so `looksTimeVarying` is exercised and fine.

So it is specific to these three slugs, before execution, in the path between
the route's manifest validation and the discovery stage.

## Next step

Read the API log for these run ids and get the real exception:
`41040365851` (the batch), `41040623870` (`eurostat-data` alone),
`41041055507` (the three without discovery). Railway logs for the API service,
around 2026-10-30T10:20Z–10:35Z. The run ids are in each artifact's
`body.id`.

A second, smaller finding worth considering while there: the runner reports an
unexpected exception as a generic `pipeline_error` with no stage and no
message, which forces log access for every such failure. Surfacing the stage
and a redacted reason in the result would have made this self-diagnosing. Left
alone here because the current wording looks deliberate, and widening what an
internal endpoint returns is not a change to make in passing.
