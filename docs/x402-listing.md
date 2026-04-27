# Strale — Compliance oracle for AI agents

## Short description (1 line)
250+ compliance, KYC/KYB, and business verification APIs via x402. Sanctions, PEP, adverse media, beneficial ownership, company data across 27 countries. Pay per call with USDC on Base.

## Medium description (3 lines)
Strale is the trust layer of the agent economy — 250+ quality-scored API capabilities for compliance, company verification, payment validation, and regulatory intelligence. All available via x402 pay-per-use USDC payments on Base mainnet, with no signup or API key required. Purpose-built for AI agents that need off-chain data to make on-chain decisions.

## Category
Compliance & Verification / Data Services

## Links
- x402 catalog: https://api.strale.io/x402/catalog
- x402 discovery: https://api.strale.io/.well-known/x402.json
- Website: https://strale.dev
- MCP server: https://www.npmjs.com/package/strale-mcp
- GitHub: https://github.com/strale-io

## Example capabilities available via x402
- `sanctions-check` — Screen names against global sanctions lists ($0.02)
- `pep-check` — Politically exposed persons screening ($0.02)
- `adverse-media-check` — Negative news screening ($0.02)
- `beneficial-ownership-lookup` — Ultimate beneficial owner chain ($0.03)
- `iban-validate` — IBAN structure + checksum validation ($0.01)
- `vat-validate` — EU VAT number verification via VIES ($0.01)
- `aml-risk-score` — AML risk assessment score ($0.01)
- `domain-reputation` — Domain trust assessment ($0.01)
- 248 more capabilities across 17 categories

## Example x402 flow
```
GET https://api.strale.io/x402/sanctions-check?name=John+Doe
-> HTTP 402 { paymentRequirements: [{ amount: "$0.02", network: "eip155:8453", asset: "USDC" }] }
-> Retry with X-Payment header (signed USDC transfer)
-> HTTP 200 { is_sanctioned: false, match_count: 0, lists_queried: { collection: "opensanctions/default", list_count: 347, version: "20260427125425-hms", last_updated_at: "2026-04-27T12:54:25" } }
```

## Awesome-x402 entry (for README.md lists)
```markdown
- [Strale](https://strale.dev) — 250+ compliance and verification APIs via x402. Sanctions, PEP, adverse media, beneficial ownership, KYC/KYB, company data (27 countries), payment validation. [$0.005-$0.10/call](https://api.strale.io/x402/catalog)
```
