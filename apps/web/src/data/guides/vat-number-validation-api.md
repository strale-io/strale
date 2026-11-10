---
slug: vat-number-validation-api
title: "VAT number validation API: VIES results, caching and country support"
description: "Check VAT registration through VIES and other national providers. Understand missing company details, cached results and the requirement for UK HMRC access."
group: payments
framework: "REST API"
language: "cURL"
tools: [vat-validate, vat-format-validate, swedish-company-data]
---
`vat-validate` picks the provider from the number's country prefix: VIES for EU and XI numbers, Brønnøysundregistrene for Norway, and the Swiss UID register for Switzerland and Liechtenstein. GB checks use HMRC only when its access is configured. The API-key route costs {{price:vat-validate}} per successful call; it is not a free Strale tool, even though VIES itself is free to call directly.

## The solution

```bash cURL
curl -X POST https://api.strale.io/v1/do \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $STRALE_API_KEY" \
  -d '{
    "capability_slug": "vat-validate",
    "inputs": { "vat_number": "SE556703748501" },
    "max_price_cents": 10
  }'
```

## What comes back

Set `STRALE_API_KEY` before running the call. These are illustrative selected output fields for two numbers, not live checks. The first has company details; the second shows how missing VIES details are represented. The API returns these fields inside `output`.

```json Responses
// vat_number: "SE556703748501"
{ "valid": true, "vat_number": "SE556703748501", "country_code": "SE",
  "company_name": "SPOTIFY AB", "company_address": "REGERINGSGATAN 19, 111 53 STOCKHOLM" }

// vat_number: "DE811128135"
{ "valid": true, "vat_number": "DE811128135", "country_code": "DE",
  "company_name": "", "company_address": "" }
// Missing VIES details or placeholder values become empty strings, not null.
```

## Provider routing

The country prefix picks the provider. What you get back depends on the provider, not on anything Strale controls.

| Prefix | Provider | Name and address returned? |
| --- | --- | --- |
| EU member states and XI (for example SE, FR, IT, NL) | VIES | Availability varies. Missing details are returned as empty strings. |
| GB | HMRC Check a UK VAT Number API | See Limits |
| NO | Brønnøysundregistrene | Yes |
| CH, LI | Swiss UID public register | No. Valid or invalid only. |

## Ways to get this data

| Source | Cost | Notes |
| --- | --- | --- |
| VIES SOAP endpoint directly | Free | EU member states and XI only. SOAP and XML, not REST and JSON. Throttling per member state, with no published limits. |
| HMRC, Brreg and the Swiss UID register directly | Free | Three integrations, three response shapes and three authentication models. HMRC uses OAuth2 and needs registration. |
| `vat-validate` (Strale) | {{price:vat-validate}} a call | One JSON shape across the four providers, a cache with a stale fallback when VIES is down, and a Strale API key. |

If you validate EU numbers only occasionally, calling VIES yourself is a reasonable choice. Strale provides one JSON shape across the configured providers, with caching and fallback. Check country availability before depending on a route; GB validation needs configured HMRC access.

## Limits

- **VIES has outages and an undocumented concurrency limit.** Strale retries transient faults. Fresh cached results can be reused for 48 hours. If a provider fails and an older cached result is available, that fallback is marked `stale: true`. An unavailable service is not an invalid VAT registration.
- **Results can lag registry changes.** Fresh cached results can be reused for 48 hours, and registry updates can take time to reach the provider. For a same-day deregistration check, ask the national tax authority.
- **The Swiss UID answer is valid or invalid only.** For Swiss company details use [Swiss Company Data](/tools/swiss-company-data).
- **UK validation needs HMRC credentials.** If GB numbers return a "credentials pending" error, HMRC access is not enabled yet. Use [vat-format-validate](/tools/vat-format-validate) for a format-only check meanwhile.

## Questions

### Is VAT validation free on Strale?

No. The API-key route costs {{price:vat-validate}} per successful call. The tool page also shows the x402 wallet route. The free tools are listed in [Free tools for AI agents](/guides/free-apis-for-ai-agents).

### Why can company_name be empty for a valid VAT number?

Registration validity and available company details are separate. When VIES supplies no name or address, or returns a placeholder, Strale represents that detail as an empty string. The Swiss public validation lookup also returns empty name and address fields. Use a company-data tool if you need a separate company record.

### How fresh is the result?

A repeat lookup within the 48-hour cache window can return the cached answer with no upstream call. Read `cache_hit`, `cached_at` and `cache_age_hours` when present. An older fallback also includes `stale: true`; decide whether its age is acceptable for your workflow.

### Can I pay per call without an API key?

Some tools accept x402 payments with no account. The [x402 page](/docs/x402) explains how it works and the catalogue shows which tools are eligible.
