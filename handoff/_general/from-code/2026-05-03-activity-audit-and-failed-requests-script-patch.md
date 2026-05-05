Intent: run `/activity since-last`, answer two follow-up questions (no_match capability rows + whether the failed `screenshot-url` x402 call charged the user), patch the diagnostic script that misled the analysis.

## Outcome

- **Activity window** (2026-05-03 09:08 → 11:55 CET, ~2h47m): 21 external calls (18 completed, 3 failed). Mix: 11 free-tier, 10 x402, 0 wallet, 0 solutions. 0 signups. 4 failed_requests. Almost entirely smoke/self-traffic — `google-search` × 9 with literal query `"test"` and `url-to-markdown` × 9 sweeping Strale's own footprint (strale.dev, GitHub, npm, PyPI, glama.ai, dev.to).
- **`screenshot-url` x402 failure (Browserless 401 quota)**: customer was NOT charged. [x402-gateway-v2.ts:1128-1173](apps/api/src/routes/x402-gateway-v2.ts#L1128-L1173) verify → execute → settle path catches the executor throw, records a `failed` transaction with `settlementId: undefined`, `settleX402Payment` never called. Per DEC-14 (and inline comment at line 1135-1136). Real fix is to top up Browserless free tier — `screenshot-url` will keep failing on x402 until then.
- **`no_match` capability rows (4 in window)**: re-queried with the full schema. NOT 4 matcher misses. 1 real `no_match` (`amazon-price` — capability we don't ship, Tier-1 doctrine rules out Amazon scraping). 3 input-validation rejects against `email-validate` from one anon curl session (same IP hash, same UA, 83-second window): two `missing_fields` (forgot `email`), one `input_misplaced` (put `email` at top level instead of inside `inputs`). The matcher resolved `email-validate` correctly all three times — the schema check at [do.ts:959-996](apps/api/src/routes/do.ts#L959-L996) rejected, and the dedicated `input_misplaced` hint at [do.ts:964-969](apps/api/src/routes/do.ts#L964-L969) successfully nudged the dev to the right shape between calls 2 and 3.
- **Patched [apps/api/scripts/window-failed-requests.ts](apps/api/scripts/window-failed-requests.ts)** to surface `failure_type` + `error_detail`, print a one-line breakdown by failure_type, and include a clarifying note. Without those columns I had misclassified the three input-validation rejects as matcher misses. Shipped as PR #40 on `chore/window-failed-requests-show-failure-type` (own branch off main, kept separate from the `us-court-search` work on `test/us-court-search-fixture-restructure`).

## Open / next session

- **`amazon-price` is a recurring demand signal** worth tracking if it shows up again. We won't build a scraper; if it persists, evaluate vendor-licensed product-data feeds (Tier-2 doctrine).
- **PM-lens follow-up surfaced by /go reviewers (out of scope for #40):** `do.ts` already writes `input_misplaced` vs `missing_fields` distinctly to the DB but the API response uses `error_code: invalid_request` for both. If callers want to retry programmatically based on failure mode, differentiating the error codes would help. Not action; flag.
- **Browserless free-tier quota is exhausted for `screenshot-url`.** Paid x402 calls will keep failing (no charge, but bad UX) until topped up. Decide whether to top up or temporarily disable `screenshot-url` on x402.

## Non-obvious learnings

- **Diagnostic-script omissions can cause real misreads.** `window-failed-requests.ts` was selecting only 4 columns out of a 7-column table; the 3 missing columns (`failure_type`, `error_detail`, `user_agent`) were exactly what disambiguated matcher-miss vs input-validation-reject. Cost: I told Petter "the matcher missed an exact-slug match three times" before pulling the full row. Fix landed in PR #40.
- **The x402 verify → execute → settle order is load-bearing.** A failing executor on x402 results in a recorded `failed` transaction with no settlement — the signed authorization expires unused. This isn't visible in the wallet ledger but IS visible in `transactions.status='failed'` rows with `settlement_id IS NULL`. Worth remembering when an x402 customer reports "I paid but it didn't work" — they didn't pay.

## Cost

- 0 €. Script-only change. Both reviewer agents ran in parallel (~30s).
