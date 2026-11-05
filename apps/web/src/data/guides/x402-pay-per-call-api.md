---
slug: x402-pay-per-call-api
title: "x402 for AI agents: pay per call without an API key"
description: "How x402 works with Strale: an HTTP 402 quote in USDC, a signed payment and a repeated request."
group: agents
framework: "x402"
language: "cURL"
tools: [iban-validate]
---
x402 uses HTTP status 402 Payment Required as a payment protocol. Your agent calls an endpoint, gets a quote in USDC, signs a payment and repeats the request. There is no signup and no key: the payment is the authentication. Only tools that accept x402 can be bought this way.

## The flow

```bash 1. Ask for a quote
curl -i -X POST https://api.strale.io/x402/v2/<tool-slug> \
  -H "Content-Type: application/json" \
  -d '{"inputs":{"...":"..."}}'
# HTTP 402 with the price, the payee and how long the quote stays valid
```
```bash 2. Repeat with payment
# An x402 client signs the USDC transfer described in the quote
# and repeats the request with the payment attached.
curl -X POST https://api.strale.io/x402/v2/<tool-slug> \
  -H "Content-Type: application/json" \
  -H "PAYMENT-SIGNATURE: <base64 payment from your x402 client>" \
  -d '{"inputs":{"...":"..."}}'
# HTTP 200 with the tool's normal output
```

## How it works

Strale checks that the payment is valid before it runs the tool, and settles it only after the tool returns a usable result. If the source fails, nothing is charged.

Payments are in USDC on Base. Which tools accept x402 changes, so read the list from the catalogue and the live quote, not from this page: see [x402](/docs/x402) for the catalogue, the full flow and a runnable script.

## Limits

- **Your agent needs a funded wallet.** x402 removes the signup step, not the need for USDC that your client can sign from.
- **Not every tool is on x402.** Others need an API key.

## Questions

### Do I need a Strale account to use x402?

No. An x402 request needs no key and no signup. The API-key and wallet route is a separate option.

### What if the data source fails after I pay?

You are not charged. Settlement happens only after the tool returns a usable result.
