# DEPRECATED — yanked from PyPI on 2026-04-22

`pydantic-ai-strale` has been **yanked from PyPI**. It will not receive further updates.

## Why

The published package contained a generic HTTP client (`StraleClient`) rather than a Pydantic-AI-specific `StraleToolset` class. The package name implied a tighter integration than the code delivered. This was caught by a Pydantic-AI maintainer in a public review and has been voluntarily deprecated rather than retrofitted. See the `CONTAINMENT_REPORT.md` at the repo root for the full writeup.

## What to use instead

### For Pydantic AI users specifically

Strale is available via the **Model Context Protocol (MCP)**, which Pydantic AI supports natively:

```python
from pydantic_ai import Agent
from pydantic_ai.mcp import MCPServerHTTP

server = MCPServerHTTP(url="https://api.strale.io/mcp")
agent = Agent("openai:gpt-5.2", mcp_servers=[server])
```

All Strale capabilities are exposed as MCP tools. The integration is owned and tested by the MCP protocol, not by a framework-specific wrapper.

### For any framework (generic)

Use the plain Python SDK:

```bash
pip install straleio
```

```python
from straleio import Strale

strale = Strale(api_key="sk_live_...")
result = strale.execute("iban-validate", {"iban": "DE89370400440532013000"})
```

### For the three frameworks with genuine integration packages

- `pip install langchain-strale` — LangChain `BaseTool` / `BaseToolkit`
- `pip install crewai-strale` — CrewAI `BaseTool`
- `pip install composio-strale` — Composio custom tools

## Resources

- Strale MCP: https://api.strale.io/mcp
- MCP discovery: https://api.strale.io/.well-known/mcp.json
- Docs: https://strale.dev/docs
- Full catalog: https://api.strale.io/v1/capabilities
