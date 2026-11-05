---
slug: compliance-agent-strale-fallback
title: "How do I make a screening agent resilient with a fallback source?"
description: "Fall back to the Strale sanctions check when your primary screening provider fails, and tag the result so it can be reviewed. Code included."
group: screening
framework: "Python SDK"
language: "Python"
tools: [sanctions-check, pep-check, adverse-media-check]
steps:
  - "Install the Strale Python SDK, `straleio`."
  - "Wrap your primary screening call in a try/except."
  - "On failure, call `sanctions-check` with the same name."
  - "Tag the result as a fallback so downstream systems know which source answered."
---
Try your primary screening provider first and call `sanctions-check` only when it fails, tagging the result with its source. The tool costs {{price:sanctions-check}} a call, and its matches are for a person to review.

## The solution

```python Python
# pip install straleio
from straleio import Strale, DoRequest

strale = Strale(api_key="sk_live_YOUR_KEY")


def screen_entity(name: str) -> dict:
    """Screen with the primary source, and fall back to Strale."""
    try:
        return primary_sanctions_api.check(name)  # your primary provider
    except Exception as err:
        result = strale.do(DoRequest(
            capability_slug="sanctions-check",
            inputs={"name": name},
            max_price_cents=30,
        ))
        return {
            "source": "strale_fallback",
            "matches": result.output.get("matches", []),
            "fallback_reason": str(err),
        }


print(screen_entity("Acme Corporation"))
```

## How it works

Screening that runs on every onboarding should not stop because one provider is down. The pattern tries your primary provider first and switches to Strale on a timeout, rate limit or error.

Tag fallback results with their source, as `source` does here, so your records show which provider produced each answer.

Before relying on it, run both sources on names where you know the expected answer, so you understand how they differ before an outage forces the switch. Either way, matches are for a person to review.
