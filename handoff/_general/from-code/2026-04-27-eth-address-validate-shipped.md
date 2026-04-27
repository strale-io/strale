# [BACKFILL] Journal — eth-address-validate shipped

**Date:** 2026-04-27 (CET)
**Type:** session log
**Reason for [BACKFILL] prefix:** Notion MCP not connected in this session; this handoff substitutes for the Journal DB entry per CLAUDE.md degraded-mode rule. Re-file into Notion when Notion access returns.

## Intent

Ship a free-tier `eth-address-validate` capability surfaced by agent-traffic search-query analysis ("ethereum address" appeared in `/v1/suggest/typeahead` with no exact-match capability).

## Why

The /activity sweep on 2026-04-27 showed an automated x402 client probing `google-search` and a separate user typing `ethereum address` into typeahead. We already have a Web3 cluster — `ens-resolve`, `ens-reverse-lookup`, `wallet-age-check`, `wallet-balance-lookup`, `wallet-risk-score`, `wallet-transactions-lookup` — but no algorithmic gatekeeper that validates the address format before downstream RPC-bound calls. Same role `iban-validate` plays in front of payment capabilities.

## What shipped

- **Executor:** `apps/api/src/capabilities/eth-address-validate.ts` — pure algorithmic, uses existing `viem` (`isAddress`, `getAddress`). No new dependencies.
- **Manifest:** `manifests/eth-address-validate.yaml` — 5 guaranteed + 2 common output fields, 2 limitations (no on-chain check; all-lower/all-upper inputs skip checksum verification).
- **Outputs:** `{ input, valid, format_valid, checksum_present, checksum_valid (boolean | null), is_zero_address, normalized }`. Returns canonical EIP-55 checksummed form.
- **Pricing:** €0.05 (price_cents 5), `is_free_tier: true`. Matches `iban-validate`'s "validation tier" pricing for consistency.
- **x402:** Enabled (`x402_enabled = true`) — discoverable via `/.well-known/x402.json` and `/x402/eth-address-validate`.
- **Tier:** A (6h, pure-computation). 5ms latency.

## Onboarding routine compliance (DEC-20260320-B)

1. Manifest with all required fields ✓
2. `output_field_reliability` for all 7 fields ✓
3. `avg_latency_ms` set (5ms) ✓
4. `validate-capability.ts` — 19/19 checks passed ✓
5. `smoke-test.ts` — 10/11 passed (the ❌ is "SQS pending", expected for new capabilities) ✓
6. 7 edge cases manually verified: mixed-case correct, all-lower, all-upper, mixed-case typo (caught), zero address (flagged), too-short (rejected), no-0x (rejected) ✓

## Commits

- `2cee259` feat: add eth-address-validate capability (free-tier, EIP-55 typo detection)
- (follow-up) price bump 2→5 cents + x402 enable applied via DB UPDATE only — not in git, no schema/migration change.

## Notes for next session

- **Lifecycle state observed flip from `active` → `degraded` between activation and the price/x402 update.** Likely auto-degraded by the SQS engine because no test runs have executed yet (no SQS = treated as soft-fail). Should restore to `active` after the first tier-A test cycle (within 6h). If it doesn't, investigate.
- **Optional follow-up:** bundle into a "Wallet Verify" solution (`eth-address-validate` + `ens-reverse-lookup` + `wallet-age-check` + `wallet-risk-score`) — solutions are seeded in `seed-solutions.ts`.
- **Larger gap still open:** `iban-name-verify` (VoP, EU mandatory since 2025-10-09) — flagged in earlier conversation as the missing piece for invoice-verify-{cc} solutions. Requires a VoP-aggregator contract (iPiD, SurePay, Trustpair, Sis ID). Worth a vendor-evaluation call.

## Cross-repo

No frontend update needed — capability slots into the existing `validation` category that `public/llms.txt` already describes. Sitemap unchanged (capabilities aren't pages).
