---
slug: swedish-company-lookup-api
title: "Swedish company registry API: look up a company by organisation number"
description: "Query Sweden's official company register, Bolagsverket, by organisation number with one REST call. Inputs, output fields, limits and a comparison."
group: companies
framework: "REST API"
language: "cURL, TypeScript"
tools: [swedish-company-data, vat-validate, norwegian-company-data]
countries: [SE]
---
`swedish-company-data` reads Bolagsverket's Värdefulla datamängder (HVD) API, the open company dataset Sweden publishes under the EU Open Data Directive, behind one REST call. It costs {{price:swedish-company-data}} a call. You need a Strale API key, and you do not sign Bolagsverket's own data-use agreement or handle its OAuth2 yourself.

## The solution

```bash cURL
curl -X POST https://api.strale.io/v1/do \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer sk_live_YOUR_KEY" \
  -d '{
    "capability_slug": "swedish-company-data",
    "inputs": { "org_number": "556703-7485" },
    "max_price_cents": 10
  }'
```
```typescript TypeScript SDK
// npm install straleio
import { Strale } from "straleio";

const strale = new Strale({ apiKey: process.env.STRALE_API_KEY! });

const result = await strale.do({
  capability_slug: "swedish-company-data",
  inputs: { org_number: "556703-7485" },
  max_price_cents: 10,
});

console.log(result.output.company_name, result.output.status);
```

A sample answer, with every field the tool returns, is on the [Sweden page](/company-data/sweden).

## How the lookup works

Strale calls Bolagsverket's HVD API on its side for every request. You send an `org_number` and get normalised JSON back. You never provision Bolagsverket credentials, handle token refresh or read its raw field names yourself.

The answer is attributed to Bolagsverket, and the data carries a CC BY 4.0 licence (`provenance.attribution` and `provenance.license`).

## What you get back

Company name, legal form, active or deregistered status, registered address, SNI industry codes, registration date and any ongoing insolvency or restructuring procedures.

`vat_number` is on every answer. It is derived from the organisation number (SE, then the number, then 01), not fetched from a separate source, so it is present even though the HVD API does not return it.

Not included: financials such as revenue, profit, employee numbers and equity. Those sit in Bolagsverket's separate annual report API, which this tool does not call.

## Input format

`org_number` takes a 10-digit Swedish organisationsnummer, with or without the hyphen (`556703-7485` or `5567037485`). There is no search by name: the HVD API accepts only the number.

## Ways to get this data

| Source | Cost | Effort | Notes |
| --- | --- | --- | --- |
| Bolagsverket HVD API directly | Free | High | You apply to Bolagsverket for your own OAuth2 client credentials, then build the token handling and response normalisation. |
| `swedish-company-data` (Strale) | {{price:swedish-company-data}} a call | Low | One HTTP call, no Bolagsverket agreement to sign, normalised JSON, and the source and a record of the call in the answer. Needs a Strale API key. |

## Limits

- **Registry data only.** The tool returns identity, status, address, SNI codes, registration date and insolvency flags. Annual-report financials need Bolagsverket's separate API or a licensed provider.
- **Organisation number required.** If you only have a name, find the number first, for example from a Swedish VAT number you already hold.
- **Sole traders can have several registrations.** A sole trader (enskild näringsidkare) can have more than one registered business under the same personal number. Only the first entry is returned.
- **Deregistered companies return historical data.** The record reflects the state at deregistration. Check `is_active` and `deregistered_date` before relying on it.

## Questions

### Where does the data come from?

From Bolagsverket's official Värdefulla datamängder (HVD) API.

### Can I look up a Swedish company by name?

Not with this tool. Bolagsverket's HVD API accepts only the organisation number, so there is no name search to call.

### Is Swedish company data free on Strale?

No. It costs {{price:swedish-company-data}} a call and needs an API key. The free tools are listed in [Free tools for AI agents](/guides/free-apis-for-ai-agents); company register lookups are not among them.

### What licence covers the data?

CC BY 4.0, attributed to Bolagsverket, under Commission Implementing Regulation (EU) 2023/138 on high-value datasets.
