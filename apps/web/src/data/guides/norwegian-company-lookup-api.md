---
slug: norwegian-company-lookup-api
title: "Norwegian company registry API: look up a company at Brønnøysundregistrene"
description: "Query Norway's official company register, Brreg, by organisation number or company name with one REST call, with board and CEO roles included."
group: companies
framework: "REST API"
language: "cURL, TypeScript"
tools: [norwegian-company-data, vat-validate, swedish-company-data]
countries: [NO]
---
`norwegian-company-data` queries Brønnøysundregistrene (Brreg), Norway's official company register, by 9-digit organisation number or by company name. It costs {{price:norwegian-company-data}} a call. Unlike a plain Brreg entity lookup, the answer includes the legal representatives (board members, CEO and signatories) from Brreg's separate roles endpoint, merged in.

## The solution

```bash cURL: by organisation number
curl -X POST https://api.strale.io/v1/do \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer sk_live_YOUR_KEY" \
  -d '{
    "capability_slug": "norwegian-company-data",
    "inputs": { "org_number": "923609016" },
    "max_price_cents": 10
  }'
```
```bash cURL: by name
curl -X POST https://api.strale.io/v1/do \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer sk_live_YOUR_KEY" \
  -d '{
    "capability_slug": "norwegian-company-data",
    "inputs": { "company_name": "Equinor" },
    "max_price_cents": 10
  }'
```
```typescript TypeScript SDK
import { Strale } from "straleio";

const strale = new Strale({ apiKey: process.env.STRALE_API_KEY! });

const result = await strale.do({
  capability_slug: "norwegian-company-data",
  inputs: { org_number: "923609016" },
  max_price_cents: 10,
});

console.log(result.output.company_name, result.output.legal_representatives.length);
```

A sample answer, with every field the tool returns, is on the [Norway page](/company-data/norway).

## Organisation number or company name

An `org_number` goes straight to Brreg, which is the fastest and most predictable route. A `company_name`, or a phrase such as "the Norwegian oil company Equinor", first goes through a short language-model step that pulls out a clean name, and Brreg is then searched by that name. Both work. Use the number when you have it.

## What the roles merge adds

A plain Brreg entity lookup does not say who runs the company. Strale makes a second call to Brreg's roles endpoint and merges in the board members, CEO, deputy chair and signatories, with their role and, for individuals, date of birth. They come back in one `legal_representatives` list, which saves you from reading Brreg's nested role groups yourself.

## Ways to get this data

| Source | Cost | Effort | Notes |
| --- | --- | --- | --- |
| data.brreg.no directly | Free | Medium | Well documented, no key needed. You write the client, the roles merge if you want representatives, and the error handling. |
| `norwegian-company-data` (Strale) | {{price:norwegian-company-data}} a call | Low | One call, representatives merged in, search by number or name, and the same call shape as the other country tools. Needs a Strale API key. |

If you need only the raw entity record and are happy to write a Brreg client, calling Brreg directly is free and reasonable. Strale is for when you want the representatives merged in, search by name, or one way of calling every country.

## Limits

- **Sole proprietorships are not covered.** Enkeltpersonforetak are not included. Query Brønnøysundregistrene directly for that entity type.
- **Financial figures can be up to 12 months old.** They come from annual reports. Check Brreg's accounts register for the latest filing if freshness matters.

## Questions

### Do I need the exact legal name?

No. A `company_name` goes through a name-extraction step before Brreg is searched, so reasonably close input works. An `org_number` is exact and skips that step.

### Does this cover sole proprietorships?

No. Enkeltpersonforetak are not covered.

### Is it free?

No. It costs {{price:norwegian-company-data}} a call and needs a Strale API key.
