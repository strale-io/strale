Intent: Register Strale's x402 capabilities on 402 Index directory

## What was done

### 1. Verified x402 endpoints (all 5 confirmed)
All endpoints return HTTP 402 with valid `Payment-Required` headers:
- `base-mainnet` network (already on mainnet, not Sepolia)
- USDC asset: `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`
- Wallet: `0x66D7C2F952362BFB24FD7F02a9beC9c754ea83bC`

### 2. Registered all 5 capabilities (status: pending review)

| Capability | 402 Index ID | Price |
|---|---|---|
| iban-validate | `5e1a7ef8-2447-42bf-a28d-9fc8d410ccb6` | $0.05 |
| vat-format-validate | `03120dba-daab-4b2d-9c5c-f87abb0a9a16` | $0.05 |
| paid-api-preflight | `402f75af-7ba9-45bd-8bdf-ddd1b5f2e827` | $0.02 |
| ssl-check | `d985f08e-6973-4f59-8576-5272411dc4e9` | $0.05 |
| sanctions-check | `7708c6d5-d570-48fd-ad6d-4764f36480d3` | $0.10 |

All verified by 402 Index's automated probe (x402 protocol detected, asset known, HTTP 402 confirmed).

### 3. Domain claimed and verified
- `api.strale.io` → verified on 402 Index
- Token: `17d2659be9455122b7f464fa3c960a165f7d9dc6d828c90bdc96f33129b626d8`
- Route: `GET /.well-known/402index-verify.txt` (deployed via commit a360e72)

### 4. SQS annotation comments (from prior task in same session)
Added LEGACY/CURRENT architecture annotations to:
- `sqs.ts` — top-of-file header + per-function annotations
- `quality-profile.ts`, `reliability-profile.ts`, `sqs-matrix.ts` — header annotations

## Not done
- Health webhook setup (step 5 from spec) — skipped as optional/scope creep
- 402 Index human review is pending — registrations will go live after manual approval

## Key observation
The x402 gateway is already on **Base mainnet** (`base-mainnet` in payment headers), not Sepolia testnet. The `X402_NETWORK` env var must have been updated to `eip155:8453` already. No mainnet switch was needed.
