---
slug: vat-registration-check-agent
title: "How do I check whether a company's VAT registration is valid in an AI agent?"
description: "Check a VAT number against the EU VIES register from a CrewAI agent with the Strale VAT validation tool. Code included."
group: companies
framework: "CrewAI"
language: "Python"
tools: [vat-validate, vat-format-validate, iban-validate, sanctions-check]
steps:
  - "Install `crewai-strale`."
  - "Create the toolkit and keep the `vat-validate` tool. `vat-format-validate` is a different, format-only tool that never asks VIES."
  - "Create an agent for VAT checks."
  - "Run the task and read the registration status and company name."
---
Give a CrewAI agent the `vat-validate` tool to check a VAT number against the EU's VIES register. It costs {{price:vat-validate}} a call. Unlike `vat-format-validate`, it asks the register, not just the number's format.

## The solution

```python Python
# pip install crewai-strale
from crewai import Agent, Task, Crew
from crewai_strale import StraleToolkit

toolkit = StraleToolkit(api_key="sk_live_YOUR_KEY")
tools = [t for t in toolkit.get_tools() if t.name == "vat-validate"]

agent = Agent(
    role="VAT Registration Checker",
    goal="Check whether EU VAT numbers are registered",
    backstory="You report what the VAT register returned and flag anything unclear.",
    tools=tools,
    llm="gpt-4o",
)

task = Task(
    description="Check whether VAT number SE556703748501 is registered, and report the company name",
    expected_output="The registration status and company name",
    agent=agent,
)

crew = Crew(agents=[agent], tasks=[task])
result = crew.kickoff()
print(result)
```

## How it works

`vat-validate` queries VIES, the VAT Information Exchange System run by the European Commission. It returns whether the number is valid and, where the member state releases them, the registered name and address.

VIES is sometimes slow or unavailable for a single country. Results can be served from a cache of up to 48 hours, and if VIES is down a cached result may come back marked `stale: true`. Treat "VIES unavailable" as "unknown", not "invalid".
