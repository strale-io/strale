Intent: stop `exchange-rate` and `currency-convert` from timing out, and serve the currencies the ECB does not publish.

In the 7 days to 2026-11-07 the two tools lost 144 paid calls: 108 on `exchange-rate` (31 of them timeouts) and 36 on `currency-convert`.

[BACKFILL] Cloud session; no Notion write was made.

## Sources (terms checked 2026-11-08)

- **ECB daily reference rates** (`eurofxref-daily.xml`): reuse is allowed with the ECB cited as the source.
  - **Open:** the ECB's reuse terms do not say whether reselling the rates per call through an API counts as a "sold document". Strale already did this before the change, so nothing new is exposed.
- **Frankfurter v2 blended rate** (`/v2/rate/{BASE}/{QUOTE}`): its terms say "Blended rates are Frankfurter's own calculation and free to use." It is recorded in `vendor-terms.data.json`. Confidence that this permits Strale's use: moderate. The underlying central banks' terms were not read one by one.
- **Rejected:**
  - ExchangeRate-API: its terms forbid redistribution.
  - fawazahmed0: the data's upstream is not named.

## How it was built

- **Codex runs:**
  - `fx-rates-coverage`, 6333362f: review verdict FAIL. The CI suite was red, and `stampDataAccess` had been loosened.
  - `fx-rates-coverage-2`, 54480de4: all five fixes correct, but the full suite still had 5 failures.
- **Claude commit fa51ce43:**
  - re-recorded the replay fixtures live;
  - fixed the single-quote gap in the XML perturbation and added a `skew` perturbation;
  - lowered the body-reader baseline;
  - added the NaN route;
  - validated the currency list;
  - made the 4-day window test discriminate.
- **Reviews:** independent, separate-context Claude reviews on every round.

## Still open

- **DB-backed checks:** run `validate-capability` and `smoke-test` for both slugs on the PC.
- **After deploy:**
  - `GET /v1/capabilities/exchange-rate` shows the new `data_source` and limitation.
  - `who-called --slug exchange-rate --days 2 --errors` shows no `ECB API returned HTTP 404 for NGN`-style refusals and fewer timeouts.
- **`forex-history`** still uses Frankfurter v1 (`api.frankfurter.app`). That needs a separate change.
