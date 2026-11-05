---
slug: domain-reputation-check-agent
title: "How do I check a domain's basic health in an AI agent pipeline?"
description: "Score a domain on whether it resolves, serves HTTPS and has MX, SPF and DMARC records, from a CrewAI agent. Code included."
group: web
framework: "CrewAI"
language: "Python"
tools: [domain-reputation, dns-lookup, ssl-check, email-validate]
steps:
  - "Install `crewai-strale`."
  - "Create the toolkit with your Strale API key."
  - "Give a CrewAI agent the `domain-reputation` tool."
  - "Run the task and read the score, grade and issues."
---
Give a CrewAI agent the `domain-reputation` tool for a quick screen of a domain. It costs {{price:domain-reputation}} a call and returns a score, a grade, a `checks` object and a list of issues.

## The solution

```python Python
# pip install crewai-strale
from crewai import Agent, Task, Crew
from crewai_strale import StraleToolkit

toolkit = StraleToolkit(api_key="sk_live_YOUR_KEY")
tools = [t for t in toolkit.get_tools() if t.name == "domain-reputation"]

agent = Agent(
    role="Domain Analyst",
    goal="Assess the basic health of a domain",
    backstory="You report the checks and issues the tool returned and do not add to them.",
    tools=tools,
    llm="gpt-4o",
)

task = Task(
    description="Assess example.com and list the issues the check found",
    expected_output="The score, grade and issues",
    agent=agent,
)

crew = Crew(agents=[agent], tasks=[task])
result = crew.kickoff()
print(result)
```

## How it works

The tool combines DNS and connectivity signals: whether the domain resolves, whether HTTPS works, and whether it has MX, SPF and DMARC records. It turns them into a `reputation_score` and a letter `grade`.

The `checks` object holds each signal (`has_mx`, `has_spf`, `has_dmarc`, `resolves`, `https_works`), and `issues` lists plain-language findings such as "Domain does not resolve to any IP address".

It is a fast screen for email deliverability and basic hygiene. A listing on a blocklist or a domain's age are different questions, and this tool does not answer them.
