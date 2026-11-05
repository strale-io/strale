---
slug: multi-step-due-diligence-agent
title: "How do I run a multi-step company check with a bundled check from an agent?"
description: "Call a bundled check from a CrewAI tool so one call runs the registry, VAT, screening and media steps and returns one record. Code included."
group: agents
framework: "CrewAI"
language: "Python"
tools: [uk-company-data, sanctions-check, pep-check, vat-validate]
steps:
  - "Install `crewai-strale` and `httpx`."
  - "Wrap `POST /v1/solutions/{slug}/execute` in a CrewAI tool: the toolkit's `get_tools()` returns single tools, not bundled checks."
  - "Give a CrewAI agent that tool."
  - "Run the task. The bundle runs its steps on the server in one call."
---
Call a bundled check for a multi-step company check instead of chaining single tools yourself. One call runs the steps, returns each step's result and a summary for a person to review, and leaves one record. The CrewAI and LangChain toolkits do not expose bundled checks, so give the agent a small tool that calls the endpoint.

## The solution

```python Python
# pip install crewai-strale httpx
import os

import httpx
from crewai import Agent, Task, Crew
from crewai.tools import tool

API_KEY = os.environ["STRALE_API_KEY"]


@tool("run_kyb_complete_uk")
def run_kyb_complete_uk(company_number: str) -> dict:
    """Run the KYB Complete bundled check for a UK company: registry, VAT,
    screening, adverse media, digital presence and a risk narrative, in one call."""
    resp = httpx.post(
        "https://api.strale.io/v1/solutions/kyb-complete-uk/execute",
        headers={"Authorization": f"Bearer {API_KEY}"},
        json={"inputs": {"company_number": company_number}},
        timeout=60,
    )
    resp.raise_for_status()
    return resp.json()


analyst = Agent(
    role="Company Check Analyst",
    goal="Run the bundled company check and summarise what it found",
    backstory="You prefer the bundled check to chaining single tools, because it returns one record. You report findings and leave decisions to a person.",
    tools=[run_kyb_complete_uk],
    llm="gpt-4o",
)

task = Task(
    description="Run the bundled company check for UK company 00445790 and summarise the findings.",
    expected_output="A summary of the check results, with anything a person should review",
    agent=analyst,
)

result = Crew(agents=[analyst], tasks=[task]).kickoff()
print(result)
```

## How it works

A bundled check combines several tools in one call, with one price and one record. KYB Essentials covers the registry lookup, VAT check, LEI and sanctions screening. KYB Complete adds PEP screening, adverse media, digital presence checks and a plain-language risk narrative. The bundles, their steps and their prices are listed under [Bundled checks](/solutions).

The endpoint is `POST /v1/solutions/{slug}/execute`, and the inputs go in an `inputs` object. The slug names the country, so `kyb-complete-uk` takes a UK company number.

Running the steps in one call removes the coordination code, runs independent steps in parallel on the server and gives you a single record for the whole check. The summary is for a person to review. It is not a verdict.
