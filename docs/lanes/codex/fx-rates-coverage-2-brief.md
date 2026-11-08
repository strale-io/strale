Intent: Codex builder brief: review fixes for fx-rates-coverage (round 2).

# Brief: fx-rates-coverage review fixes

- **Requester:** the Strale master (session_01RFNL6WAcqYWJKtyJRfBGCw), 2026-11-08. This round answers an independent review of `codex/fx-rates-coverage` at 6333362f, verdict FAIL.
- **Branch:** push only `codex/fx-rates-coverage-2`. It starts from `codex/fx-rates-coverage`. Never push `main`, and never label, approve, merge or comment.
- **Data:** this brief and the repository only, with no secrets. All tests run offline with mocked `safeFetch`.
- **Read first:**
  - `docs/lanes/codex/fx-rates-coverage-brief.md`
  - your report, `docs/lanes/codex/fx-rates-coverage-report.md`
  - `git diff origin/main...HEAD`
  - `apps/api/src/lib/data-access.ts` and `apps/api/src/lib/data-access-manifests.test.ts`

## Fix these

1. **Restore the shared validator, and make the CI suite green.**
   - **The problem:** round 1 changed `stampDataAccess` in `apps/api/src/lib/data-access.ts`, so an executor could keep `data_access_checks: "recorded"` on a manifest that records no checks. That breaks the module's "lower, never raise" rule for every capability, and other code ranks "recorded" above "pending".
   - **Revert that change.** The only change to `data-access.ts` allowed here is **narrowing**: inside the `access.checks` branch, when the stamped `data_access_lane` is not `allowed_with_checks`, delete `data_access_checks`. A lane without checks carries no checks claim.
   - **Tests in `data-access.test.ts`:**
     - An executor-set `"recorded"` on a manifest with no checks is removed. This already holds on origin; keep it.
     - The new narrowing case: the manifest is `allowed_with_checks`/`recorded` and the executor says lane `preferred`, so the checks claim is removed.
   - **Declare the Frankfurter path in both manifests.** In `manifests/exchange-rate.yaml` and `manifests/currency-convert.yaml`, the `data_access` block becomes:
     - `lane: allowed_with_checks`
     - `acquisition_method: vendor_api`
     - `upstream_vendor: Frankfurter`
     - `checks: recorded`
     - a `checks_note` naming the vendor-terms record: `frankfurter.dev/license/`, read 2026-11-08, blended endpoint only.
   - **In `apps/api/src/lib/fx/resolve.ts`:**
     - ECB answers set `acquisition_method: direct_api` and `data_access_lane: preferred`, and set no checks.
     - Frankfurter answers set `vendor_api`, `allowed_with_checks` and `upstream_vendor: "Frankfurter"`, and **do not set `data_access_checks` themselves**. Stamping derives it.
   - `npx vitest run src/lib/data-access-manifests` must pass. It failed at 6333362f with "exchange-rate / currency-convert: calls Frankfurter but names no upstream_vendor".
   - **Fix the round-1 tests.** `fx-rates-coverage.test.ts` registered `preferred` yet expected "recorded" back, so rewrite it to use the real manifests' `data_access` and assert:
     - ECB answers carry no `data_access_checks`;
     - Frankfurter answers carry `"recorded"`.
2. **Name the right field in a refusal.**
   - **The problem:** NGN→XYZ refused `'from'` (NGN is fine). When both codes are outside the ECB list, a Frankfurter 404 cannot say which code is unknown.
   - **The fix:** look up Frankfurter's currency list (`GET https://api.frankfurter.dev/v2/currencies`, cached 24 h with the same in-flight sharing, through `safeFetch` with a timeout and a size cap) to name the unknown field.
     - If the list is unavailable, the refusal names both codes and the `from` field.
     - Keep the `fx-unsupported-currency.test.ts` contract.
3. **An oversized or invalid upstream answer is the source's fault.**
   - **The problem:** a `ResourceLimitError` from the ECB file (or Frankfurter) is a refusal today, so it is classified as `caller_input`.
   - **The fix:** wrap it in a plain upstream error, for example `ECB reference rates unavailable: response too large`.
   - Treat these the same way: a Frankfurter `base`/`quote` mismatch, a non-positive or non-finite rate, a `null` body and invalid JSON. Each must classify as upstream in both `failure-classifier.ts` and `transaction-failure-taxonomy.ts`. Reuse their existing phrases, such as "unavailable"; do not add new classifier patterns.
   - Read or discard every error-status body (`discardBody` exists).
4. **Restore the `from === to` shortcut** in both executors: rate 1, `provenance.source: "identity"`, no fetch. That is exactly origin/main's output for `exchange-rate`. For `currency-convert` it is origin's output, including `converted_amount: amount` unrounded.
5. **A non-ECB pair must not depend on the ECB.**
   - Decide the route from a static set of the ECB's published codes, taken from the cached file when one is present. Otherwise fall back to a constant listing the 30 codes (EUR plus the 29), registered in `config/reference-data.yaml` with source "ECB euro reference rates page" and a review date. Run `npm run refdata:check`.
   - So NGN→KWD goes straight to Frankfurter, even with the ECB down.
   - **Back off after a failed ECB refresh for 5 minutes,** as follows. Inside the 4-day last-good window, serve the stale copy without waiting on the ECB. With no copy, throw the remembered upstream error immediately.
   - **Measure the 4-day window from the rate date** in the file, not from the fetch time.

## Tests (offline; each new one must fail against 6333362f)

- 1: covered above.
- 2: NGN→XYZ refuses `to`; XYZ→NGN refuses `from`; with the currency list down, the refusal names both codes.
- 3: oversized ECB file, Frankfurter mismatch, `null` body and invalid JSON each give an error that both classifiers call upstream.
- 4: USD→USD and NGN→NGN make no fetch and give `source: "identity"`.
- 5:
  - NGN→KWD succeeds with the ECB failing and no ECB copy.
  - After a failed refresh, a second call within 5 minutes makes no ECB fetch.
  - A stale copy whose rate date is more than 4 days old is not served.

## Done when

- **Tests:** `cd apps/api && npx vitest run src/capabilities/exchange-rate src/capabilities/currency-convert src/capabilities/fx-unsupported-currency src/capabilities/fx-rates-coverage src/lib/fx src/lib/vendor-terms src/lib/data-access src/lib/failure-classifier src/lib/transaction-failure-taxonomy` passes. That includes `data-access-manifests`. Use the paths that exist.
- **Checks:** `npm run typecheck`, `npm run refdata:check` and `npm run vendor-terms:check` pass.
- **Report:** append a "Round 2" section to `docs/lanes/codex/fx-rates-coverage-report.md`. It covers each fix, its test names, and the exact list of test files you ran.
