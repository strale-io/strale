---
slug: aml-screening-agent-workflow
title: "How do I screen a person against sanctions, PEP and media lists in a CrewAI workflow?"
description: "Give a CrewAI agent the sanctions, PEP and adverse media tools and have it report what each search found. Code included."
group: screening
framework: "CrewAI"
language: "Python"
tools: [sanctions-check, pep-check, adverse-media-check, beneficial-ownership-lookup]
steps:
  - "Install `crewai-strale`."
  - "Create the toolkit and keep the sanctions, PEP and adverse media tools."
  - "Create an analyst agent with the three tools."
  - "Define a screening task and kick off the crew."
---
Give a CrewAI agent `sanctions-check`, `pep-check` and `adverse-media-check` and describe the person to screen as a task. The agent reports what each search found, for a person to review.

## The solution

```python Python
# pip install crewai-strale
from crewai import Agent, Task, Crew
from crewai_strale import StraleToolkit

toolkit = StraleToolkit(api_key="sk_live_YOUR_KEY")
wanted = {"sanctions-check", "pep-check", "adverse-media-check"}
tools = [t for t in toolkit.get_tools() if t.name in wanted]

agent = Agent(
    role="Screening Analyst",
    goal="Run sanctions, PEP and adverse media searches and report what each found",
    backstory="You run the searches you are asked for and report the matches and their sources. You do not decide whether a person is acceptable.",
    tools=tools,
    llm="gpt-4o",
)

task = Task(
    description="Screen this person. Name: John Smith. Country: United Kingdom. Run the sanctions, PEP and adverse media searches and list what each returned.",
    expected_output="A list of what each search returned, with sources, for a person to review",
    agent=agent,
)

crew = Crew(agents=[agent], tasks=[task])
result = crew.kickoff()
print(result)
```

## How it works

Anti-money-laundering programmes usually combine three searches: sanctions lists, politically exposed persons and negative news. Each Strale tool runs one of them.

The agent decides the order, and reports every result, including empty ones. Matches need a person's judgement, because common names produce false matches. Pass the country and, for a person, the birth date to narrow them.

A bundled check runs a fixed set of steps in one call, at one price, with one record. They are listed under [Bundled checks](/solutions).
