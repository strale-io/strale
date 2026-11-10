---
slug: singapore-company-lookup-api
title: "Singapore company lookup API: find an entity by UEN"
description: "Look up Singapore entities by UEN using ACRA open data. Match the returned identity, understand monthly updates and use the available address fields correctly."
group: companies
framework: "REST API"
language: "cURL"
tools: [singapore-company-data, sanctions-check]
countries: [SG]
---
Use `singapore-company-data` to retrieve an ACRA open-data record by UEN or name. A successful API-key call costs {{price:singapore-company-data}}. The response gives your app or agent the entity’s identity, status and available address fields from a monthly snapshot.

## Look up a UEN

Set `STRALE_API_KEY` to your API key, then run:

```bash cURL
curl -X POST https://api.strale.io/v1/do \
  -H "Authorization: Bearer $STRALE_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "capability_slug": "singapore-company-data",
    "inputs": { "uen": "197200078R" },
    "max_price_cents": 5
  }'
```

Compare `output.uen` and `output.entity_name` with the supplier or customer details you already have. Prefer a UEN when it is available. A missing match or failed request does not prove that the entity has been deregistered.

## Search by name when needed

Replace the inputs with `{"company_name":"SINGAPORE AIRLINES LIMITED"}`. Supply one lookup input at a time; `uen` takes priority if both are provided. Name search selects one record from the provider’s results, preferring names containing the search text and then Registered status. It does not return a candidate list or establish that the selected entity is the one you intended.

## Read the source fields

`status` comes from the source; `is_active` is true when that value is Registered. This is not a solvency or compliance assessment. `uen_issue_date` is the source’s UEN issue date. Missing source details can be null.

`registered_address` combines the available street and postal code. It lacks building and unit numbers, so do not treat it as a complete mailing address. The tool returns `entity_name`; it does not return a `company_name` or `vat_number` field or check GST registration.

The [Entities Registered with ACRA dataset](https://data.gov.sg/datasets/d_3f960c10fed6145404ca7b821f263b87/view) is updated monthly. Fetching the API today does not make every record current today. Directors, beneficial owners and financial statements are outside this lookup.

## Continue with the matched identity

Resolve differences between the returned identity and your own records first. You can then use [Sanctions Check](/tools/sanctions-check) to look for potential name matches requiring review.

See [Singapore Company Data](/tools/singapore-company-data) for the fields and current limitations, or [company records for Singapore](/company-data/singapore) for related tools.
