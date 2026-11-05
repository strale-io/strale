---
slug: vat-number-validation-api
title: "VAT number validation API: EU, UK, Norway and Switzerland"
description: "Validate VAT numbers across the EU (VIES), the UK, Norway and Switzerland with one call. Providers, answers, caching and limits."
group: payments
framework: "REST API"
language: "cURL"
tools: [vat-validate, vat-format-validate, swedish-company-data]
---
`vat-validate` picks the national provider from the number's country prefix, VIES for the EU and Northern Ireland, HMRC for the UK, Brønnøysundregistrene for Norway and the Swiss UID register for Switzerland and Liechtenstein, and returns one JSON shape whichever answered. It costs {{price:vat-validate}} a call and needs a Strale API key: it is not one of the free tools, even though VIES itself is free to call directly.

## The solution

```bash cURL
curl -X POST https://api.strale.io/v1/do \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer sk_live_YOUR_KEY" \
  -d '{
    "capability_slug": "vat-validate",
    "inputs": { "vat_number": "SE556703748501" },
    "max_price_cents": 10
  }'
```

## What comes back

Two numbers, two outcomes. The first shows what a member state that releases a name and address returns; the second shows one that does not. The values are illustrative; run the call for a live record.

```json Responses
// vat_number: "SE556703748501"
{ "valid": true, "vat_number": "SE556703748501", "country_code": "SE",
  "company_name": "SPOTIFY AB", "company_address": "REGERINGSGATAN 19, 111 53 STOCKHOLM" }

// vat_number: "DE811128135"
{ "valid": true, "vat_number": "DE811128135", "country_code": "DE",
  "company_name": null, "company_address": null }
// company_name and company_address are null: Germany does not release
// a name or address through VIES for any VAT number, for any caller.
```

## Provider routing

The country prefix picks the provider. What you get back depends on the provider, not on anything Strale controls.

| Prefix | Provider | Name and address returned? |
| --- | --- | --- |
| EU member states and XI (for example SE, FR, IT, NL) | VIES | Usually. It varies by member state, and Germany never releases them. |
| GB | HMRC Check a UK VAT Number API | See Limits |
| NO | Brønnøysundregistrene | Yes |
| CH, LI | Swiss UID public register | No. Valid or invalid only. |

## Ways to get this data

| Source | Cost | Notes |
| --- | --- | --- |
| VIES SOAP endpoint directly | Free | EU member states and XI only. SOAP and XML, not REST and JSON. Throttling per member state, with no published limits. |
| HMRC, Brreg and the Swiss UID register directly | Free | Three integrations, three response shapes and three authentication models. HMRC uses OAuth2 and needs registration. |
| `vat-validate` (Strale) | {{price:vat-validate}} a call | One JSON shape across the four providers, a cache with a stale fallback when VIES is down, and a Strale API key. |

If you validate EU numbers only occasionally, calling VIES yourself is a reasonable choice. The per-call price buys UK, Norwegian and Swiss coverage in the same shape, and the caching and fallback you would otherwise build.

## Limits

- **VIES has outages and an undocumented concurrency limit.** Strale retries transient faults. Results can be served from a cache of up to 48 hours, and when VIES is down a cached result comes back marked `stale: true`.
- **Results can lag registry changes.** The cache holds for up to 48 hours, and national registers can lag VIES by a further day. For a same-day deregistration check, ask the national tax authority.
- **The Swiss UID answer is valid or invalid only.** For Swiss company details use [Swiss Company Data](/tools/swiss-company-data).
- **UK validation needs HMRC credentials.** If GB numbers return a "credentials pending" error, HMRC access is not enabled yet. Use [vat-format-validate](/tools/vat-format-validate) for a format-only check meanwhile.

## Questions

### Is VAT validation free on Strale?

No. It costs {{price:vat-validate}} a call and needs an API key. The free tools are listed in [Free tools for AI agents](/guides/free-apis-for-ai-agents).

### Why is company_name null for a valid German VAT number?

Germany does not release a name or address through VIES for any caller. It is a restriction of VIES, and no wrapper around it can add the details.

### How fresh is the result?

A repeat lookup within the cache window returns the cached answer with no upstream call. The window is up to 48 hours.

### Can I pay per call without an API key?

Some tools accept x402 payments with no account. The [x402 page](/docs/x402) explains how it works and the catalogue shows which tools are eligible.
