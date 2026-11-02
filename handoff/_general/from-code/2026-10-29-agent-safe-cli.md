Intent: portfolio plan Phase 3 item 3 (DEC-20261024-B) — ship an agent-safe CLI.

## What landed (branch feat/agent-safe-cli)

- New package `packages/cli` (npm name `strale-cli`, binary `strale`, 0.1.0, no runtime dependencies).
  Commands: `search`, `tools`, `run`, `balance`, `help`, `version`.
- Contract: one JSON document on stdout on success; one JSON error on stderr with the API's
  `error_code`, `fix`, `retryable`, `next_step` (PR #767 shape); exit codes 0–6 documented in
  the README and in `strale help` (a test keeps them in sync); never prompts or reads stdin;
  key only from `STRALE_API_KEY`; `X-Strale-Client: strale-cli/<version>`; `src=cli` on every call.
- `run` refuses without `--max-price-cents` (0–2000; 0 = free tier only), validates `--input` as a
  JSON object locally, polls async transactions up to `--wait`.
- Keyless calls to paid tools get the API's x402 challenge (no `error_code`); the CLI maps that
  to `payment_required`, exit 4, with `details.accepts` passed through. The CLI does not sign x402.
- Not built on the `straleio` SDK: the SDK requires an API key in its constructor and cannot add
  `?src=`, so it cannot make keyless free-tier calls or tag the channel. Extending it would force an
  SDK publish before the CLI could ship. The CLI mirrors the SDK's conventions instead.
- Wiring: CI test step, root `typecheck`, `release-npm.yml` dispatch option, npm-publishing table,
  env-manifest `STRALE_API_KEY` purpose.

## Evidence

- Offline tests: `npm test --workspace=packages/cli` (mocked fetch, no network).
- Live free-tier smoke against production: recorded in the PR body.

## Next

- First publish of `strale-cli` is Petter's (new package: npm creates the Trusted Publisher page on
  first publish; docs/release/npm-publishing.md "First publish of a new package"). Not inside
  DEC-20261027-B item 7's class, which names that plan's packages.
- After first publish: production contract smoke via `npx -y strale-cli@0.1.0 ...` per
  DEC-20260422-A step 6, and add the Trusted Publisher.
