Intent: Codex builder brief: forex-history moves from Frankfurter v1 to Frankfurter v2's blended time series, through the shared lib/fx module.

# Brief: forex-history on Frankfurter v2

- **Requester:** the Strale master (session_01RFNL6WAcqYWJKtyJRfBGCw), 2026-11-08. This follows strale-io/strale#976, which moved `exchange-rate` and `currency-convert` to `apps/api/src/lib/fx/`.
- **Branch:** push only `codex/forex-history-v2`. Never push `main`, and never label, approve, merge or comment.
- **Data:** this brief and the repository only, with no secrets. **All tests run offline** with mocked `safeFetch`. Never reach the network from a test.
- **Read first:**
  - `apps/api/src/capabilities/forex-history.ts`
  - `apps/api/src/lib/fx/rates.ts`, `resolve.ts` and their tests
  - `apps/api/src/lib/vendor-terms.data.json` (the Frankfurter record)
  - `apps/api/src/lib/vendor-terms.test.ts`
  - `apps/api/src/capabilities/fx-unsupported-currency.test.ts`
  - `manifests/forex-history.yaml`
  - `apps/api/src/lib/body-reader-baseline.json`

## Why

`forex-history` failed 19 paid calls in the 7 days to 2026-11-07. The causes were Frankfurter v1 (`api.frankfurter.app`) answering 522, and currency pairs v1 does not publish, since v1 carries only ECB currencies.

The executor has three further problems:
- it calls bare `fetch`, so it bypasses `safeFetch`'s SSRF guard and size cap;
- it reads the body raw (one entry in the body-reader baseline);
- its manifest records `checks: pending`.

Frankfurter v2's blended rate covers about 108 central banks and is the source already recorded in `vendor-terms.data.json`.

## The v2 endpoint (checked live by the master on 2026-11-08)

- **Request:** `GET https://api.frankfurter.dev/v2/rates?base={FROM}&quotes={TO}&from={start}&to={end}`
- **Success:** 200 with a JSON **array** of `{"date","base","quote","rate"}`, one per day.
  - The blend can include weekend dates; for example, 2026-11-01 was present.
  - A range with no data returns `[]`.
- **Unknown code:** 422 `{"status":422,"message":"invalid currency: XYZ"}`.
- **Terms:** use the blended endpoint only, never `providers=`. These are the same terms as the existing record: "Blended rates are Frankfurter's own calculation and free to use."

## What to change

1. **In `apps/api/src/lib/fx/rates.ts`, add `getFrankfurterSeries(base, quote, start, end)`:**
   - Fetch the endpoint above through `safeFetch` with `acquisitionMethod: "vendor_api"`, a 10 s timeout, and a body cap via `readJsonWithLimit` (pick a cap that fits five years of daily points with room to spare, and state it).
   - Validate the answer: it must be an array. Every element needs `base`/`quote` equal to the request, a `date` in `YYYY-MM-DD` form within the range, and a positive finite `rate`. Anything else is an upstream error worded so that both classifiers call it upstream; reuse the "… service unavailable: …" phrasing `rates.ts` already uses.
   - On a 404 or 422, throw `FxCurrencyUnavailableError`. Discard the body of any other error status.
   - Leave it uncached; ranges vary.
2. **In `apps/api/src/capabilities/forex-history.ts`, use `getFrankfurterSeries`.** No direct `fetch` and no raw body read remain.
   - **Keep the input handling:** the `from`/`to` and `from_currency`/`to_currency` aliases, the defaults, and the date-format and order refusals.
     - Also refuse a code that is not `[A-Z]{3}` (`inputRefusal`, naming the field). The current code sends anything to the API.
   - **Refuse a range longer than 1,827 days (five years)** before any fetch, with an `inputRefusal` naming `start_date`. Add the limitation to the manifest.
   - **When the code is unknown,** name the right field with `getFrankfurterCurrencies()`, exactly as `resolve.ts` does, and keep the `fx-unsupported-currency.test.ts` contract.
   - **An empty series** (`[]`) is a refusal naming `start_date`: "no published rates in this range". The current plain error counts it against the tool.
   - **Output shape unchanged:**
     - `from_currency`, `to_currency`, `start_date`, `end_date`;
     - `rates` as `{date, rate}[]` sorted by date;
     - `average`, `min`, `max`, `change_percent` and `data_points`, with today's rounding.
     - **Add** `rate_source: "Frankfurter blended central-bank rate"`, and `provenance.attribution`: "Source: Frankfurter (blended central-bank rates, frankfurter.dev)".
   - `provenance.source` becomes `"frankfurter.dev"`, with `acquisition_method: "vendor_api"`, `data_access_lane: "allowed_with_checks"` and `upstream_vendor: "Frankfurter"`. **Do not set `data_access_checks` yourself**; stamping derives it.
   - **`from === to`:** return the series without a fetch. Each calendar day in the range gets rate 1, with `rate_source: "identity"` and `provenance.source: "identity"`, `acquisition_method: "computed"` and `data_access_lane: "not_applicable"`. The output shape is otherwise the same. This mirrors the identity rule in `exchange-rate`.
