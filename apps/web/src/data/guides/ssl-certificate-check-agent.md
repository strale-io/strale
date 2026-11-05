---
slug: ssl-certificate-check-agent
title: "How do I check SSL certificates automatically in an AI agent?"
description: "Read a domain's TLS certificate, its expiry and its issuer from a Pydantic AI agent with the Strale SSL check tool. Code included."
group: web
framework: "Pydantic AI"
language: "Python"
tools: [ssl-check, dns-lookup, header-security-check, domain-reputation]
steps:
  - "Install `straleio` and `pydantic-ai`."
  - "Create the Strale client with your API key."
  - "Define a tool that calls `ssl-check` with a domain."
  - "Run the agent and read the expiry and issuer."
---
Call `ssl-check` from a Pydantic AI tool function to read a domain's certificate: the issuer, the validity dates and how many days remain. It costs {{price:ssl-check}} a call.

## The solution

```python Python
# pip install straleio pydantic-ai
from straleio import Strale, DoRequest
from pydantic_ai import Agent

strale = Strale(api_key="sk_live_YOUR_KEY")

agent = Agent("openai:gpt-4o")


@agent.tool_plain
def check_ssl(domain: str) -> dict:
    """Check the TLS certificate for a domain."""
    result = strale.do(DoRequest(
        capability_slug="ssl-check",
        inputs={"domain": domain},
        max_price_cents=10,
    ))
    return result.output


response = agent.run_sync("Is the certificate for example.com valid, and when does it expire?")
print(response.output)
```

## How it works

The tool connects to the domain, reads the certificate it presents and reports the issuer, `valid_from` and `valid_to` dates, `is_expired`, `is_expiring_soon`, `days_until_expiry`, the TLS protocol, the cipher and the subject alternative names.

Checking `is_expiring_soon` lets an agent raise an alert before a certificate lapses. Only port 443 is checked.
