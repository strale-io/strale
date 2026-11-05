---
slug: beneficial-ownership-lookup-agent
title: "How do I look up beneficial ownership data for a UK company in a Python agent?"
description: "Find the persons with significant control of a UK company with the Strale beneficial ownership tool. Code included."
group: companies
framework: "Python SDK"
language: "Python"
tools: [beneficial-ownership-lookup, uk-company-data, sanctions-check, pep-check]
countries: [GB]
steps:
  - "Install the Strale Python SDK, `straleio`."
  - "Create the client with your API key."
  - "Call `beneficial-ownership-lookup` with the company name and `gb` as the jurisdiction."
  - "Go through the owners in the answer."
---
Call `beneficial-ownership-lookup` with a company name and `"gb"` as the jurisdiction to read the register of persons with significant control at Companies House. It covers UK companies only, and costs {{price:beneficial-ownership-lookup}} a call.

## The solution

```python Python
# pip install straleio
from straleio import Strale, DoRequest

strale = Strale(api_key="sk_live_YOUR_KEY")

result = strale.do(DoRequest(
    capability_slug="beneficial-ownership-lookup",
    inputs={"company_name": "Tesco PLC", "jurisdiction": "gb"},
    max_price_cents=50,
))

print(f"Source: {result.output['data_source']}")
print(f"Owners found: {result.output['total_beneficial_owners']}")
for owner in result.output.get("beneficial_owners", []):
    print(owner)
```

## How it works

Beneficial ownership shows who ultimately controls a company. This tool reads the UK register of persons with significant control (PSC). Other jurisdictions return a coverage notice rather than owners.

The answer has `data_source`, `company_status`, `total_beneficial_owners`, a `beneficial_owners` list and `has_psc_data`. Check `has_psc_data` before treating an empty list as "no owners": it can mean there is no register to read for that company.

The register can lag real ownership changes, and complex ownership chains are not always fully resolved.
