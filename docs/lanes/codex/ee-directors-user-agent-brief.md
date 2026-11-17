Intent: Codex builder brief: make the nightly Estonian directors ingest send Strale's honest user agent and stop cleanly, under its own log label, when the registry refuses it.

# Brief: ingest-ee-directors, honest user agent and a distinct blocked outcome

- **Requester:** the Strale master (session_01Ms71ZnJsKfZn5eCYBzr5kL), 2026-11-17, following the production health check of that night.
  - Source: `handoff/_general/from-code/2026-11-17-weather-and-listings.md` ("`ingest-ee-directors` shows ok=false with no recorded success"). Without this copy, `estonian-company-data` answers without legal representatives and says so.
  - This replaces the brief `ee-directors-honest-agent`, whose Codex task ended with no diff. The work is the same, and the test approach below is spelled out because the orchestrator `runIngestOnce` needs Postgres and the existing tests do not fake it.
- **Branch:** push only `codex/ee-directors-user-agent`, cut from `origin/main` at 5a622498. Never push `main`, and never label, approve, merge or comment.
- **Data:** this brief and the repository only. No secrets, no production data, no network in tests, no real names of people.
- **Read first:**
  - `apps/api/src/jobs/ingest-ee-directors.ts` (`headLastModified` near line 193, the download `fetch` inside `runIngestOnce` near line 433, the `catch` that logs `ingest-ee-directors-failed` near line 528);
  - `apps/api/src/jobs/ingest-ee-directors.test.ts` (pure-function tests with vitest);
  - `apps/api/src/lib/site-access.ts` (`STRALE_USER_AGENT`, `isBlockStatus`).

## Background

Production logs show `ingest-ee-directors-failed` with `HEAD https://avaandmed.ariregister.rik.ee/…/ettevotja_rekvisiidid__kaardile_kantud_isikud.json.zip returned HTTP 403` every day since at least 2026-11-07. From a machine outside production the same URL answers 200 to HEAD and 206 to a ranged GET, so the refusal is specific to production's network or request. Neither `fetch` in the job sends a `User-Agent`. DEC-20261023-A requires an honest user agent on Strale's fetches and puts getting around a block in its "never" lane.

## What to build

Change only `apps/api/src/jobs/ingest-ee-directors.ts` and `apps/api/src/jobs/ingest-ee-directors.test.ts`. No manifest, schema, route, migration, environment or job-schedule change.

1. **One fetch helper.** Add and export `fetchUpstream(method: "HEAD" | "GET", timeoutMs: number, fetchImpl = fetch)`. It calls `fetchImpl(UPSTREAM_URL, { method, headers: { "User-Agent": STRALE_USER_AGENT }, signal: AbortSignal.timeout(timeoutMs) })`. When `isBlockStatus(res.status)` is true it throws a new exported error class `EeSourceBlockedError` whose message names the method and the status. Otherwise it returns the response.
2. **Use it on both requests.** `headLastModified` calls `fetchUpstream("HEAD", 15000)` and keeps its current non-ok error for other statuses. The download in `runIngestOnce` calls `fetchUpstream("GET", 120_000)` and keeps its current `!ok || !body` check. Export `headLastModified` and give it the same optional `fetchImpl` parameter, passed through, so it can be tested.
3. **A distinct label.** Add and export `failureLogLabel(err: unknown): string`, returning `"ingest-ee-directors-source-blocked"` for an `EeSourceBlockedError` and `"ingest-ee-directors-failed"` for anything else. The `catch` near line 528 uses it as the `logError` label. The rest of that `catch` (rethrow or result, lease and unlock handling) stays exactly as it is; the next scheduled tick tries once more, which is ordinary scheduling.
4. **Never get around a block.** No proxy, no rotating addresses or user agents, no retry under another identity, no retry inside the run.

## Tests (in `ingest-ee-directors.test.ts`, with a stub `fetchImpl`)

- `fetchUpstream("HEAD", …)` and `fetchUpstream("GET", …)` both send `User-Agent` equal to `STRALE_USER_AGENT` (assert on the stub's recorded init).
- `headLastModified(stub)` sends the header and returns the stub's `last-modified` value (must fail before your change: today no header is sent and the function is not exported).
- A 403 from the stub makes `fetchUpstream` throw `EeSourceBlockedError` for HEAD and for GET; a 500 does not throw `EeSourceBlockedError` (it returns the response for the caller's own check).
- `failureLogLabel` returns the blocked label for an `EeSourceBlockedError` and the generic label for a plain `Error`.
- Every existing test still passes unchanged.

## Done means

- `npm run typecheck` and `npm test` pass.
- Report at `docs/lanes/codex/ee-directors-user-agent-report.md`: the files changed, the fail-before evidence (name the marked test and show it failing before and passing after), the output of `npx vitest run src/jobs/ingest-ee-directors.test.ts` run from `apps/api`, and anything you could not do.
- Run `npm run context:generate` and commit any change it makes.

`Next authorised action: Claude review of codex/ee-directors-user-agent | Owner: Strale master | Blocker: none`
