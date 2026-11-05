---
slug: uk-company-verification-agent
title: "How do I verify a UK company in a Python AI agent?"
description: "Look up a UK company at Companies House by company number from a Pydantic AI agent with the Strale Python SDK. Code included."
group: companies
framework: "Pydantic AI"
language: "Python"
tools: [uk-company-data, beneficial-ownership-lookup, sanctions-check, vat-validate]
countries: [GB]
steps:
  - "Install `straleio` and `pydantic-ai`."
  - "Create the Strale client with your API key."
  - "Define a tool that calls `uk-company-data` with a company number."
  - "Run the agent and read the company status."
---
Call `uk-company-data` from a Pydantic AI tool function to read a UK company's record from Companies House by company number. It costs {{price:uk-company-data}} a call.

## The solution

```python Python
# pip install straleio pydantic-ai
from straleio import Strale, DoRequest
from pydantic_ai import Agent

strale = Strale(api_key="sk_live_YOUR_KEY")

agent = Agent("openai:gpt-4o")


@agent.tool_plain
def lookup_uk_company(company_number: str) -> dict:
    """Look up a UK company by its Companies House number."""
    result = strale.do(DoRequest(
        capability_slug="uk-company-data",
        inputs={"company_number": company_number},
        max_price_cents=50,
    ))
    return result.output


response = agent.run_sync("Verify UK company 00445790 and tell me if it is active")
print(response.output)
```

## How it works

The tool reads the company's record at Companies House, the UK's official company register. The answer includes the company name and number, status (such as active, dissolved or in liquidation), registered address, SIC codes, company type, incorporation date and the officers the register lists.

It covers registered companies. Sole traders and unregistered partnerships are not in the register.

For who controls the company, pair it with [beneficial-ownership-lookup](/tools/beneficial-ownership-lookup), which reads the register of persons with significant control.
