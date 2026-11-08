# forex-history v2 implementation report

## Files changed

- `apps/api/src/lib/fx/rates.ts` and `rates.test.ts`: uncached Frankfurter v2 series client and validation tests.
- `apps/api/src/capabilities/forex-history.ts` and `forex-history.test.ts`: shared-client execution, input/range/empty/currency refusals, identity series, v2 output/provenance, and offline tests.
- `manifests/forex-history.yaml`: v2 source, recorded checks, blended-rate and five-year limitations, and guaranteed `rate_source`.
- `apps/api/src/lib/vendor-terms.data.json`: added the capability and time-series finding. The existing `url_prefixes` value was sufficient for `vendor-terms.test.ts`, so it remains `https://api.frankfurter.dev/v2/rate/`.
- `apps/api/src/lib/body-reader-baseline.json` and `body-reader-ratchet.test.ts`: removed the raw-body entry and lowered the true asserted total from 219 to 218.
- This report.

## Validation rules and behaviour

The answer must be an array. Every point must match the requested `base` and `quote`, have a `YYYY-MM-DD` date within the inclusive range, and a positive finite numeric rate. A non-array, malformed/mismatched point, invalid JSON, oversized body, or non-404/422 error uses `Frankfurter rate service unavailable: ...`, classified upstream by both classifiers. A 404/422 becomes `FxCurrencyUnavailableError`; the executor uses the shared currency list to name `from` or `to`, or names both when the list is unavailable.

Currency codes must match `[A-Z]{3}` and ranges may span no more than 1,827 days, before fetching. Existing aliases/defaults/date/order checks remain. An empty series refuses `start_date`. Identity ranges make no fetch and return one rate-1 point per calendar day with identity/computed provenance. Normal output keeps existing arithmetic/rounding, adds `rate_source`, and deliberately leaves `data_access_checks` for manifest stamping.

## Body cap

The series uses a **512 KiB** `readJsonWithLimit` cap. Five years is at most 1,828 inclusive daily points; this leaves ample space for JSON formatting and modest future response growth.

## Tests and what they pin

1. Unsorted USD→EUR fixture: sorted rates and unchanged average/min/max/change/data-point arithmetic.
2. NGN→KWD: non-ECB v2 coverage.
3. 422/XYZ combinations: correct field, two non-ECB codes, and both-field fallback when the list is down.
4. `[]`: typed `start_date` refusal, not tool failure.
5. Over 1,827 days: no fetch.
6. Non-`[A-Z]{3}`: field refusal and no fetch.
7. Quote mismatch, zero rate, bad/out-of-range date, object response, and 503: upstream in both classifiers.
8. Same currency: no fetch, inclusive identity series and computed provenance.
9. Direct normal provenance has no checks; manifest stamping supplies `recorded`.
10. Library request: exact v2 query, 10-second timeout, `vendor_api`, and no caching.

## Commands and results

- `cd apps/api && npx vitest run src/capabilities/forex-history src/capabilities/fx-unsupported-currency src/lib/fx src/lib/vendor-terms src/lib/data-access src/lib/body-reader-ratchet` — **passed**, 7 files / 245 tests.
- `cd apps/api && npx vitest run src/capabilities/forex-history.test.ts src/lib/fx/rates.test.ts src/lib/actionable-errors-round2.test.ts` — **passed**, 3 files / 140 tests after the final message-wording correction.
- `npm run typecheck` — **passed** after locally building missing SDK/MCP outputs with `npm --workspace=packages/sdk-typescript run build` and `npm --workspace=packages/mcp-server run build`; the earlier attempt failed only because those local generated package outputs were absent.
- `npm run refdata:check` — **passed**, 83 datasets.
- `npm run vendor-terms:check` — **passed**, 20 records / 0 errors; warned that `origin/main` was unreachable and used HEAD-only history validation.
- `cd apps/api && npx vitest run` — **started once and was interrupted after several minutes because the environment's full suite did not terminate promptly**. Before interruption, failing files were `src/lib/company-enrich/structured-metadata.test.ts`, `src/capabilities/lib/stripped-text-length.test.ts`, and `src/capabilities/url-to-markdown-parse-bound.test.ts` (unrelated wall-clock performance bounds), plus the expected stale-fixture failures in `src/capabilities/upstream-replay-contract.test.ts`. It also initially found actionable-error wording in this change; that was fixed and the dedicated test now passes.

## Not done

- The stale `apps/api/src/capabilities/__fixtures__/upstream/forex-history.json` was left for the master's live re-recording, as directed.
- No live Frankfurter request was made; task tests mock `safeFetch`.
- `exchange-rate`, `currency-convert`, `data-access.ts`, classifiers, and replay helper were not changed.
