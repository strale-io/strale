---
slug: full-kyc-pipeline-python
title: "How do I run PEP, sanctions and adverse media checks together in Python?"
description: "Register PEP, sanctions and adverse media checks as tools on a Pydantic AI agent and collect their results. Code included."
group: screening
framework: "Pydantic AI"
language: "Python"
tools: [pep-check, sanctions-check, adverse-media-check, beneficial-ownership-lookup]
steps:
  - "Install `straleio` and `pydantic-ai`."
  - "Define one tool function each for the PEP, sanctions and adverse media checks."
  - "Create an agent with the three tools."
  - "Run it with a name and country and read each check's result."
---
Register `pep-check`, `sanctions-check` and `adverse-media-check` as tools on a Pydantic AI agent and ask it to run all three for a name. They cost {{price:pep-check}}, {{price:sanctions-check}} and {{price:adverse-media-check}} a call. The agent reports what each returned; a person decides what it means.

## The solution

```python Python
# pip install straleio pydantic-ai
from straleio import Strale, DoRequest
from pydantic_ai import Agent

strale = Strale(api_key="sk_live_YOUR_KEY")

agent = Agent(
    "openai:gpt-4o",
    system_prompt="Report what each check returned. Do not decide whether a person is acceptable.",
)


@agent.tool_plain
def pep_check(name: str, country: str = "") -> dict:
    """Check whether a person appears in a database of politically exposed persons. country is an ISO two-letter code, such as SE."""
    inputs = {"name": name}
    if country:
        inputs["country"] = country
    return strale.do(DoRequest(capability_slug="pep-check", inputs=inputs, max_price_cents=30)).output


@agent.tool_plain
def sanctions_screen(name: str) -> dict:
    """Search a name against consolidated sanctions lists."""
    return strale.do(DoRequest(capability_slug="sanctions-check", inputs={"name": name}, max_price_cents=30)).output


@agent.tool_plain
def adverse_media(name: str) -> dict:
    """Search news coverage of a name."""
    return strale.do(DoRequest(capability_slug="adverse-media-check", inputs={"name": name}, max_price_cents=30)).output


response = agent.run_sync(
    "Run PEP, sanctions and adverse media checks on 'Jane Doe' from Sweden"
)
print(response.output)
```

## How it works

Customer checks often combine three searches: is the person politically exposed, are they on a sanctions list, and is there negative news coverage. Each is a separate tool, and the agent calls the ones it was asked to.

Each tool returns matches or hits for a person to review. The system prompt tells the agent to report them and not to decide. Whether a customer is accepted is a decision for your process, not for the screening result.

To run a fixed set of checks on a company, with one price and one record, look at the bundled checks under [Bundled checks](/tools#bundled).
