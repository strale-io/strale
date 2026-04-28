# Crypto address validators (top-10 chain coverage)

Intent: Close the capability gap revealed by site-search hits for "bitcoin address validation", "crypto wallet blockchain", and "cryptocurrency validation verification" in the activity window 2026-04-28 04:33–06:33 UTC. Strale already had `eth-address-validate`; the rest of the top-10 cryptos by market cap were uncovered.

## What shipped

5 new capabilities, all `validation` category, free-tier (€0.05), pure-algorithmic, Tier A test scheduling, lifecycle_state=active, visible=true:

| Slug | Format support | Library |
|---|---|---|
| `bitcoin-address-validate` | P2PKH, P2SH, P2WPKH, P2WSH, P2TR (mainnet/testnet/regtest) | bs58check + bech32 |
| `solana-address-validate` | base58 ed25519 32-byte pubkey | bs58 |
| `xrp-address-validate` | classic + X-address (with embedded tag/network) | ripple-address-codec |
| `tron-address-validate` | mainnet T-prefix (0x41 version byte) | bs58check |
| `dogecoin-address-validate` | P2PKH, P2SH (mainnet/testnet) | bs58check |

Combined with the existing `eth-address-validate` (which also covers USDT/USDC/BNB on EVM chains), Strale now covers BTC, ETH, USDT, BNB, SOL, USDC, XRP, DOGE, and TRX of the top 10 cryptos.

## Onboarding

All 5 went through the mandatory pipeline (DEC-20260320-B):

- Manifest at `manifests/<slug>.yaml`
- `npx tsx scripts/onboard.ts --discover --manifest <path>` ran cleanly per cap; `--discover` auto-generated `expected_fields` from live execution output
- `validate-capability.ts --slug <slug>`: **19/19 readiness checks pass** for every cap
- `smoke-test.ts --slug bitcoin-address-validate`: 10/10 substantive checks (only "fail" was Step 5 SQS pending — expected for a brand-new cap until first scheduled test run)
- 5 test suites generated per cap (known_answer, schema_check, negative, edge_case, dependency_health)
- Hand-tested 20 vectors including real mainnet/testnet addresses, mutated checksums, cross-chain confusions (ETH addr fed to BTC validator etc.) — 18/20 correct (the 2 misses were synthetic DOGE addresses I invented with bad checksums; validator correctly rejected them)

## Cost

- 2 new npm dependencies in `apps/api`: `bs58check`, `bech32` (BTC), `ripple-address-codec` (XRP). All small, well-known, dep-light. `bs58` is a transitive dep used directly by `solana-address-validate`.
- No external API costs (all algorithmic).

## Non-obvious learnings

1. **Solana has no checksum.** Unlike every other top-10 chain, Solana addresses are just `base58(32-byte ed25519 pubkey)` — a single-character typo produces a different but still structurally-valid address. The validator confirms shape only; there is no `checksum_valid` field because adding one would be a lie. Documented as a `warning`-severity limitation in the manifest. **Practical implication for downstream KYB/AML use:** Solana address validation is necessary but not sufficient for high-stakes flows; pair with on-chain account lookup before any irreversible action.

2. **Two onboarder bugs worth fixing later** (both worked around with one-shot SQL):
   - `onboard.ts` doesn't read `avg_latency_ms` from the manifest on first `--create` — only applies on `--backfill`. New caps onboard with `avg_latency_ms = NULL` and the readiness check warns "Missing avg_latency_ms (sync/async routing defaults to sync)".
   - `--backfill` reports a false-positive authority-drift on `output_field_reliability` — comparing JSON keys by ordering rather than semantically (same keys + values, different order = drift detected).

3. **Bech32 spec compliance matters for typo detection.** `bitcoin-address-validate` correctly rejects mixed-case bech32 input (BIP173 mandates case-uniform), which is what catches the typical copy-paste-mutation typo on SegWit addresses. The validator picks bech32 vs bech32m based on witness version (v0 → bech32, v1+ → bech32m) per BIP350.

4. **TON and ADA deferred.** Both have non-trivial format complexity (TON: workchain ID + 256-bit hash + flags + CRC16 in base64url; ADA: bech32 Shelley addresses with CBOR payload structure). Neither appeared in this session's site-search demand signal, so deferring to a separate session is fine. If demand picks up, the same per-chain pattern works.

## Open

- SQS pending → resolves on first Tier A test run (~6h). No action needed.
- Onboarder `avg_latency_ms` and authority-drift bugs are pre-existing platform issues, not regressions from this work. Not on critical path; worth filing a To-do but not blocking.
- The activity-window inputs that triggered this work showed at least 2 distinct agents running on the platform (KYB/SMB-screening agent + regulatory/pharma research agent + persistent x402 smoke-tester on `google-search`). None of them have hit the new crypto validators yet — worth checking activity again in 24h to see if these caps get traffic from real users vs only the typeahead matcher.

## Files touched (this session)

```
apps/api/src/capabilities/bitcoin-address-validate.ts    [new]
apps/api/src/capabilities/solana-address-validate.ts     [new]
apps/api/src/capabilities/xrp-address-validate.ts        [new]
apps/api/src/capabilities/tron-address-validate.ts       [new]
apps/api/src/capabilities/dogecoin-address-validate.ts   [new]
manifests/bitcoin-address-validate.yaml                  [new]
manifests/solana-address-validate.yaml                   [new]
manifests/xrp-address-validate.yaml                      [new]
manifests/tron-address-validate.yaml                     [new]
manifests/dogecoin-address-validate.yaml                 [new]
apps/api/package.json                                    [+ bs58check, bech32, ripple-address-codec]
apps/api/package-lock.json                               [updated]
```

Pre-session uncommitted (NOT touched this session): `apps/api/src/capabilities/us-company-data.ts`, `apps/api/src/lib/provenance-builder.ts`.

Nothing committed yet — Petter to commit + push.
