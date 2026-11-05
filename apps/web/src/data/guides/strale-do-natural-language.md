---
slug: strale-do-natural-language
title: "How do I call Strale with a plain-language task instead of a tool name?"
description: "Send a task description instead of a tool slug to POST /v1/do, and see how the match works and when to name the tool instead. Code included."
group: agents
framework: "Python SDK"
language: "Python"
tools: [iban-validate, email-validate, dns-lookup, url-to-markdown]
steps:
  - "Install the Strale Python SDK, `straleio`."
  - "Send `task` instead of `capability_slug`."
  - "Describe what you need in a sentence."
  - "Check `capability_used` in the answer to see which tool ran."
---
Send a `task` instead of a `capability_slug` and Strale picks one tool by matching your words against the tools' descriptions. It is handy for exploring. Name the tool when the answer matters, because a loose match can pick the wrong one.

## The solution

```python Python
# pip install straleio
from straleio import Strale, DoRequest

strale = Strale(api_key="sk_live_YOUR_KEY")

# Naming the tool: predictable.
# strale.do(DoRequest(capability_slug="iban-validate", inputs={"iban": "..."}, max_price_cents=10))

# Describing the task: Strale picks a tool.
result = strale.do(DoRequest(
    task="Check if this IBAN is valid: DE89370400440532013000",
    max_price_cents=50,
))

print(f"Tool used: {result.capability_used}")
print(f"Result: {result.output}")
```

## How it works

When you send a `task`, Strale keeps the tools that cost no more than your ceiling and picks the best match by comparing the words in your task with the tools' descriptions. It is a keyword match, separate from the search box suggestions on the site. One call runs one tool, so a task that needs two checks needs two calls.

`capability_used` in the answer names the tool that ran. Log it, and check it when you rely on the result.

Combine `task` with `max_price_cents` to cap the cost whichever tool is picked. If there is no match, the call fails and nothing is charged. When you know which tool you want, send its `capability_slug` and the inputs it takes.
