# Six capabilities rebuilt on sources whose terms permit resale

**Intent:** founder asked (2026-09-11) to keep every capability that can be
served without paying. Rebuild the ones switched off in the vendor-terms audit
onto sources whose terms allow commercial resale.

Date: 2026-09-11
Branch: `fix/free-source-rebuilds`

## Sources, with the terms read before any code

| Capability | New source | Basis |
|---|---|---|
| `gas-price-check`, `wallet-balance-lookup`, `wallet-transactions-lookup`, `wallet-age-check` | Alchemy (JSON-RPC + transfer index), Ethereum mainnet only | Terms bar reselling Alchemy access; services may be used "as integrated with its own offerings that provide additional functionality to its end users" |
| `contract-verify-check` | Sourcify | MIT, self-described "Open-data", full dataset published; no restrictive terms. Factual metadata only |
| `job-board-search` | JobTech JobSearch (Arbetsförmedlingen) | "Licens: Creative Commons CC0 · API nyckel eller registrering: Nej". Contact persons' data never returned |

Rejected: Blockscout (hosted terms grant a non-sublicensable licence; its
software licence requires a paid commercial licence for monetisation).
Still off, no free compliant source: the four GoPlus capabilities,
`flight-status`, `docker-hub-info`, `github-user-profile`, `ip-risk-score`.

Behaviour changes a customer can see: Ethereum mainnet only (other chain ids
refused; customers asked for mainnet in all but ~6 calls in 90 days);
transactions no longer carry `gas_used`/`is_error` (null, with a note);
"not verified" means not verified on Sourcify; job search is Sweden-only
(customers only ever searched Sweden; the Adzuna keys were never set in
production).

Tests: `apps/api/src/capabilities/free-source-rebuilds.test.ts` (upstream
shapes, licensed hosts only, PII never returned, refusals). Planted failures
12/12 after two gaps found and fixed; keyless ones also run live
(Sourcify, JobTech) before commit.

## After merge and deploy — in this order

1. `/health` serves the merge commit (executors are registered only then).
2. From `apps/api` with the write grant: `npx tsx scripts/sync-manifest-canonical-to-db.ts`
   for the six manifests (description, data_source, schemas, reliability;
   job-board-search's cost class). Dry run first. Do **not** expect the five
   Ethereum ones to change cost class: they stay `free_quota` because block
   0082 reverts `free_unlimited` on every boot.
3. `npx tsx scripts/sync-known-answer-fixtures.ts --slugs gas-price-check,wallet-balance-lookup,wallet-transactions-lookup,wallet-age-check,contract-verify-check,job-board-search`
   (dry run first).
4. Relaunch dark: `is_active = true, visible = false, x402_enabled = false,
   deactivation_reason = NULL, lifecycle_state = 'validating'` for the six.
   The promotion job lists them after a green week (≥95% over ≥40 results).
5. Confirm the first known_answer results pass with real latency (schema_check
   rows return in ~3 ms without running and prove nothing). The Alchemy ones
   also prove the production key serves the transfer index.

## Next action

The five steps above, then the open items from 2026-09-10: a daily
manifest-vs-database drift report for test rules, a "what bundles this?"
check in the deactivation path, and the input-redaction build.
