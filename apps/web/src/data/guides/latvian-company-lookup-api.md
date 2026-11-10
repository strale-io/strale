---
slug: latvian-company-lookup-api
title: "Latvian company lookup API: find a register record"
description: "Look up a Latvian company by registration number, interpret register status and distinguish missing officers from a failed officers lookup."
group: companies
framework: "REST API"
language: "cURL"
tools: [latvian-company-data, vat-validate, sanctions-check]
countries: [LV]
---
Use `latvian-company-data` to retrieve a Latvian Enterprise Register record by registration number or name. A successful API-key call costs {{price:latvian-company-data}}. Start with the exact 11-digit number when you have it.

## Look up a registration number

Set `STRALE_API_KEY` to your API key, then run:

```bash cURL
curl -X POST https://api.strale.io/v1/do \
  -H "Authorization: Bearer $STRALE_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "capability_slug": "latvian-company-data",
    "inputs": { "reg_number": "40003245752" },
    "max_price_cents": 5
  }'
```

Compare `output.reg_number` and `output.company_name` with the company you intended to check. A failed request or missing match is not evidence that a business has closed.

## Search by name when needed

Replace the inputs with `{"company_name":"Air Baltic"}`. Supply one lookup field at a time: `reg_number` takes precedence over `company_name`, which takes precedence over `task`. Text containing an 11-digit registration number is treated as an identifier lookup.

Name search selects one record from up to ten source matches, preferring records without a termination date. Check the returned registration number and address; this is not a list of candidates or a verified identity match.

## Interpret status and officers

The [Latvian Enterprise Register dataset](https://data.gov.lv/dati/lv/dataset/uz) is refreshed daily. A request today can still precede the publication of a recent filing. The tool derives `Reģistrēts` (registered), `Likvidēts` (liquidated) and `Slēgts` (closed) from the source’s termination and closure fields. These labels do not assess solvency.

`legal_representatives` contains available current officers and other persons entitled to represent the entity. An empty array means the lookup returned no named entries; `null` means that lookup failed. Read `tier_2_available_reason` alongside it. A failure can leave the company record available while officer information is unavailable.

At most 50 officer records are requested. `total_legal_representatives` reports the source total when provided, so it can exceed the returned list length. Historical officers, birth dates, beneficial owners and financial statements are outside this response. Other missing source fields can be null.

## Continue with the matched company

The returned `vat_number` is derived from the registration number. It does not establish VAT registration; use [VAT Validation](/tools/vat-validate) for a separate VIES check. After confirming the entity’s identity, [Sanctions Check](/tools/sanctions-check) can identify potential name matches for review.

See [Latvian Company Data](/tools/latvian-company-data) for the fields and current limitations, or [company records for Latvia](/company-data/latvia) for related tools.
