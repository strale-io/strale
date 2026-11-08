Intent: Codex builder brief: exchange-rate and currency-convert cache the ECB's daily reference rates and cover non-ECB currencies through Frankfurter's blended central-bank rate.

# Brief: the exchange-rate tools stop timing out and cover the currencies buyers ask for

- **Requester:** the Strale master (session_01RFNL6WAcqYWJKtyJRfBGCw), 2026-11-08. The source comes from the daily run's paying-failure sweep (`handoff/_general/from-code/2026-11-07-checkin-morning.md`, "Next session" item 5).
- **Branch:** push only `codex/fx-rates-coverage`. Never push `main`, and never label, approve, merge or comment.
- **Data:** this brief and the repository only. There are no secrets in it, and none is needed, since both sources are keyless. **All tests run offline** with mocked `fetch`/`safeFetch`. Never reach the network from a test.

## Why

In the 7 days to 2026-11-07, paid calls failed as follows:

| Tool | Failed paid calls | Why |
|---|---|---|
| `exchange-rate` | 108 | 31 timeouts; the rest were currencies the ECB does not publish, for example NGN, KWD, KES, BDT, JOD, BHD, AED |
| `currency-convert` | 36 | Same pattern |

The two causes:

1. **Timeouts.** Both executors call `data-api.ecb.europa.eu` once per currency, and twice for a cross rate, on **every** request, each with a 10 s timeout. The ECB publishes these reference rates once a day, around 16:00 CET on working days. Per-call fetching adds latency and failure for no fresher data.
2. **Coverage.** The ECB publishes about 29 currencies against EUR. Since #964-era work, a currency outside that list returns a refusal, which is honest but turns away buyers who ask for common currencies.

## Sources (terms checked by the master on 2026-11-08; do not substitute others)

- **ECB euro foreign exchange reference rates.**
  - Endpoint: one daily file, `https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml`.
  - Terms: the ECB disclaimer's copyright section allows reuse on two conditions: "the ECB must be cited as the source", and a reproduction must be accurate.
  - Lane: `preferred`, `direct_api`, the same as today.
- **Frankfurter v2 blended rate.**
  - Endpoint: `https://api.frankfurter.dev/v2/rate/{BASE}/{QUOTE}`, which returns `{"date","base","quote","rate"}`.
  - Coverage: it blends rates published by about 108 central banks and the IMF. Its `/v2/currencies` lists NGN, KWD, KES, BDT, JOD, BHD and AED.
  - Terms: `https://frankfurter.dev/license/` says "Blended rates are Frankfurter's own calculation and free to use. Direct queries to individual provider endpoints remain subject to each provider's terms." Use **only** the blended endpoint, never `providers=`.
  - Robots: `robots.txt` reads `Allow: /`.
  - Not used: ExchangeRate-API's open endpoint (its terms forbid redistribution) and the fawazahmed0 files (upstream not named).

## What to change

1. **A shared module**, for example `apps/api/src/lib/fx/rates.ts`, used by both `exchange-rate.ts` and `currency-convert.ts`. Remove the duplicated `fetchEcbRate` copies.
   - **`getEcbReferenceRates()`:**
     - fetches `eurofxref-daily.xml` through `safeFetch`, with a 5 s timeout and a size cap reusing `resource-limits.ts` helpers;
     - parses it into `{ date, rates: Map<code, perEUR> }`, with EUR = 1;
     - keeps it in memory for 1 hour, with one shared in-flight fetch;
     - on a failed refresh, keeps serving the last good copy for up to 4 days (a weekend plus a holiday), and says so in the output;
     - when there is no good copy at all, throws an upstream error.
   - **`getFrankfurterRate(base, quote)`:**
     - calls the blended endpoint above through `safeFetch`, with a 5 s timeout and a size cap;
     - caches per pair for 1 hour;
     - treats an answer whose `rate` is not a positive finite number, or whose `base`/`quote` do not match the request, as a failure.
2. **Choosing a source for each request:**
   - Both currencies on the ECB list (EUR counts): answer from the cached ECB file, computing the cross rate through EUR exactly as today. `provenance.source` is `"ecb.europa.eu"`.
   - Either currency not on the ECB list: answer the pair from Frankfurter. `provenance.source` is `"frankfurter.dev"`. **Never mix the two sources in one answer.**
   - **Frankfurter answers 404 or 422 for an unknown currency:** keep today's refusal shape (`inputRefusal`, the field named), reworded as "has no published reference rate". The existing `fx-unsupported-currency.test.ts` contract (caller_input, user-input error, names the code) must still hold.
   - **Either source times out or returns a 5xx:** an upstream error, not a refusal.
