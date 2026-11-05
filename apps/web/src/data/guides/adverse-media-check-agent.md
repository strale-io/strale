---
slug: adverse-media-check-agent
title: "How do I add adverse media screening to an AI agent workflow?"
description: "Search news coverage for a company or person from a CrewAI agent with the Strale adverse media tool. Code included."
group: screening
framework: "CrewAI"
language: "Python"
tools: [adverse-media-check, sanctions-check, pep-check, uk-company-data]
steps:
  - "Install `crewai-strale`."
  - "Create the toolkit with your Strale API key."
  - "Give a CrewAI agent the `adverse-media-check` tool."
  - "Run a task and read `risk_level`, the hit counts and `top_articles`."
---
Give a CrewAI agent the `adverse-media-check` tool to search news coverage of a company or person. It costs {{price:adverse-media-check}} a call and returns a risk level, hit counts by category and the top articles with links.

## The solution

```python Python
# pip install crewai-strale
from crewai import Agent, Task, Crew
from crewai_strale import StraleToolkit

toolkit = StraleToolkit(api_key="sk_live_YOUR_KEY")
tools = [t for t in toolkit.get_tools() if t.name == "adverse-media-check"]

agent = Agent(
    role="Media Screening Analyst",
    goal="Screen entities for adverse media coverage",
    backstory="You report what the screening found, with the sources, and leave the decision to a person.",
    tools=tools,
    llm="gpt-4o",
)

task = Task(
    description="Screen 'Acme Corporation' for adverse media such as fraud, lawsuits and regulatory actions",
    expected_output="The findings with their sources",
    agent=agent,
)

crew = Crew(agents=[agent], tasks=[task])
result = crew.kickoff()
print(result)
```

## How it works

The tool searches Dilisense's news index, which is organised by financial-crime category. If Dilisense is unavailable (quota exhausted, a server error or a missing key), it falls back to a web search. The answer says which path produced it in `source`, and results from the fallback are weaker evidence.

The answer has `risk_level`, `total_hits`, a `categories` breakdown and `top_articles`, each with a headline, category and source link. The risk level follows fixed rules, and the thresholds are in `risk_level_thresholds` in the answer. No language model makes the call.

The search window is the last 12 months, and the company needs to be searched by its registered name. For a plain-language summary of several checks, run `risk-narrative-generate` on the results. That tool uses a language model, and this one does not.

A hit means news coverage matched the name. It is not a finding about the person or company: a person should read the articles and decide.
