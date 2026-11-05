---
slug: kyb-workflow-crewai
title: "How do I build a business verification (KYB) workflow with CrewAI?"
description: "Chain a company lookup, a VAT format check and sanctions screening in one CrewAI task. Code included."
group: companies
framework: "CrewAI"
language: "Python"
tools: [uk-company-data, vat-format-validate, sanctions-check, pep-check]
steps:
  - "Install `crewai-strale`."
  - "Create the toolkit with the tools for the company lookup, VAT format check and sanctions screening."
  - "Give a CrewAI agent all three tools."
  - "Define a task that chains the checks and kick off the crew."
---
Give a CrewAI agent `uk-company-data`, `vat-format-validate` and `sanctions-check` and describe the checks as one task. The agent reports what each check found, for a person to review.

## The solution

```python Python
# pip install crewai-strale
from crewai import Agent, Task, Crew
from crewai_strale import StraleToolkit

toolkit = StraleToolkit(api_key="sk_live_YOUR_KEY")
wanted = {"uk-company-data", "vat-format-validate", "sanctions-check"}
tools = [t for t in toolkit.get_tools() if t.name in wanted]

agent = Agent(
    role="Business Verification Analyst",
    goal="Run the verification checks on a company and report what each one found",
    backstory="You report check results exactly as returned and never decide on a person's behalf.",
    tools=tools,
    llm="gpt-4o",
)

task = Task(
    description="Verify UK company 00445790: 1. Look up its registration data. 2. Check the format of its VAT number if the record has one. 3. Run sanctions screening on the company name. Report what each check returned.",
    expected_output="A report of each check's result, with anything a person should review",
    agent=agent,
)

crew = Crew(agents=[agent], tasks=[task])
result = crew.kickoff()
print(result)
```

## How it works

A business verification workflow usually does three things: confirms the company exists in an official register, checks its tax identifiers, and screens it against sanctions lists. The agent starts with the company lookup, then uses what it found for the later checks.

`vat-format-validate` confirms only that a VAT number is well formed. To ask the VIES register whether it is registered, use `vat-validate`.

A sanctions result is a list of matches for a person to review. It is not a verdict on the company.

Strale also sells bundled checks that run these steps in one call, at one price, with one record. Browse them under [Bundled checks](/tools#bundled) before you build your own pipeline.
