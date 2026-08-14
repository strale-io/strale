# x402 Autonomous Buyer

A minimal script that discovers a Strale capability via
[x402](https://x402.org) and pays for it per-call with USDC on Base
mainnet — **no Strale account, no API key, no signup**. Payment *is* the
authentication.

## What it does

1. `GET`s a Strale x402 endpoint with no auth.
2. Gets back an HTTP 402 with a v2 payment challenge (price, asset, payee,
   network) in the response body.
3. Signs a gasless EIP-3009 USDC authorization for that exact amount using
   [`@x402/evm`](https://www.npmjs.com/package/@x402/evm)'s `ExactEvmScheme`.
4. Retries the request with the signed payment attached; Strale's
   facilitator verifies and settles on-chain, then returns the capability's
   result.

## Prerequisites

- Node.js 20+
- A Base-mainnet EOA private key holding a small amount of USDC (a few
  dollars covers hundreds of calls at typical per-call prices — see
  [`GET /x402/catalog`](https://api.strale.io/x402/catalog)). No ETH needed:
  the "exact" scheme is gasless for the buyer — the facilitator submits and
  pays gas.

## Install

```bash
cd examples/x402-autonomous-buyer
npm install
cp .env.example .env
# edit .env with your real X402_PRIVATE_KEY
```

## Run

```bash
npm run buy
# or target a different capability:
npx tsx src/buy.ts isbn-validate "isbn=9780134685991"
npx tsx src/buy.ts vat-rate-lookup "country=SE"
```

See the full catalog of x402-enabled capabilities and current prices at
[`GET https://api.strale.io/x402/catalog`](https://api.strale.io/x402/catalog)
or [`GET /.well-known/x402.json`](https://api.strale.io/.well-known/x402.json).

## Expected output

```
Buyer wallet: 0xYourAddress...
GET https://api.strale.io/x402/v2/isbn-validate?isbn=9780134685991
Price: 21600 atomic units of USDC on eip155:8453 (payTo 0x66D7C2F9...)

HTTP 200
{
  "type": "ISBN-13",
  "valid": true,
  "isbn13": "9780134685991"
}

Settlement: {"success":true,"transaction":"0x...","network":"eip155:8453",...}
```

If your wallet has no USDC, the retry comes back `HTTP 402` again (the
facilitator rejects the authorization for insufficient balance) — this is
the expected failure mode for an unfunded wallet, not a bug in the script.

## A finding worth knowing about: why this doesn't use `@x402/fetch`

The obvious approach is `@x402/fetch`'s `wrapFetchWithPaymentFromConfig` —
it's the documented one-liner for "wrap fetch, get automatic 402 handling."
**It doesn't work against Strale's `/x402/v2/*` endpoints as published
(`@x402/fetch@2.22.0`, verified live 2026-08-13):** that client's v2 parser
only recognizes a payment challenge carried in a `Payment-Required` HTTP
response header, and falls back to the response *body* only for
`x402Version: 1`. Strale's v2 routes intentionally send the v2 challenge in
the JSON body **without** that header — `apps/api/src/routes/x402-gateway-v2.ts`
has a comment explaining why: emitting a v1-encoded `Payment-Required`
header breaks other v2-header-only decoders (e.g. `@agentcash/discovery`)
that never fall back to body parsing once any such header is present. Two
correct, standards-compliant implementations, incompatible on this one
transport detail.

This script works around it by driving the same `@x402/core` client methods
`@x402/fetch` uses internally (`x402Client.createPaymentPayload`,
`x402HTTPClient.encodePaymentSignatureHeader`), just parsing the 402 body
itself instead of going through the header-requiring wrapper. If a future
`@x402/fetch` release adds body-fallback parsing for v2, `wrapFetchWithPaymentFromConfig`
should work directly — worth re-testing before carrying this workaround
forward indefinitely.

## Verified

- `npx tsc --noEmit` — clean.
- Live run against production `https://api.strale.io` on 2026-08-13 with a
  freshly generated, unfunded throwaway private key: the full challenge →
  sign → retry flow completed correctly end-to-end (confirmed via the
  parsed price, the constructed EIP-3009 payload, and the server's expected
  402-again response for a zero-balance wallet). A real purchase (funded
  wallet, ETH-free) was **not** executed as part of building this example —
  that would spend real USDC, which is Petter's call, not an automated
  verification step.
