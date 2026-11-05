---
slug: agent-resilience-patterns
title: "How do I make an AI agent resilient when external APIs fail?"
description: "Combine a price ceiling, freshness and latency guards and typed error handling around Strale calls. Code included."
group: agents
framework: "Python SDK"
language: "Python"
tools: [iban-validate, email-validate, dns-lookup, sanctions-check]
steps:
  - "Wrap every call with a `max_price_cents` ceiling."
  - "Catch `StraleError` so you can branch on `error_code`."
  - "For freshness or latency guards, send `require_fresh` or `max_latency_ms` in a direct HTTP request: they are API parameters the SDK's typed request does not carry."
  - "Handle the 422 rejection explicitly instead of treating it as a generic failure."
---
Combine a price ceiling (`max_price_cents`), freshness and latency guards (`require_fresh`, `max_latency_ms`) and typed error handling so a failing or expensive call stops cleanly instead of surprising you.

## The solution

```python Python
# pip install straleio httpx
import os

import httpx
from straleio import Strale, DoRequest
from straleio.errors import StraleError

API_KEY = os.environ["STRALE_API_KEY"]
strale = Strale(api_key=API_KEY)


def resilient_call(slug: str, inputs: dict, max_price: int = 50) -> dict:
    """A Strale call with a price ceiling and structured error handling."""
    try:
        result = strale.do(DoRequest(
            capability_slug=slug,
            inputs=inputs,
            max_price_cents=max_price,
        ))
        return {
            "status": "success",
            "data": result.output,
            "tool": result.capability_used,
            "price": result.price_cents,
            "latency_ms": result.latency_ms,
        }
    except StraleError as err:
        return {"status": "error", "error_code": err.error_code, "error": str(err)}


def resilient_call_with_guards(slug: str, inputs: dict, max_price: int = 50, max_latency_ms: int = 3000) -> dict:
    """require_fresh and max_latency_ms are not on the SDK's typed request,
    so send them in a direct request body."""
    resp = httpx.post(
        "https://api.strale.io/v1/do",
        headers={"Authorization": f"Bearer {API_KEY}"},
        json={
            "capability_slug": slug,
            "inputs": inputs,
            "max_price_cents": max_price,
            "require_fresh": True,
            "max_latency_ms": max_latency_ms,
        },
        timeout=30,
    )
    if resp.status_code == 422:
        # The tool's data was stale, or its recent latency is above your limit.
        return {"status": "rejected", **resp.json()}
    resp.raise_for_status()
    return {"status": "success", **resp.json()}


print(resilient_call("iban-validate", {"iban": "DE89370400440532013000"}, max_price=10))
```

## How it works

A resilient agent layers a few defences. `max_price_cents` caps what a call may cost. `require_fresh` rejects reference-data tools whose data is stale. `max_latency_ms` rejects tools whose recent 95th-percentile latency is above your limit. Typed error handling covers the rest.

The SDK raises subclasses of `StraleError` with an `error_code`. Catch `StraleError` and branch on the code, for example `budget_exceeded`, instead of guessing from the message. Which codes are worth retrying is covered in [Handle errors and retries](/docs#errors).

`require_fresh` and `max_latency_ms` are parameters of `POST /v1/do`. The Python SDK's `DoRequest` does not carry them, so send them directly, as shown.
