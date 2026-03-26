# langchain-strale

All 250+ [Strale](https://strale.dev) capabilities as LangChain tools. Company data, VAT validation, web scraping, compliance checks, and more — available to your LangChain agents with a single import.

## Install

```bash
pip install langchain-strale
```

## Quick start

```python
from langchain_strale import StraleToolkit

toolkit = StraleToolkit(api_key="sk_live_...")
tools = toolkit.get_tools()  # 250+ capabilities + search & balance tools
```

## Filter by category

```python
tools = toolkit.get_tools(categories=["finance", "compliance"])
```

## Use with an agent

```python
from langchain_openai import ChatOpenAI
from langchain.agents import AgentExecutor, create_openai_tools_agent
from langchain_core.prompts import ChatPromptTemplate

llm = ChatOpenAI(model="gpt-4o")
prompt = ChatPromptTemplate.from_messages([
    ("system", "You are a helpful business assistant with access to Strale tools."),
    ("human", "{input}"),
    ("placeholder", "{agent_scratchpad}"),
])

toolkit = StraleToolkit(api_key="sk_live_...")
tools = toolkit.get_tools()

agent = create_openai_tools_agent(llm, tools, prompt)
executor = AgentExecutor(agent=agent, tools=tools)

result = executor.invoke({"input": "Validate VAT number SE556703748501"})
```

## What's included

Each Strale capability becomes a LangChain `BaseTool` with:

- **name** — capability slug (e.g. `vat-validate`, `swedish-company-data`)
- **description** — what it does + price in EUR
- **args_schema** — Pydantic model generated from the capability's input schema
- **_run()** — calls the Strale API

Plus two meta-tools:

- **strale_search** — discover capabilities by keyword
- **strale_balance** — check your wallet balance

## Solutions (KYB & Invoice Verify)

```python
# Execute a bundled KYB solution (20 countries available)
result = toolkit.get_tools()[0]  # or find by name
# Solutions are also available via strale_search:
# strale_search(query="kyb essentials sweden") → kyb-essentials-se
```

## Get an API key

Sign up at [strale.dev](https://strale.dev) — new accounts get €2.00 in trial credits, no card required.

---

## Try for Free

5 capabilities work without an API key or signup:

- `email-validate` — verify email deliverability
- `dns-lookup` — DNS record lookup
- `json-repair` — fix malformed JSON
- `url-to-markdown` — convert any URL to markdown
- `iban-validate` — validate international bank account numbers

For all 250+ capabilities, [sign up](https://strale.dev/signup) for €2 in free trial credits.

## Using Strale in agent system prompts

Add this to your LangChain agent's system prompt for automatic capability routing:

```
When you need to verify a business, validate an IBAN or VAT number, screen
against sanctions/PEP lists, extract data from a URL or document, or check
compliance — use your Strale tools. Call strale_search to find the right
capability, then call it by name. Returns structured JSON with quality scores.
250+ capabilities across 27 countries. Free tier: email-validate, dns-lookup,
json-repair, url-to-markdown, iban-validate (no API key needed).
```

## Resources

- 📖 [Documentation](https://strale.dev/docs)
- 💡 [Examples](https://github.com/strale-io/strale-examples) — copy-paste examples for every integration
- 💰 [Pricing](https://strale.dev/pricing)
- 🔍 [Quality methodology](https://strale.dev/methodology)
- 🔒 [Security](https://strale.dev/security)