3. **Output:**
   - Keep every existing field and its rounding.
   - Add:
     - `rate_source`: `"ECB euro reference rate"` or `"Frankfurter blended central-bank rate"`;
     - `rate_date`, the source's own date. Keep `date` as it is today for compatibility.
     - `stale: true` only when the ECB copy is older than its next expected publication. Leave it absent otherwise.
   - `provenance` gains `attribution`. For ECB answers that is "Source: European Central Bank (euro foreign exchange reference rates, available free of charge at ecb.europa.eu)". For Frankfurter answers it is "Source: Frankfurter (blended central-bank rates, frankfurter.dev)".
   - The data-access block in each manifest:
     - ECB answers stay `preferred`/`direct_api`;
     - the Frankfurter path is `allowed_with_checks`, using the vocabulary in `apps/api/src/lib/data-access.ts`;
     - pick the acquisition method, `upstream_vendor` and `checks` values that file's validator accepts for a vendor API whose terms permit reuse, and explain the choice in the report.
4. **Manifests** (`manifests/exchange-rate.yaml`, `manifests/currency-convert.yaml`):
   - **`data_source`:** "European Central Bank daily reference rates; Frankfurter blended central-bank rates for currencies the ECB does not publish".
   - **Remove the false limitation** "Rates updated every hour during market hours". The ECB publishes once a working day. Replace it with: "ECB reference rates are published once per working day around 16:00 CET; other currencies use Frankfurter's daily blend of central-bank rates, which can lag a day."
   - **Keep** the bank-spread limitation.
   - **Add `output_field_reliability`** for `rate_source` and `rate_date` (guaranteed) and for `stale` (rare).
5. **Vendor-terms register** (`apps/api/src/lib/vendor-terms.data.json`). Add a Frankfurter record:
   - hosts: `api.frankfurter.dev`;
   - `url_prefixes` limited to `https://api.frankfurter.dev/v2/rate/`;
   - capabilities: `exchange-rate` and `currency-convert`;
   - resale: `permitted`; basis: `published_terms`;
   - terms_url: `https://frankfurter.dev/license/`; accessed: `2026-11-08`;
   - findings: the two quoted sentences above, plus "blended endpoint only; provider endpoints are out of scope";
   - decision_ref: `DEC-20261023-A`.

   Then run `npm run vendor-terms:check`, or the register test under `apps/api/src/lib/vendor-terms*.test.ts`. If its rules need fields this brief does not give, fill them from the facts above and say so in the report.
6. **Out of scope:**
   - `forex-history.ts`, which uses Frankfurter v1 at `api.frankfurter.app` (a separate change);
   - no new vendor beyond Frankfurter;
   - no paid API;
   - no retry loops.

## Tests (offline; each must fail against `origin/main`)

1. Two ECB-pair calls within the hour cause one `eurofxref-daily.xml` fetch, and no `data-api.ecb.europa.eu` call ever happens.
2. EUR→USD, USD→EUR and USD→SEK (a cross rate) match today's arithmetic and rounding on a fixture XML.
3. EUR→NGN and NGN→KWD go to Frankfurter, with `provenance.source` `frankfurter.dev`, `rate_source` set, and no ECB value mixed in.
4. A Frankfurter 404 for an unknown code (`XYZ`) gives the refusal, and `fx-unsupported-currency.test.ts` still passes. Update its mocks to the new endpoints if needed, but keep its assertions.
5. A Frankfurter timeout or 503 gives an upstream error, not a refusal.
6. ECB refresh fails while a good copy is under 4 days old: the call is served from that copy, with `stale` reflecting age. When there is no good copy, the call fails with an upstream error.
7. A Frankfurter answer with a mismatched `quote`, or `rate: 0`, is refused as a source failure.
8. An oversized ECB XML is capped and fails cleanly.
9. `currency-convert` multiplies `amount` by the same rate as `exchange-rate` for the same pair.

## Done when

- `cd apps/api && npx vitest run src/capabilities/exchange-rate src/capabilities/currency-convert src/capabilities/fx-unsupported-currency src/lib/fx src/lib/vendor-terms` passes. Use whichever of these paths exist, and name new test files after their module.
- `npm run typecheck` passes. Build `packages/mcp-server` and `packages/sdk-typescript` first if typecheck needs them.
- `npm run refdata:check` passes, and `npm run vendor-terms:check` passes if that script exists.
- `docs/lanes/codex/fx-rates-coverage-report.md` lists:
  - the files changed;
  - the source-selection rules;
  - the data-access values chosen and why;
  - each test and what it pins;
  - anything not done.
