---
slug: company-verification-multiple-countries
title: "How do I verify companies in several countries with one agent?"
description: "Route a company lookup to the right country's Strale tool from a Pydantic AI agent, using an explicit country-to-tool map. Code included."
group: companies
framework: "Pydantic AI"
language: "Python"
tools: [swedish-company-data, uk-company-data, french-company-data, german-company-data]
countries: [SE, GB, FR]
steps:
  - "Install `straleio` and `pydantic-ai`."
  - "Create the Strale client with your API key."
  - "Map each country to its tool and the input that tool takes."
  - "Define one agent tool that looks the country up in the map."
---
Keep a small map from country to the Strale company tool and the identifier it takes, and let one agent tool pick the entry. Each country has its own tool and its own source. The current list is on the [company data pages](/company-data).

## The solution

```python Python
# pip install straleio pydantic-ai
from straleio import Strale, DoRequest
from pydantic_ai import Agent

strale = Strale(api_key="sk_live_YOUR_KEY")

# One entry per country: the tool, and the input it takes.
COMPANY_TOOLS = {
    "SE": ("swedish-company-data", "org_number"),
    "GB": ("uk-company-data", "company_number"),
    "FR": ("french-company-data", "siren"),
}

agent = Agent("openai:gpt-4o")


@agent.tool_plain
def verify_company(country_code: str, identifier: str) -> dict:
    """Look up a company in an official register. country_code is SE, GB or FR."""
    if country_code not in COMPANY_TOOLS:
        return {"error": f"No tool configured for {country_code}"}
    slug, field = COMPANY_TOOLS[country_code]
    result = strale.do(DoRequest(
        capability_slug=slug,
        inputs={field: identifier},
        max_price_cents=50,
    ))
    return {"tool": result.capability_used, **result.output}


response = agent.run_sync(
    "Verify these companies: Swedish org 556703-7485, "
    "UK company 00445790, French SIREN 443061841"
)
print(response.output)
```

## How it works

Each country's register has its own tool, its own source and its own identifier, so the map is where you decide what your agent supports. Adding a country is one more entry. The tool pages list the inputs each one takes.

The same call also accepts a free-text `task` instead of a `capability_slug`. That picks one tool by matching words, which is fine for a quick test and too loose for a workflow where a wrong country would be a wrong answer. See [How do I call Strale with a plain-language task?](/guides/strale-do-natural-language).

`result.capability_used` tells you which tool answered, which is worth logging.
