Intent: Codex builder brief: production-watch stops letting one acknowledged, known failure hide every other failure. An acknowledgement is dated and expires.

# Brief: production-watch known failures expire and never mask others

- **Requester:** the Strale master (session_01RFNL6WAcqYWJKtyJRfBGCw), 2026-11-11.
  - Source: robustness T3 item (3) in `docs/programs/robustness/tracks.yaml`.
- **Branch:** push only `codex/production-watch-known-failures`. Never push `main`, and never label, approve, merge or comment.
- **Data:** this brief and the repository only, with no secrets. Tests are offline `node --test` tests, like the existing `scripts/production-watch/watch.test.mjs`.
- **Read first:**
  - `scripts/production-watch/watch.mjs`: `production()`, `report()`, `failingJobs()`;
  - `scripts/production-watch/watch.test.mjs`;
  - `.github/workflows/production-watch.yml`;
  - `apps/api/src/lib/job-watch-contract.json`;
  - the `ci.yml` step that runs `node --test scripts/production-watch/*.test.mjs`.

## Why

- **The known failure:** `/health/jobs` reports `ingest-ee-directors` as `ok: false` with `last_success_age_seconds: null`. This is deliberate and known: issue #856 says the job waits until the Estonian registry (RIK) answers.
- **The effect:** that one job makes `production()` throw ("Production probe failed twice consecutively") on every run, about 48 a day.
- **What it hides:** a red production-watch run carries no information, so a new failure in any other job would look exactly the same.

## What to change

### 1. Add a reviewed acknowledgement file

Add `scripts/production-watch/known-failures.json`, a list of entries:

```json
{ "id": "ingest-ee-directors", "issue": 856, "reason": "Waits for RIK to answer; see #856.", "expires": "2026-12-11" }
```

Each entry must pass these rules:
- `id` matches the existing job-id pattern.
- `issue` is a positive integer.
- `reason` is a non-empty string of at most 200 characters.
- `expires` is a `YYYY-MM-DD` date that is at most 45 days after the date the check runs. Refuse a longer horizon, so an acknowledgement must be renewed in review.
- There are no duplicate ids.

An invalid file makes the run fail with a clear message. A missing file means no acknowledgements.

### 2. Apply acknowledgements in `production()`

- **A failing signal whose id is acknowledged and not expired** is still reported to its per-job issue exactly as today, so the issue stays open and counted, but it does not make the run red.
- **An expired acknowledgement** counts as not there: the failure makes the run red again, and the failure message names the expired acknowledgement.
- **Acknowledgements only cover the job named in them:**
  - `http-health`, `job-inventory` and any other job are never covered;
  - an acknowledgement can never cover a signal whose id it does not name exactly.
- **An acknowledgement for a job that is now `ok: true`** should not stay quietly. Emit a GitHub warning annotation (`core.warning` when `core` is passed, otherwise `console.warn`) saying it can be removed. This must not fail the run.
- **Keep everything else unchanged:**
  - the two-strike threshold;
  - issue creation and recovery comments;
  - the state issue;
  - the open-issue sweep that keeps a removed entry's alarm open;
  - `deploy()` and `waitForDeploy`.

### 3. Pass the clock and file in for tests

Take `now` and the acknowledgement list as optional parameters, so the tests do not depend on the real date or file.

### 4. Leave the rest alone

Change nothing else. In particular:
- no workflow schedule change;
- no change to `/health/jobs` or the API.

## Tests (each must fail against origin/main where the behaviour is new)

1. **One acknowledged failure:** the only failing job is acknowledged and not expired. `production()` does not throw, and the job's issue is still reported as failing.
2. **A new failure beside it:** an acknowledged failing job plus another failing job. It throws, and the message or report names the unacknowledged job.
3. **An expired acknowledgement:** it throws, and the message names the expired acknowledgement.
4. **Health and inventory are never covered:** an acknowledgement for `http-health` or `job-inventory` never stops those from making the run red. Either the validator refuses such ids, or `production()` ignores them; choose one and test it.
5. **Validation refuses** a horizon over 45 days, a bad date, a duplicate id, a missing issue, and an over-long reason.
6. **A recovered job:** the acknowledgement is for a job that is now ok. A warning is emitted and the run is not red.
7. **The real file is valid:** the committed `known-failures.json` passes validation with a fixed `now` of 2026-11-11.
8. **Existing tests still pass.**

## Done when

- `node --test scripts/production-watch/*.test.mjs` passes.
- `npm run typecheck` passes. Build `packages/mcp-server` and `packages/sdk-typescript` first.
- `docs/lanes/codex/production-watch-known-failures-report.md` lists:
  - the files changed;
  - each test and what it pins;
  - the commands run, with their results;
  - anything not done.
