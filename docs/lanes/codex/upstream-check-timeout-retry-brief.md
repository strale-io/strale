Intent: Codex builder brief: in the weekly upstream-recordings check, re-run a tool once when the live call fails only on a timeout, so one slow upstream answer no longer turns the whole weekly drift sweep red.

# Brief: upstream-check-timeout-retry

- **Requester:** the Strale master (session_01RFNL6ScBcPoMYb3sPeaj8r), 2026-11-17.
- **Evidence:** weekly-drift run 43911137718 (2026-11-16) failed only on `UR=1`, the upstream-recordings step (every other sweep exit was 0). Its only finding: `country-economic-indicators: live contract: executor threw: The operation was aborted due to timeout`, plus the follow-on `no longer requested: GET https://api.worldbank.org/...SL.UEM.TOTL.ZS...` (the request was cut off before it was recorded). Re-run on 2026-11-17: `record-upstream.ts --check --slug country-economic-indicators` → no drift; full `--check` → 32/32 without drift. So the week went red on one transient timeout.
- **Branch:** push only `codex/upstream-check-timeout-retry`, cut from `main` at the commit holding this brief. Never push `main`, and never label, approve, merge or comment.
- **Data:** this brief and the repository only. No secrets, no production data, no network in tests.
- **Read first:** `apps/api/scripts/record-upstream.ts` (`runLive`, `checkOne`, `main`) and the `upstream-recordings` step in `.github/workflows/weekly-drift.yml`.

## What to build

Change `apps/api/scripts/record-upstream.ts` and add a test file next to it (or the nearest existing test for this script). No workflow, manifest or recording change.

In `--check` mode only (`checkOne`), not in capture mode:

1. Run the live call as today.
2. If the run's only failures are an executor throw whose error is a timeout (an `AbortSignal.timeout` abort: `TimeoutError`/`AbortError`, or the message "The operation was aborted due to timeout"), run `runLive` once more and judge drift on the second run only. The `no longer requested` lines from the first run are discarded with it.
3. If the second run is clean, report the slug as `no drift (passed on retry after a timeout)` and count it as no drift.
4. If the second run also fails, report the second run's drift as today, with `(after one retry)` appended to each line, and count it as drift.
5. Any other failure (wrong known answer, status change, a non-timeout throw, oversize, recording age) is reported on the first run as today, with no retry.

Keep it to one retry and keep each run's existing timeouts; do not lengthen any executor timeout.

## Tests

Keep the logic testable without the network: put the retry decision in a small exported function (for example, given a function that runs the live call, return the drift lines and whether a retry happened), and test it with stubbed runs:

- first run a timeout throw, second clean → no drift, retry noted. Must fail against `main`.
- both runs timeout → drift reported once with `(after one retry)`. Must fail against `main`.
- first run a wrong known answer → reported, the stub shows no second run.
- first run a non-timeout throw (e.g. `fetch failed`) → reported, no second run.

## Done means

- `npm run typecheck` and the new tests pass from `apps/api`.
- Report at `docs/lanes/codex/upstream-check-timeout-retry-report.md`: the files changed, fail-before evidence for each marked test, the test output, and anything you could not do.
- Run `npm run context:generate` and commit any change it makes.

`Next authorised action: Claude review of codex/upstream-check-timeout-retry | Owner: Strale master | Blocker: none`
