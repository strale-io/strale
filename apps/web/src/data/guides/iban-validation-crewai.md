---
slug: iban-validation-crewai
title: "How do I add IBAN validation to a CrewAI workflow?"
description: "Give a CrewAI agent the Strale IBAN validation tool and let a crew check payment details. Code included."
group: payments
framework: "CrewAI"
language: "Python"
tools: [iban-validate, swift-validate, sepa-xml-validate, vat-format-validate]
steps:
  - "Install `crewai-strale`."
  - "Create the toolkit with your Strale API key."
  - "Give a CrewAI agent the `iban-validate` tool."
  - "Define a task and kick off the crew."
---
Use the Strale CrewAI toolkit to give an agent the `iban-validate` tool, then describe the check as a task. The tool is {{cost:iban-validate}} to call.

## The solution

```python Python
# pip install crewai-strale
from crewai import Agent, Task, Crew
from crewai_strale import StraleToolkit

toolkit = StraleToolkit(api_key="sk_live_YOUR_KEY")
tools = [t for t in toolkit.get_tools() if t.name == "iban-validate"]

agent = Agent(
    role="Payment Validator",
    goal="Validate IBANs before a payment is made",
    backstory="You check payment details and report exactly what the validation returned.",
    tools=tools,
    llm="gpt-4o",
)

task = Task(
    description="Validate IBAN: DE89370400440532013000",
    expected_output="The validation result with the bank code and country",
    agent=agent,
)

crew = Crew(agents=[agent], tasks=[task])
result = crew.kickoff()
print(result)
```

## How it works

CrewAI organises agents into crews that work on tasks. The Strale toolkit wraps each tool as a CrewAI tool named after its slug, with a description and the price, so the agent can tell when to use `iban-validate`. You can mix Strale tools with other CrewAI tools in one agent.

The tool checks an IBAN's structure, country code and check digits. It does not confirm that the account exists or is open.
