---
slug: strale-fallback-middleware-agent
title: "How do I add an automatic API fallback to an AI agent?"
description: "Wrap a primary data source in a try/except and call a Strale tool when it fails, tagging the result so you can see how often. Code included."
group: agents
framework: "Python SDK"
language: "Python"
tools: [iban-validate, swift-validate, email-validate, sanctions-check]
steps:
  - "Install the Strale Python SDK, `straleio`."
  - "Wrap your existing call in a try/except."
  - "On failure, call the Strale tool with the same input."
  - "Tag the result as a fallback so downstream systems and monitoring can see it."
---
Keep your primary data source and call a Strale tool only when it fails. The pattern works for any tool; this example uses `iban-validate`, which is {{cost:iban-validate}} to call.

## The solution

```python Python
# pip install straleio
from straleio import Strale, DoRequest

strale = Strale(api_key="sk_live_YOUR_KEY")  # the SDK needs a key, even for free tools


def resilient_iban_check(iban: str) -> dict:
    """Validate an IBAN with the primary service, and fall back to Strale."""
    try:
        # Your primary validation service
        return primary_api.validate_iban(iban)
    except Exception as err:
        result = strale.do(DoRequest(
            capability_slug="iban-validate",
            inputs={"iban": iban},
            max_price_cents=5,
        ))
        return {
            **result.output,
            "_fallback": True,
            "_fallback_reason": str(err),
        }


print(resilient_iban_check("DE89370400440532013000"))
```

## How it works

The fallback pattern is the smallest way to add Strale to an existing agent. Your primary source stays as it is, and Strale answers only when it fails, which removes a single point of failure without a rewrite.

Decide what counts as a failure: timeouts, HTTP errors, rate limits or an answer in an unexpected shape. Catching a broad `Exception` is the safest choice for a fallback.

Tag fallback results, as `_fallback` does here. Your monitoring can then count them, which tells you whether the primary source needs attention or whether Strale should become the primary.

If the primary is a screening or other compliance source, do not switch over blind. Run both on cases where you know the expected answer first, so you understand how the sources differ before an outage forces the change, and have a person review matches either way.
