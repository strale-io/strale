---
slug: swift-bic-validation-agent
title: "How do I validate SWIFT/BIC codes in an AI agent pipeline?"
description: "Validate SWIFT/BIC codes with the Strale Python SDK and read the bank code, country code and head-office flag. Code included."
group: payments
framework: "Python SDK"
language: "Python"
tools: [swift-validate, iban-validate, sepa-xml-validate, vat-format-validate]
steps:
  - "Install the Strale Python SDK, `straleio`."
  - "Create the client with your API key."
  - "Call `swift-validate` with the code and a price ceiling."
  - "Read the result: validity, bank code, country code and the head-office flag."
---
Call `swift-validate` through the Strale Python SDK to check a SWIFT/BIC code's format and read the bank code, country code and whether it is a head-office code. It costs {{price:swift-validate}} a call.

## The solution

```python Python
# pip install straleio
from straleio import Strale, DoRequest

strale = Strale(api_key="sk_live_YOUR_KEY")

result = strale.do(DoRequest(
    capability_slug="swift-validate",
    inputs={"swift": "COBADEFFXXX"},
    max_price_cents=10,
))

print(f"Valid: {result.output['valid']}")
print(f"Bank code: {result.output['bank_code']}")
print(f"Country code: {result.output['country_code']}")
print(f"Head office: {result.output['is_head_office']}")
```

## How it works

A SWIFT/BIC code is 8 or 11 characters long. The tool checks the format and length, then reads the bank code, country code, location code and branch code from the string itself. A code of 8 characters, or of 11 ending in XXX, is a head-office code, which is what `is_head_office` reports.

It is structural parsing, not a lookup in a bank directory. It does not return the bank's name and does not confirm that the code is in use. Pair it with your own bank reference data if you need either.

`max_price_cents` is required on every call. It caps what the call may cost, and the call is refused if the tool costs more.
