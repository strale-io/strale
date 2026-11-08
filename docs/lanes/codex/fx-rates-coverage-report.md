# FX rates coverage report

## Files changed

- `apps/api/src/lib/fx/rates.ts` adds the bounded, timeout-controlled ECB daily-file reader, one-hour shared/in-flight ECB cache with four-day last-good fallback, and the validated one-hour per-pair Frankfurter cache.
- `apps/api/src/lib/fx/resolve.ts` centralises source selection, cross-rate arithmetic, attribution, refusal mapping, and per-answer data-access provenance.
- `apps/api/src/capabilities/exchange-rate.ts` and `apps/api/src/capabilities/currency-convert.ts` now share the resolver and return `rate_source`, `rate_date`, and conditional `stale` while preserving existing rounding and fields.
- `apps/api/src/capabilities/fx-rates-coverage.test.ts`, `apps/api/src/lib/fx/rates.test.ts`, and `apps/api/src/capabilities/fx-unsupported-currency.test.ts` pin the offline contracts described below.
- `apps/api/src/lib/data-access.ts` and its unit test preserve recorded checks when a mixed-source executor explicitly selects an alternate `allowed_with_checks` path instead of its manifest default.
- `manifests/exchange-rate.yaml` and `manifests/currency-convert.yaml` describe both sources, daily freshness, and reliability for the new fields.
- `apps/api/src/lib/vendor-terms.data.json` registers the restricted Frankfurter blended-rate endpoint and the published reuse terms.

## Source selection

The resolver obtains the cached ECB daily file and uses it only when both requested currencies (including EUR at 1) occur in that file. It computes ECB cross rates as `to per EUR / from per EUR`. If either code is absent, it requests the exact pair from Frankfurter's blended `/v2/rate/{BASE}/{QUOTE}` endpoint; it never composes an answer from the two sources. Frankfurter 404/422 responses become a field-specific `inputRefusal` saying the named code has no published reference rate. Timeouts, 5xx responses, malformed source data, and mismatched pair responses remain upstream failures.

## Data access

ECB answers retain `preferred` / `direct_api`; this is also each manifest's default path. Frankfurter answers override that default in their provenance with `allowed_with_checks`, `vendor_api`, `upstream_vendor: Frankfurter`, and `data_access_checks: recorded`. `vendor_api` is the validator's vocabulary for a vendor API over data the vendor holds or calculates. The checks are recorded because the published licence permits reuse of Frankfurter's own blended calculation, robots allows the endpoint, the register limits access to `/v2/rate/`, and no provider-specific query is made. The register additionally required `how_read`; it was filled from the brief's facts about the master's terms/robots review and the blended-endpoint-only restriction.

## Offline tests and pinned behaviour

- The ECB cache test makes simultaneous calls and pins one shared `eurofxref-daily.xml` request, EUR insertion, XML parsing, and the absence of the retired data-api URL.
- The executor arithmetic cases pin EUR→USD, USD→EUR, and USD→SEK cross-rate arithmetic plus six-decimal rounding and ECB provenance.
- The Frankfurter executor cases pin EUR→NGN and NGN→KWD exact-pair routing, source fields, attribution/data-access provenance, and no use of the retired ECB per-currency endpoint.
- The refusal tests pin Frankfurter 404 as `inputRefusal`, `caller_input`, and a message naming the code; the pre-existing shared unsupported-currency contract still covers both executors and `forex-history`.
- The failure cases pin Frankfurter timeout and 503 as non-refusal upstream failures.
- ECB fallback tests pin last-good service after a failed refresh, conditional `stale`, and an upstream error when no good copy exists.
- Frankfurter validation tests pin rejection of a mismatched quote and a zero rate.
- The resource-bound test pins clean refusal of an ECB XML body beyond the shared 4 MiB API-response cap.
- The conversion parity test pins `currency-convert` to the same resolved/rounded rate as `exchange-rate` and verifies amount multiplication/cent rounding.
- The Frankfurter cache test pins one request per pair within an hour.

## Anything not done

- `forex-history.ts` and its existing Frankfurter v1 integration were left unchanged, as required.
- No vendor, paid API, retry loop, or provider-specific Frankfurter endpoint was added.
- Capability validation/smoke scripts could not run because this checkout has no `DATABASE_URL`; all requested offline Vitest, typecheck, reference-data, and vendor-terms checks were run separately.
