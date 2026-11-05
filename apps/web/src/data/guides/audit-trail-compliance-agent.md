---
slug: audit-trail-compliance-agent
title: "How do I keep a record of each Strale call in an AI agent?"
description: "Store the transaction ID and your own context for every Strale call so you can retrieve the record later. Code included."
group: agents
framework: "Pydantic AI"
language: "Python"
tools: [sanctions-check, pep-check, adverse-media-check, iban-validate]
steps:
  - "Install `straleio` and `pydantic-ai`."
  - "Wrap each Strale call in a function that records what you need."
  - "Take `transaction_id`, `latency_ms` and `capability_used` from the result."
  - "Store them with your own context, such as an invoice or customer ID."
---
Every API call returns a `transaction_id`. Store it with your own context, such as which invoice or customer the check was for, and you can retrieve Strale's record of the call later.

## The solution

```python Python
# pip install straleio pydantic-ai
from datetime import datetime, timezone

from straleio import Strale, DoRequest
from pydantic_ai import Agent

strale = Strale(api_key="sk_live_YOUR_KEY")

audit_log = []

agent = Agent("openai:gpt-4o")


@agent.tool_plain
def sanctions_check_with_record(name: str, context: str = "") -> dict:
    """Search a name against sanctions lists and keep a record of the call."""
    result = strale.do(DoRequest(
        capability_slug="sanctions-check",
        inputs={"name": name},
        max_price_cents=30,
    ))

    audit_log.append({
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "tool": result.capability_used,
        "name_searched": name,
        "context": context,
        "transaction_id": result.transaction_id,
        "latency_ms": result.latency_ms,
        "matches_found": len(result.output.get("matches", [])),
    })

    return result.output


response = agent.run_sync("Search 'Acme Corp' against sanctions lists for invoice INV-2024-001")
print(f"Result: {response.output}")
print(f"Records: {audit_log}")
```

## How it works

Each API call is recorded on Strale's side under its `transaction_id`: the input, the answer, the source, the price and the time. You can [retrieve a past call](/docs#past-calls) by its `transaction_id`.

Strale's record does not know why you ran the check. Your own record of the transaction ID, the invoice or customer and the reason completes the picture.

The content of a call, its input and answer, is cleared after {{fact:pii_days}} days. The record that the call happened, with its price and time, is kept for {{fact:retention_days}} days. If you need the content for longer, store it yourself.
