Intent: Close out Petter's 2026-11-02 question (do Strale's own test calls run up a bill on paid tools?) with production numbers, read through the new ops-read endpoint.

[BACKFILL] Cloud session; no Notion write was made.

## Results (read 2026-11-02 via `GET /v1/ops-read/*`, token from Bitwarden through `bws run`)

- **`build`** returned the deployed commit `5a1d62d492f2` and `read_only: true`. That is the DEC-20260504-C step-4 proof for strale-io/strale#880: production runs the checks in a read-only transaction.
- **`parked-suites`** returned 2 suites, both `canadian-company-data`:
  - `known_answer` (the "Shopify" name lookup), suite `c3743322-48d9-41ac-80bf-c623b9bd17a2`;
  - `known_bad` (free text expected to be refused), suite `f4bba1a4-afc3-4019-ad6c-da22f11d0cdd`.
  - Both were parked by the paid-call guard (strale-io/strale#878) on their first run after deploy. Neither has run since 01:39 UTC.
- **`test-call-cost`** (2026-10-04 to 2026-11-02, the 30-day retention window): the two parked suites ran 350 and 356 times, so 706 runs.
- Each run made one Claude Haiku request (`MODELS.capability_default`, $1 per million input tokens, $5 per million output, about 80 input tokens and at most 100 output).
- Estimated spend over 30 days: about $0.10. The upper bound, with every run retried once at maximum output, is under $1. The spend has now stopped.
- No other suite has been parked yet. Suites on 24-72h cadences may still reach the guard within 72 hours of deploy and would then be parked the same way. Re-run `parked-suites` after 2026-11-05.

## Next

- Next authorised action: replace the live name-path coverage for `canadian-company-data` with a unit test that stubs the Claude call (the Corporations Canada search itself is free). Then deactivate the two parked suites through a ledgered startup-migration block, and remove the "Shopify" known_answer fixture from `manifests/canadian-company-data.yaml` so `onboard --backfill` does not recreate it. That also stops the trust pages showing those suites' last pre-guard pass. | Owner: Strale orchestrator | Blocker: none. The spend is already zero while the suites stay parked, so this is clean-up, not urgent.
- Re-run `parked-suites` after 2026-11-05 and handle any new suite the same way.