3. **`manifests/forex-history.yaml`:**
   - **`data_source`:** "Frankfurter blended central-bank rates (frankfurter.dev v2)".
   - **`data_access`:** `lane: allowed_with_checks`, `acquisition_method: vendor_api`, `upstream_vendor: Frankfurter` (capitalised, matching the record and the other two manifests), `checks: recorded`, and a `checks_note` like the other two.
   - **Limitations:**
     - Replace the ECB-only wording with: "Daily blended central-bank rates; dates can include weekends where a contributing central bank publishes; no intraday data."
     - Add the five-year range limit.
   - **`output_field_reliability`:** add `rate_source` as guaranteed.
4. **`apps/api/src/lib/vendor-terms.data.json`:**
   - Add `forex-history` to the Frankfurter record's `capabilities`.
   - Add a finding: "The time series endpoint (/v2/rates with from/to) is the same blended calculation; called from lib/fx/rates.ts."
   - Keep `url_prefixes` as `["https://api.frankfurter.dev/v2/rate/"]`, unless `vendor-terms.test.ts` then fails to see `forex-history` as a caller. In that case, state in the report exactly what the test needed and what you changed.
5. **`apps/api/src/lib/body-reader-baseline.json`:**
   - Remove the `capabilities/forex-history.ts` entry.
   - Lower the total asserted in `apps/api/src/lib/body-reader-ratchet.test.ts` by 1, from 219 to 218, unless a different count is the truth. Report it.
6. **Do not** touch `exchange-rate`, `currency-convert`, `data-access.ts`, the classifiers or the replay helper.
   - The replay fixture `apps/api/src/capabilities/__fixtures__/upstream/forex-history.json` will be stale. Leave it for the master to re-record live, since this task has no network. Say so in the report.
   - If `upstream-replay-contract.test.ts` fails for `forex-history` because of that, report it. Do not edit the test or the fixture.

## Tests (offline; each must fail against origin/main)

1. A USD→EUR range parses into the same `rates`, `average`, `min`, `max`, `change_percent` and `data_points` as today's arithmetic, from a fixture array.
2. NGN→KWD works, which v1 could not do.
3. A 422 for XYZ refuses the right field. Two non-ECB codes, where one is unknown, name the right one. With the list unavailable, the refusal names both.
4. `[]` gives a refusal naming `start_date`, not a plain error.
5. A range over 1,827 days is refused with no fetch.
6. A non-`[A-Z]{3}` code is refused with no fetch.
7. A malformed element in the answer is an upstream error in both classifiers: a quote mismatch, rate 0, a bad date, or an object instead of an array. A 503 is too.
8. `from === to` makes no fetch and gives identity provenance.
9. Provenance on a normal answer has no `data_access_checks` set by the executor. After stamping with the manifest's `data_access`, it is `"recorded"`.

## Done when

- **Tests:** `cd apps/api && npx vitest run src/capabilities/forex-history src/capabilities/fx-unsupported-currency src/lib/fx src/lib/vendor-terms src/lib/data-access src/lib/body-reader-ratchet` passes (`data-access` includes `data-access-manifests`).
  - Also run the full `npx vitest run` in `apps/api` once. Report every failing file. The only failure expected is the stale `forex-history` replay fixture.
- **Checks:** `npm run typecheck`, `npm run refdata:check` and `npm run vendor-terms:check` pass.
- **Report:** `docs/lanes/codex/forex-history-v2-report.md` gives:
  - the files changed;
  - the validation rules;
  - the body cap chosen;
  - each test and what it pins;
  - the exact test commands run, with their results;
  - anything not done.
