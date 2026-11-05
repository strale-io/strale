---
slug: eori-number-validation-agent
title: "How do I validate EU EORI numbers in an AI agent?"
description: "Check an EORI number against the European Commission's EORI system with the Strale Python SDK. Code included."
group: payments
framework: "Python SDK"
language: "Python"
tools: [eori-validate, vat-format-validate, iban-validate, sanctions-check]
steps:
  - "Install the Strale Python SDK, `straleio`."
  - "Create the client with your API key."
  - "Call `eori-validate` with the EORI number."
  - "Read the result: validity, country and, when the register has it, the trader name."
---
Call `eori-validate` through the Strale Python SDK to check an EORI number against the EU's EORI validation system. It costs {{price:eori-validate}} a call.

## The solution

```python Python
# pip install straleio
from straleio import Strale, DoRequest

strale = Strale(api_key="sk_live_YOUR_KEY")

result = strale.do(DoRequest(
    capability_slug="eori-validate",
    inputs={"eori": "SE5560360793"},
    max_price_cents=20,
))

print(f"Valid: {result.output['valid']}")
print(f"Country: {result.output['country_code']}")
print(f"Trader name: {result.output.get('trader_name', 'N/A')}")
```

## How it works

An EORI (Economic Operators Registration and Identification) number identifies a business in EU customs declarations. The tool checks the number against the European Commission's EORI validation system.

The answer holds the validity, the country code and, where the register has a record, the trader's name. The register can be slow or return no trader details for a number that is valid, so treat `trader_name` as best effort.
