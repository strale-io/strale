Intent: Codex builder brief: review fixes for domain-age-rdap (round 2).

# Brief: domain-age-check review fixes

- **Requester:** the Strale master (session_01RFNL6WAcqYWJKtyJRfBGCw), 2026-11-08. This brief follows an independent review of `codex/domain-age-rdap` at 90ba9baf, verdict FAIL.
- **Branch:** push only `codex/domain-age-rdap-2`. It starts from `codex/domain-age-rdap`. Never push `main`, and never label, approve, merge or comment.
- **Data:** this brief and the repository only, with no secrets. All tests run offline, with mocked `safeFetch` and a mocked socket.
- **Read first:**
  - `docs/lanes/codex/domain-age-rdap-brief.md` (the original brief);
  - `docs/lanes/codex/domain-age-rdap-report.md` (your report);
  - the diff `git diff origin/main...HEAD`.

## Fix these

1. **Reset and refused failures must stay retryable and upstream-attributed.** The original brief asked to remove the raw `ECONN*` tokens, and that also removed what three shared modules match on.
   - **What breaks today:** `WHOIS registry whois.nic.io failed: connection reset` now classifies as `unclassified` / `unknown` and is never retried. `read ECONNRESET` was `upstream` / `upstream_transient` and was retried once.
   - **The fix:** add `/connection (reset|refused)/i` to all three:
     - `DEFAULT_RETRYABLE` in `apps/api/src/lib/retry.ts`;
     - `UPSTREAM_TRANSIENT_PATTERNS` in `apps/api/src/lib/failure-classifier.ts`;
     - `UPSTREAM_RE` in `apps/api/src/lib/transaction-failure-taxonomy.ts`.
   - Add the phrase **beside** the existing patterns. Do not reorder or remove any pattern.
   - **Tests:** extend `retry.test.ts`, `failure-classifier.test.ts` and `transaction-failure-taxonomy.test.ts`. Each must show that three messages classify as upstream/transient and are retryable:
     - `WHOIS registry whois.nic.io failed: connection reset`;
     - the `connection refused` form;
     - the combined RDAP-plus-WHOIS form.
   - Each new test must fail without the pattern.
2. **Do not hide an RDAP failure when the TLD has no WHOIS fallback.** See `domain-age-check.ts` near the `if (!server)` branch.
   - **What breaks today:** suppose the TLD is in the RDAP bootstrap but not in `TLD_SERVERS` (for example `.xyz`). An RDAP 5xx, timeout, oversized body or missing registration event then returns a **success** carrying `error: "WHOIS server not available…"`, and `rdapFailure` is discarded.
   - **The fix:** when `rdapFailure` is set and there is no WHOIS server, throw `rdapFailure`.
   - **Keep unchanged** the old success-with-`error` output for a TLD where neither path exists, meaning no RDAP base and no WHOIS server.
   - **Test:** `.xyz` with RDAP 503 throws, and the message names the RDAP host and `HTTP 503`.
3. **Name the real transport failure in `transportFailure`.**
   - fetch wraps socket errors as `TypeError("fetch failed")` with the code in `error.cause.code`. Read `cause.code` too, so that `ECONNRESET`, `ECONNREFUSED` and `ETIMEDOUT` under `cause` map to "connection reset", "connection refused" and "timeout".
   - Map `ResourceLimitError` (from `apps/api/src/lib/resource-limits.ts`) to "response too large".
   - **Tests:** one for each mapping.
4. **The bootstrap cache shares one in-flight fetch and remembers a failure briefly** (`apps/api/src/lib/rdap/domain.ts`).
   - Concurrent first calls await one shared promise.
   - A failed bootstrap is remembered for 60 s. During that time calls go straight to WHOIS without waiting on IANA, and after it the next call retries the fetch.
   - **Tests:**
     - two concurrent calls → one bootstrap fetch;
     - a failure, then a second call within 60 s → no second fetch;
     - after 60 s, with fake timers → one new fetch.
5. **Make two tests discriminate.** "bootstrap fails → WHOIS" and "unsupported TLD" pass against the old executor. Make them also assert what only the new code produces, such as `provenance.upstream` and the exact `provenance.source`, so that each fails against `origin/main`'s executor.

**Leave as is (accepted):** `sanitizeFailureReason` masks registry hostnames as `[service]` in caller-facing text. Operators still see the raw text in `transactions.error`. Do not change `sanitize.ts`.

## Done when

- Tests pass: `cd apps/api && npx vitest run src/capabilities/domain-age-check src/capabilities/whois-response-cap src/lib/sanitize src/lib/retry src/lib/failure-classifier src/lib/transaction-failure-taxonomy`.
- `npm run typecheck` passes. Build `packages/mcp-server` and `packages/sdk-typescript` first, if typecheck needs them.
- `npm run refdata:check` passes.
- Append a "Round 2" section to `docs/lanes/codex/domain-age-rdap-report.md`. It covers each fix above with its test name and anything not done.
