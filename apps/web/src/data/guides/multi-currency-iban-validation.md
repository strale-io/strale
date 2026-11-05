---
slug: multi-currency-iban-validation
title: "How do I validate IBANs from several countries in one agent run?"
description: "Loop over IBANs from different countries with the Strale Python SDK and read the country and bank code for each. Code included."
group: payments
framework: "Python SDK"
language: "Python"
tools: [iban-validate, swift-validate, sepa-xml-validate, email-validate]
steps:
  - "Install the Strale Python SDK, `straleio`."
  - "Create the client with your API key."
  - "Collect the IBANs."
  - "Validate each one and read the bank code and country code."
---
Call `iban-validate` once per IBAN with the Strale Python SDK. Each call is independent, so a plain loop, or `asyncio` for a large list, is enough. The tool is {{cost:iban-validate}} to call.

## The solution

```python Python
# pip install straleio
from straleio import Strale, DoRequest

strale = Strale(api_key="sk_live_YOUR_KEY")  # the SDK needs a key, even for free tools

ibans = [
    "DE89370400440532013000",  # Germany
    "GB29NWBK60161331926819",  # United Kingdom
    "FR7630006000011234567890189",  # France
    "SE4550000000058398257466",  # Sweden
]

for iban in ibans:
    result = strale.do(DoRequest(
        capability_slug="iban-validate",
        inputs={"iban": iban},
        max_price_cents=5,
    ))
    status = "valid" if result.output["valid"] else "INVALID"
    print(f"{iban[:4]}... {status}, bank code {result.output.get('bank_code', 'N/A')}")
```

## How it works

IBAN length and layout differ by country, and the tool applies each country's rules. A German IBAN has 22 characters, a French one has 27.

For thousands of IBANs, send the calls concurrently. The REST API allows a limited number of requests per second for each key; the limit is in [Connect over the REST API](/docs/api).

The result includes the parsed `bank_code`, `branch_code` where the country has one, and `country_code`, which you can check against your own bank reference data. A valid IBAN does not mean the account exists.
