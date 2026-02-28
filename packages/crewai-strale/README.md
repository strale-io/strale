# crewai-strale

All 233 [Strale](https://strale.dev) capabilities as CrewAI tools. Company data, VAT validation, web scraping, compliance checks, and more — available to your CrewAI agents with a single import.

## Install

```bash
pip install crewai-strale
```

## Quick start

```python
from crewai_strale import StraleToolkit

toolkit = StraleToolkit(api_key="sk_live_...")
tools = toolkit.get_tools()  # 233 capabilities + search & balance tools
```

## Filter by category

```python
tools = toolkit.get_tools(categories=["finance", "compliance"])
```

## Use with CrewAI

```python
from crewai import Agent, Task, Crew
from crewai_strale import StraleToolkit

toolkit = StraleToolkit(api_key="sk_live_...")
tools = toolkit.get_tools()

researcher = Agent(
    role="Business Analyst",
    goal="Research and validate European companies",
    backstory="Expert in EU business data and compliance",
    tools=tools,
)

task = Task(
    description="Validate VAT number SE556703748501 and look up the company",
    agent=researcher,
    expected_output="Company details with VAT validation status",
)

crew = Crew(agents=[researcher], tasks=[task])
result = crew.kickoff()
```

## What's included

Each Strale capability becomes a CrewAI `BaseTool` with:

- **name** — capability slug (e.g. `vat-validate`, `swedish-company-data`)
- **description** — what it does + price in EUR
- **args_schema** — Pydantic model generated from the capability's input schema
- **_run()** — calls the Strale API

Plus two meta-tools:

- **strale_search** — discover capabilities by keyword
- **strale_balance** — check your wallet balance

## Get an API key

Sign up at [strale.dev](https://strale.dev) — new accounts get €2.00 in trial credits, no card required.

## Links

- [Strale API docs](https://strale.dev/docs)
- [Full capability catalog](https://api.strale.io/v1/capabilities)
- [LangChain plugin](https://pypi.org/project/langchain-strale/)
- [MCP server](https://www.npmjs.com/package/strale-mcp)
