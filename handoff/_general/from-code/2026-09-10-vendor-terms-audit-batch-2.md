# Vendor terms audit batch 2 — twelve capabilities off, Etherscan gated

**Intent:** read the terms of the seven commercial upstreams the 2026-09-06
audit left unchecked, switch off whatever fails, and close the paths a
database switch cannot reach.

Date: 2026-09-10
Branch: `docs/vendor-terms-audit-batch2`
Audit: `docs/security/2026-09-10-vendor-terms-audit-batch-2.md`

## Production changes already applied — read before touching the catalogue

Applied 2026-09-10 21:29–21:39 UTC with the parked write credential. Every
row carries a `deactivation_reason` quoting the clause. Do not reactivate
without the licence named there.

- **Capabilities off (12):** `token-security-check`, `wallet-risk-score`,
  `approval-security-check`, `phishing-site-check` (GoPlus); `flight-status`
  (AviationStack); `job-board-search` (Adzuna); `docker-hub-info` (Docker Hub);
  `github-user-profile` (GitHub, personal data); `wallet-age-check`,
  `wallet-transactions-lookup`, `wallet-balance-lookup` (Etherscan — missed by
  the first audit); `ip-risk-score` (ip-api.com — missed by the first audit,
  found by the new guard).
- **Bundles off (3):** `web3-counterparty-dd`, `web3-dapp-trust`,
  `web3-wallet-identity`. No active solution now depends on a deactivated
  capability; the three public catalogues list none of them.

## Code (this branch)

- All fourteen Etherscan/GoPlus/etc. executors in `DEACTIVATED`, including
  `gas-price-check` and `contract-verify-check`, which were database-only.
  Reason: web3-assurance calls executors through `getDirectExecutor`, which
  ignores `is_active`.
- `capabilities/lib/etherscan-client.ts` refuses every call unless
  `ETHERSCAN_COMMERCIAL_PLAN=true` (new env-manifest row; unset by design).
  Covers web3-assurance's three evaluators that call it directly.
- ENS on Alchemy only (`lib/eth-rpc-endpoints.ts`); the alchemy-eth probe lost
  its public fallback pool; the boot hygiene warning skips providers that
  authenticate at execution time.
- `fear-greed-index` emits Alternative.me's required attribution in the output.
- Guard: `lib/vendor-terms.ts` + `vendor-terms.test.ts`. Planted failures:
  `archive/receipts/2026-09-10-test-run-vendor-terms-guard-mutations.json`.

## Verify after deploy

1. `/health` serves the merge commit.
2. `ens-resolve` and `ens-reverse-lookup` still pass their scheduled tests.
   This proves `ALCHEMY_API_KEY` is set on Railway, which could not be read
   directly this session (the Railway CLI session had expired). If they fail
   with "No licensed Ethereum RPC endpoint is configured", the key is missing:
   switch both off rather than restore the public pool.
3. Resync `fear-greed-index`'s known_answer (it now asserts `attribution`):
   `npx tsx scripts/sync-known-answer-fixtures.ts --slugs fear-greed-index`
   from `apps/api` with the write grant, dry run first.

## Correction to the earlier handoff today

`2026-09-10-solution-revival-fix-and-known-answer-resync.md` lists running the
known-answer resync as its next action. It is done: written 17:38 UTC,
verified idempotent (a second dry run shows no differences). Three of the
seven had run since and passed at the time of writing
(`clinical-trials-search`, `doi-resolve`, `breach-exposure-check`); the other
four run daily.

## Next action

- The three verifications above.
- Still open from earlier today: a daily drift report for manifest-vs-database
  test rules; a "what bundles this?" check in the deactivation path; the
  input-redaction build.
- Optional product follow-up: `job-board-search` rebuilt on JobTech (Swedish
  open data) alone would be compliant.
