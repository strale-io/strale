---
slug: financial-data-validation-pipeline
title: "How do I build a payment-details validation pipeline with an AI agent?"
description: "Combine IBAN, SWIFT and VAT checks as tools in a Pydantic AI agent that validates payment details. Code included."
group: payments
framework: "Pydantic AI"
language: "Python"
tools: [iban-validate, swift-validate, vat-validate, sepa-xml-validate]
steps:
  - "Install `straleio` and `pydantic-ai`."
  - "Create the Strale client with your API key."
  - "Define one tool function each for IBAN, SWIFT and VAT."
  - "Run the agent with all the payment details."
---
Register `iban-validate`, `swift-validate` and `vat-validate` as tools on a Pydantic AI agent and give it the payment details. The agent decides which checks to run. IBAN validation is {{cost:iban-validate}}; the SWIFT and VAT checks cost {{price:swift-validate}} and {{price:vat-validate}} a call.

## The solution

```python Python
# pip install straleio pydantic-ai
from straleio import Strale, DoRequest
from pydantic_ai import Agent

strale = Strale(api_key="sk_live_YOUR_KEY")

agent = Agent("openai:gpt-4o")


@agent.tool_plain
def validate_iban(iban: str) -> dict:
    """Validate an IBAN and return the parsed bank code and country."""
    return strale.do(DoRequest(
        capability_slug="iban-validate",
        inputs={"iban": iban},
        max_price_cents=5,
    )).output


@agent.tool_plain
def validate_swift(swift: str) -> dict:
    """Validate a SWIFT/BIC code."""
    return strale.do(DoRequest(
        capability_slug="swift-validate",
        inputs={"swift": swift},
        max_price_cents=10,
    )).output


@agent.tool_plain
def validate_vat(vat_number: str) -> dict:
    """Check an EU VAT number against the VIES register."""
    return strale.do(DoRequest(
        capability_slug="vat-validate",
        inputs={"vat_number": vat_number},
        max_price_cents=20,
    )).output


result = agent.run_sync(
    "Validate this payment data: IBAN DE89370400440532013000, "
    "SWIFT ESSESESS, VAT SE556703748501"
)
print(result.output)
```

## How it works

Payment details usually carry several identifiers: the recipient's IBAN, their bank's SWIFT code and the company's VAT number. Each is a separate tool, and the agent runs the checks that match what it was given. Given only an IBAN, it makes one call.

The agent can compare results across tools, for example the bank code parsed from the IBAN against the one parsed from the SWIFT code.

Use `vat-validate` when you need the live VIES answer and the company name. `vat-format-validate` only checks the format.

Each call carries its own `max_price_cents` ceiling, so a change in price can never spend more than you allowed.
