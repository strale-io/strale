---
slug: defi-protocol-fees-api
title: "DeFi protocol fees API: read fees and revenue as JSON"
description: "Retrieve reported DeFi protocol fees and revenue, compare matching time periods and handle missing values without treating them as zero."
group: web
framework: "REST API"
language: "cURL"
tools: [protocol-fees-lookup, protocol-tvl-lookup]
---
Use `protocol-fees-lookup` to retrieve reported fee and revenue totals from DefiLlama. A successful API-key call costs {{price:protocol-fees-lookup}}. These figures describe protocol activity; they are not a gas-price quote or an investment recommendation.

## Request a protocol’s reported totals

Set `STRALE_API_KEY` to your API key, then run:

```bash cURL
curl -X POST https://api.strale.io/v1/do \
  -H "Authorization: Bearer $STRALE_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "capability_slug": "protocol-fees-lookup",
    "inputs": { "protocol": "uniswap" },
    "max_price_cents": 2
  }'
```

Use a supported DefiLlama protocol URL slug. The tool lowercases the supplied value and replaces spaces with hyphens; it does not resolve every display name. An unknown slug returns an error. The output `slug` can be a provider identifier such as `parent#uniswap`, so keep the original lookup input for subsequent calls.

## Keep fees, revenue and periods separate

Under [DefiLlama’s definitions](https://docs.llama.fi/analysts/data-definitions), fees measure payments by users, while revenue measures the portion retained by the protocol. Check the individual protocol’s methodology before comparing it with another.

Fields ending in `_usd` are dollar amounts, not cents. Compare `fees_24h_usd` with `fees_48h_to_24h_usd` for adjacent 24-hour periods. The 7-day and 30-day totals overlap, so adding them double-counts activity. All-time values reflect the provider’s available coverage.

This tool returns aggregate totals only. It does not return chain or product breakdowns, a daily time series, token-holder earnings or projected returns. Use the period named in each field rather than labelling every figure “daily revenue”.

## Preserve missing values

A `null` metric means unavailable, not zero. Revenue fields are null when DefiLlama reports fees for the protocol but does not track its revenue. If the fee or the revenue request fails, the call fails and is not charged; it does not return null revenue in place of the failure.

Show unavailable values as missing and avoid calculating a ratio from them. Keep an actual zero when the provider supplies one. The example on the tool page is a catalogue illustration, not a current market measurement.

## Add context to a research workflow

Use [Protocol TVL Lookup](/tools/protocol-tvl-lookup) when you also need total value locked. Keep TVL separate from fee and revenue totals. Your application decides when to request another sample and stores any history; this call does not start monitoring.

See [Protocol Fees Lookup](/tools/protocol-fees-lookup) for the example, fields and current limitations.
