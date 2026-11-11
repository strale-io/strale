# Production-watch known failures report

## Files changed

- `scripts/production-watch/known-failures.json` adds the reviewed, dated acknowledgement for `ingest-ee-directors` and issue #856.
- `scripts/production-watch/watch.mjs` validates and loads acknowledgements, keeps acknowledged jobs in normal issue reporting without letting them make the workflow red, restores red status for expired acknowledgements, names blocking signals in the failure, and warns when an acknowledged job recovers.
- `scripts/production-watch/watch.test.mjs` adds the acknowledgement validation and production behavior coverage required by the brief.
- `docs/lanes/codex/production-watch-known-failures-report.md` records this implementation and verification.

No workflow schedule, `/health/jobs` implementation, API code, deployment check, or deploy-wait behavior changed.

## Tests added

1. **An acknowledged failure stays reported without making production red** pins that two failing runs still open the per-job issue while `production()` remains green.
2. **An acknowledged failure never masks a new failing job** pins that a second, unacknowledged job makes the second run throw and is named in the error.
3. **An expired acknowledgement makes production red and is named** pins that expiry restores normal blocking behavior and produces an actionable error.
4. **Health and inventory signals cannot be acknowledged** pins the chosen safeguard: validation rejects `http-health` and `job-inventory` acknowledgements.
5. **Known failure validation rejects unsafe or malformed entries** pins rejection of a horizon over 45 days, an impossible calendar date, a duplicate id, a missing issue, and a reason over 200 characters.
6. **A healthy acknowledged job warns without making production red** pins the `core.warning` removal prompt and non-failing behavior.
7. **The committed known failures file is valid on 2026-11-11** pins the real reviewed file against the brief's fixed clock.
8. The pre-existing production-watch tests continue to pin the two-strike threshold, issue lifecycle, shared state issue, removed-job sweep, endpoint inventory alarm, deploy behavior, and package probe behavior.

## Commands run

- `npm ci` — **warning / did not complete**: dependency installation reached `c2pa-node`'s postinstall, which could not download a test certificate from GitHub because the environment returned `ENETUNREACH`.
- `npm ci --ignore-scripts` — **passed**: installed the locked dependency tree without the network-dependent package postinstall. npm reported the repository's existing engine and audit warnings.
- `node --test scripts/production-watch/*.test.mjs` — **passed**: 37 tests passed, 0 failed.
- `npm run build --workspace=packages/mcp-server` — **passed**.
- `npm run build --workspace=packages/sdk-typescript` — **passed**.
- `npm run typecheck` — **passed** across the API, API scripts, TypeScript SDK, LangChain, Semantic Kernel, MCP server, AI SDK, and CLI workspaces.
- `git diff --check` — **passed**.

## Anything not done

- The network-dependent `c2pa-node` postinstall did not run; it is unrelated to production-watch and was bypassed with `npm ci --ignore-scripts` so the specified offline tests and builds could run.
- No production probe was run, because the brief limits data to the repository and specifies offline tests.

## Claude review round (2026-11-11)

The independent read-only review of bad9263a gave **GO**. Its mutation runs confirmed that the masking, expiry and validation tests discriminate.

### Fixed here

- **Warning annotation:** the workflow now calls `production(github, context, undefined, { core })`, so the "now healthy, acknowledgement can be removed" warning appears as a GitHub annotation, not a log line. The workflow-reachability test's expected call is updated to match.
- **Committed-file test:** it now validates against today's date, not a date pinned to 2026-11-11. A legitimate renewal after 2026-12-26 is therefore not rejected.
- **New tests:**
  - an acknowledgement still covers its expiry day (UTC);
  - an acknowledgement covers only its exact job id; a near-miss id does not mask.
- **Pre-existing bug, found by the review:**
  - **What happened:** when the open-issue listing failed after `/health/jobs` was read, `job-inventory` was pushed twice, once `ok:true` and then once `ok:false`. The first reset the counter on every run, so a persistent GitHub listing failure never turned the run red.
  - **Fix:** the catch block now marks the existing entry `ok:false` instead of adding a second one.
  - **Test:** "a failing issue listing alarms once as job-inventory instead of resetting itself".
- **Fail-before, checked by mutation:** the listing-failure test fails with the old double push, and the expiry-day test fails with an exclusive expiry.

### Commands

- `node --test scripts/production-watch/*.test.mjs`: 40 passed, 0 failed.
