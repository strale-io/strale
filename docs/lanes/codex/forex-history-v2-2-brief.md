Intent: Codex builder brief: review fixes for forex-history-v2 (round 2).

# Brief: forex-history-v2 review fixes

- **Requester:** the Strale master (session_01RFNL6WAcqYWJKtyJRfBGCw), 2026-11-08. This follows an independent review of `codex/forex-history-v2` at 302b39a7, verdict FAIL.
- **Branch:** push only `codex/forex-history-v2-2`. It starts from `codex/forex-history-v2`. Never push `main`, and never label, approve, merge or comment.
- **Data:** this brief and the repository only, with no secrets. All tests run offline with mocked `safeFetch`.
- **Read first:**
  - `docs/lanes/codex/forex-history-v2-brief.md` and your report;
  - `git diff origin/main...HEAD`.

## Fix these

1. **HIGH: accept the leading point that v2 dates before `from`.**
   - **What v2 does:** when a currency has no rate on the `from` date, v2 starts the series at the last earlier publication. The master checked this live on 2026-11-08 with `GET /v2/rates?base=GBP&quotes=NGN&from=2025-03-01&to=2025-03-04`, which answered `[{"date":"2025-02-28",...},{"date":"2025-03-02",...},{"date":"2025-03-03",...},{"date":"2025-03-04",...}]`. The reviewer saw the same for USD→VES and USD→ARS. A Saturday–Sunday range for VES returned only `[2025-02-28]`.
   - **What breaks today:** `getFrankfurterSeries` (`apps/api/src/lib/fx/rates.ts`, the `point.date < start` check) rejects these as "invalid or mismatched", so the call fails and counts against the tool.
   - **The fix:**
     - Accept points dated before `start`, as long as they are **not after `end`**, and only when they come **first in date order**, ahead of the first point on or after `start`. A point before `start` that appears after an in-range point is still invalid.
     - Keep these points in the series. Frankfurter v1 snapped the start date the same way, so the output matches the old behaviour.
     - Every other validation rule stays as it is.
   - **Manifest:** add a limitation to `manifests/forex-history.yaml`: "When no rate is published on start_date, the series begins with the most recent earlier published rate."
   - **Tests:**
     - The GBP→NGN shape above is accepted and returned in date order.
     - The Saturday–Sunday case returns its single earlier point.
     - A point before `start` placed after an in-range point is rejected as upstream.
     - A date after `end` is rejected as upstream.
     - Replace the `rates.test.ts` case that pinned the old rejection (`{date:"2026-10-31"}`, rejected only for being before `from`).
2. **MEDIUM: refuse an impossible calendar date before calling.**
   - **The problem:** `isIsoDate` in `forex-history.ts` accepts `2026-02-30`, because `Date.parse` rolls it over. v2 then answers 422 "invalid date", and the caller is told a currency is unavailable.
   - **The fix:** a date is valid only when `new Date(\`${value}T00:00:00Z\`).toISOString().slice(0, 10) === value`. An invalid date gives the existing `start_date`/`end_date` refusal.
   - **Tests:** `2026-02-30` as `start_date` and as `end_date` are refused with no fetch. The identity path is refused the same way.
3. **Nit: make the four non-discriminating tests discriminate.**
   - The two 422 `to` cases and the `EURO` case passed against origin/main because origin's bare `fetch` reached the real v1 API. Mock `safeFetch` for them and assert it was or was not called, so they fail against origin's executor. That executor calls the global `fetch`, which the test must stub so that it **throws** if reached.
   - Drop or merge the "recorded checks only from stamping" test into test 1 if it cannot discriminate.
4. **Nit: the `forex-history` case in `apps/api/src/capabilities/fx-unsupported-currency.test.ts` stubs the global `fetch`, which this executor no longer calls directly.**
   - Make it assert its contract through the path the executor really uses. Keep the assertions: refusal, `isUserInputError`, `caller_input`, and the code named.
   - Mock `../lib/safe-fetch.js` for that file only if it does not break the other two slugs' cases there; otherwise split the `forex-history` case into `forex-history.test.ts`.

## Out of scope

The vendor-terms `url_prefixes`. It stays `/v2/rate/`; the record's findings already name the series endpoint.

## Done when

- **Tests:** `cd apps/api && npx vitest run src/capabilities/forex-history src/capabilities/fx-unsupported-currency src/capabilities/upstream-replay-contract src/lib/fx src/lib/vendor-terms src/lib/data-access src/lib/body-reader-ratchet` passes.
- **Build first:** build `packages/mcp-server` and `packages/sdk-typescript` (`npm --workspace=packages/mcp-server run build`, `npm --workspace=packages/sdk-typescript run build`) before the full `npx vitest run` and `npm run typecheck`. Without that build, files importing `strale-mcp/tools` fail for reasons unrelated to this change.
- **Checks:** `npm run refdata:check` and `npm run vendor-terms:check` pass.
- **Report:** append a "Round 2" section to `docs/lanes/codex/forex-history-v2-report.md` with each fix, its test names and the exact commands run.
