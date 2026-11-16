Intent: keep Strale's calls to the Swiss UID register inside its published limit of 20 a minute, the condition of the office's permission that Petter accepted on 2026-11-16.

## What changed

- `vat-validate` now sends every provider call through `withProviderRateLimit` (`apps/api/src/capabilities/lib/vat-providers/rate-limit.ts`). The old no-op seam is gone.
- Only `uid-ch` is limited: 3 calls per 15-second window. Any 60 seconds touches at most five windows, so Strale sends at most 15 a minute. That leaves 5 spare under the register's 20 for network delay and clock differences.
- The count lives in the database (`rate_limit_counters`, key `upstream:uid-ch`, via `takeUpstreamSlot` in `apps/api/src/lib/db-rate-limit.ts`). Every running server shares one budget.
- When the budget is spent, or the counter cannot be read, the call is not sent:
  - The caller gets a retryable, unbilled "Upstream unavailable: Swiss UID register: …" error that says when to retry.
  - vat-validate's stale-cache fallback rarely applies (its sweep drops entries once they stop being fresh), so the caller normally gets the retryable error.
  - A database error fails closed, so the permission is never risked.
- The new `ownBudget` flag on `UpstreamUnavailableError` makes `outcomeFromError` file these refusals as fault `strale`, with `counts_against_capability` false. A burst of Swiss demand can therefore neither push vat-validate under its quality floor nor open the breaker that would also stop the EU, Norwegian and UK paths (failure family F1).

## Checks

- Unit tests:
  - `rate-limit.test.ts`: the limiter's allow and refuse paths, fail-closed, the wording, the counting rule, a ten-minute flood simulation against epoch-aligned windows, and the wiring.
  - `db-rate-limit.test.ts`: the helper.
- Fail-before: without the `execution-outcome.ts` branch, both counting tests fail.
- Against local Postgres 16, 6 concurrent takes on one window allowed exactly 3.
- Full unit suite and `tsc` are clean.

## Review

An independent same-provider review ran in a separate context. Round 1 was NO-GO: the upstream-catch guard failed, because renaming the call inside vat-validate's `try` changed the fingerprint of its stale-fallback catch. The fix added a handler-local `degraded-ok` reason and removed the stale baseline entry. Its other findings were applied: the doc wording, the scope of the budget, and the position of a comment. Round 2 was GO.

## Not done

- HMRC's 3 a second is not limited, because that path is inactive without credentials. Add a row to `PROVIDER_RATE_LIMITS` when it goes live.
- Windows come from each server's clock, not the database's. Drift plus request delay of up to about 15 seconds still keeps Strale at 18 or fewer a minute.
- The refusal carries its retry delay only in the message text, with no machine-readable hint. The shared capacity (about 12 a minute across all callers) is not yet a manifest limitation. The manifest edit belongs in its own change, through the onboarding pipeline.

## After deploy (DEC-20260504-C)

After the first uncached Swiss call, run `SELECT bucket_key, window_start, count FROM rate_limit_counters WHERE bucket_key LIKE 'upstream:%'`; a row for `upstream:uid-ch` proves the limiter is live.

Next authorised action: merge through merge-gate, then run the post-deploy counter query | Owner: Strale master | Blocker: merge-gate
