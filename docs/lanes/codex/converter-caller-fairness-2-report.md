# Converter caller fairness round-2 report

## Fixes

1. **Fair queue admission and dispatch** — `apps/api/src/capabilities/lib/readability-convert.ts` now admits every page while capacity remains, evicts the newest queued page from an overrepresented keyed caller when a full queue can fairly admit a new caller, and dispatches caller buckets by bounded least-recently-served order. Unkeyed pages remain non-evicting and non-evictable. `apps/api/src/capabilities/lib/readability-convert.test.ts` covers a five-page single-caller batch, A×5/B eviction and next dispatch, A/B/C/A round-robin order, unkeyed behavior, and fake-timer cleanup of an evicted page.
2. **Cooldown only for time and memory limits** — quick worker `tooComplex` replies now release normally; timer and out-of-memory paths alone create cooldowns. The converter tests submit the same caller immediately after a quick `tooComplex` reply and retain timeout/OOM path coverage.
3. **Settlement-order anchor** — `apps/api/src/routes/x402-gateway-v2.settlement-order.test.ts` anchors the solution assertion on the real `() => executeSolution(sol.id` call rather than the earlier comment.
4. **Pre-fetch cooldown refusal** — `assertConverterAvailableForCaller()` is exported from `readability-convert.ts` and called by `apps/api/src/capabilities/url-to-markdown.ts` after URL input validation but before policy/robots/plain/rendered fetches. `url-to-markdown-parse-bound.test.ts` proves both mocked fetch paths remain untouched.
5. **IPv6 /64 caller keys** — `apps/api/src/lib/caller-scope.ts` provides the single `callerKeyForRequest()` helper using `trialRateBucket()` and `hashIp()`. `/v1/do` derives its anonymous key from the client IP rather than the stored full-IP hash, and both x402 routes use the same helper. `caller-scope.test.ts` covers same/different IPv6 /64s, IPv4, unknown addresses, and raw-IP exclusion.
6. **Tests and wording** — cooldown wording and retry seconds derive from `CONVERSION_LIMITS`; converter test cleanup restores the worker factory in the test-framework `afterEach` finalizer; production-duration fake timers cover cooldown; the tests cover success, refusal, timeout, crash, stop, OOM, queue expiry, and bounded cooldown bookkeeping.

## Commands and results

- `npm install --ignore-scripts` — passed (1,051 packages installed); npm reported existing engine warnings and 61 audit findings.
- `npm --workspace=packages/mcp-server run build` — passed.
- `npm --workspace=packages/sdk-typescript run build` — passed.
- `npm run typecheck` — passed across the API, scripts, SDK, integrations, MCP server, AI SDK and CLI.
- `cd apps/api && npx vitest run src/capabilities/lib/readability-convert.test.ts` — passed, 25 tests.
- `cd apps/api && npx vitest run src/capabilities/lib/readability-convert.test.ts src/lib/caller-scope.test.ts src/routes/x402-gateway-v2.settlement-order.test.ts src/lib/refusal-consistency.test.ts` — passed, 65 tests (before the final additional fairness cases; the converter-only rerun above covers those).
- Required focused command (`readability-convert`, `url-to-markdown`, caller-scope, invocation-facts, retry parity, settlement order, refusal consistency) — 102 passed and one pre-existing performance-timing assertion failed: the untouched 16 MiB event-loop test measured 935 ms against its 500 ms wall-clock bound. A standalone rerun of that file again produced 7 passes and the same timing-only failure (665 ms). The functional result and word-count assertions passed. The round-1 report records this same test as timing-sensitive, and the review brief says its earlier timing failures did not reproduce during independent review.
- `git diff --check` — passed.

## Not done

- No global limit, worker implementation, URL-to-Markdown output/fetch rule, or price was changed.
- The required focused suite did not finish fully green because of the existing timing-sensitive event-loop assertion described above; no threshold or unrelated production behavior was changed to mask it.
