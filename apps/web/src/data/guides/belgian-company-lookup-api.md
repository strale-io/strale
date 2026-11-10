---
slug: belgian-company-lookup-api
title: "Belgian company lookup API: enterprise numbers and names"
description: "Look up a Belgian company by KBO/BCE enterprise number or name. Read the returned identity, understand name matching and check VAT registration separately."
group: companies
framework: "REST API"
language: "cURL"
tools: [belgian-company-data, vat-validate, sanctions-check]
countries: [BE]
---
Use `belgian-company-data` to retrieve a company record by enterprise number or name. The tool returns KBO/BCE public-register data supplied by CBEAPI.be. It costs {{price:belgian-company-data}} per successful call with an API key. Prefer the enterprise number when you know it: a name lookup returns the first provider match.

## Look up an enterprise number

Set `STRALE_API_KEY` to your API key, then run:

```bash cURL
curl -X POST https://api.strale.io/v1/do \
  -H "Authorization: Bearer $STRALE_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "capability_slug": "belgian-company-data",
    "inputs": { "enterprise_number": "0417497106" },
    "max_price_cents": 5
  }'
```

The enterprise number can include dots or a BE prefix. To search by name instead, replace the inputs object with `{"company_name":"ANHEUSER-BUSCH INBEV"}`. This is a single-record lookup, not a list of search candidates. Check the returned name and registration number before using the result.

## Read the record

The response's `output` contains the company fields. `registration_number` is the enterprise number; `company_name` is the returned name. Address, legal form and registration date may be missing. This tool does not supply directors or beneficial owners.

The returned `vat_number` is derived from the enterprise number. It does not show whether the company is registered for VAT. Use [VAT Validation](/tools/vat-validate) for that separate check.

## Continue the workflow

Compare the returned record with the supplier or invoice details you already have. If the identities differ, resolve that mismatch before running further checks. [Sanctions Check](/tools/sanctions-check) can then screen the company name for potential matches; those results still need review.

See [Belgian Company Data](/tools/belgian-company-data) for the full fields, source and limitations, or [company records for Belgium](/company-data/belgium) for the country’s other tools.
