Intent: Codex builder brief: one caller can no longer keep the single page converter (url-to-markdown) busy for everyone else.

# Brief: the page converter serves callers fairly

- **Requester:** the Strale master (session_01RFNL6WAcqYWJKtyJRfBGCw), 2026-11-11.
  - Source: robustness T1 remainder in `docs/programs/robustness/tracks.yaml` ("per-caller fairness in the single converter").
- **Branch:** push only `codex/converter-caller-fairness`. Never push `main`, and never label, approve, merge or comment.
- **Data:** this brief and the repository only, with no secrets. Every test runs offline with the existing worker-factory test hook; no network, no database.
- **Read first:**
  - `apps/api/src/capabilities/lib/readability-convert.ts`: the one-worker converter, its queue (`maxQueued: 4`, `maxQueueWaitMs: 13_000`) and `ConversionBusyError`;
  - `apps/api/src/capabilities/lib/readability-convert.test.ts` and `apps/api/src/capabilities/url-to-markdown-parse-bound.test.ts`;
  - `apps/api/src/lib/call-cost.ts` and `apps/api/src/lib/paid-call-guard.ts`: the AsyncLocalStorage pattern this repository already uses for per-call scope;
  - `apps/api/src/lib/do/dispatch.ts`: `executeWithRetry` and `InvocationActor` (anonymous or account), and its four call sites;
  - `apps/api/src/lib/do/batch.ts`, `apps/api/src/routes/x402-gateway-v2.ts` (around `getExecutor(cap.slug)`), `apps/api/src/lib/solution-executor.ts`;
  - `apps/api/src/lib/middleware.ts` (`getClientIp`, `hashIp`) and `apps/api/src/lib/client-ip.ts`.

## Why

url-to-markdown is free-tier and keyless. The converter runs one page at a time (memory on a 1 GB box allows no more), each page up to 8 s, and holds at most 4 waiting pages. One caller can fill all 5 positions with pages built to take 8 s each. Every other caller is then refused with "busy" or waits up to 13 s. Executors do not know who is calling, so the converter cannot tell one caller's fifth page from five callers' first.

## What to change

1. **Caller scope:** a new `apps/api/src/lib/caller-scope.ts`.
   - `runAsCaller<T>(key: string, fn: () => Promise<T>): Promise<T>` and `currentCallerKey(): string | null`, on an AsyncLocalStorage, like `call-cost.ts`.
   - The key is opaque and never holds a raw IP, an email or an API key:
     - `acct:<userId>` for an account;
     - `ip:<hashIp(ip)>` for an anonymous caller, using the existing `hashIp`; if the IP is `"unknown"`, the key is `ip:unknown` (all unknown-IP callers share one bucket);
     - `x402:<payer address, lower-cased>` for an x402 call where the payer is known, else `ip:<hash>` of that request.
   - A nested `runAsCaller` keeps the outer key, so a solution step or a capability calling another capability stays with the original caller.
2. **Set it on every customer rail**, around the executor call, not deeper:
   - `/v1/do` through `executeWithRetry` in `lib/do/dispatch.ts`. The anonymous actor needs the hashed IP: extend `InvocationActor`'s anonymous variant with the key, computed where the route already reads the client IP, rather than reading the request inside the executor.
   - `/v1/do` batch (`lib/do/batch.ts`), the x402 gateway, and the solution executor (which inherits from its route).
   - Internal tests, health probes, CI and scripts set no key.
3. **Fair converter** in `readability-convert.ts`:
   - **One page per caller in the converter at a time.** A caller with a page already waiting or converting gets `ConversionBusyError` at once for another page. It is non-billable, like today's refusal.
   - **Cool-down after a limit.** When a caller's page hits the time or memory limit (`HtmlTooComplexError`), that caller's next pages are refused for `callerCooldownMs: 30_000`. Use a distinct error class extending `ResourceLimitError`, also non-billable, with a plain message saying to retry in 30 seconds. Name no internals.
   - Pages with no caller key (tests, scripts) keep today's behaviour: global limits only.
   - Bound the per-caller bookkeeping. At most 10,000 cool-down entries; expired ones are dropped on access, and the oldest is evicted past the cap. Entries free when a page finishes, by any path: success, refusal, time-out, crash, `stopConversionWorkers`.
   - The global limits (`workers: 1`, `maxQueued: 4`, the timeouts) stay as they are.
   - Log refusals as today, with the reason, and never the key or the URL.
4. **Check where the free-tier refusal lands.** Confirm that a `ConversionBusyError` from the converter is still answered as a non-billable, retryable refusal on every rail, and that the new cool-down error is answered the same way. Find where `ResourceLimitError` is mapped today and make sure the subclass follows it. Do not add a new mapping if the base class already covers it.
5. **No change** to url-to-markdown's output, its fetch path, the worker, or any price.

## Tests (offline; each must fail against origin/main)

1. **Same caller, second page refused:** under `runAsCaller("ip:a")`, while one page is held in a fake worker, a second page is refused at once with `ConversionBusyError`. Under `runAsCaller("ip:b")` a page is still queued.
2. **Others are not starved:** caller A sends 5 pages at once, then caller B sends 1. B's page is queued and served next after A's first, not refused.
3. **Cool-down:** caller A's page times out (fake worker never answers; use fake timers). A's next page within 30 s is refused with the cool-down error; after 30 s it is accepted. Caller B is unaffected throughout.
4. **Bookkeeping frees on every path:** after success, refusal, time-out, worker crash and `stopConversionWorkers`, the same caller can submit again (apart from the cool-down after a time-out or out-of-memory).
5. **Bounded map:** 10,001 distinct callers in cool-down leave at most 10,000 entries.
6. **No key keeps today's behaviour:** without `runAsCaller`, five concurrent pages are handled exactly as on origin/main.
7. **Scope wiring:**
   - an anonymous `/v1/do` free-tier call and an account call each run their executor with the expected key shape (`ip:` or `acct:`);
   - nesting keeps the outer key;
   - no key contains the raw IP.
   Use the existing route tests' helpers where they exist; a unit test on `executeWithRetry` is enough if the route harness needs a database.
8. **Existing tests still pass**, including the R1 converter tests.

## Done when

- `cd apps/api && npx vitest run src/capabilities/lib/readability-convert src/capabilities/url-to-markdown` passes, plus any test file you add.
- `npm run typecheck` passes. Build `packages/mcp-server` and `packages/sdk-typescript` first.
- The full `npx vitest run` in `apps/api` passes. Report every failing file, and whether it also fails on origin/main.
- `docs/lanes/codex/converter-caller-fairness-report.md` exists and lists:
  - the files changed, and every rail where the key is set, with the line;
  - each test and what it pins;
  - the commands run, with their results;
  - anything in this brief you could not do, and why.
