# DEPRECATED — yanked from PyPI on 2026-04-22

`google-adk-strale` has been **yanked from PyPI**. It will not receive further updates.

## Why

The published package contained a generic HTTP client (`StraleClient`) rather than a Google-ADK-specific integration. The package name implied a tighter integration than the code delivered. The package has been voluntarily deprecated in favor of the canonical integration paths. See the `CONTAINMENT_REPORT.md` at the repo root for context.

## What to use instead

### For Google ADK users specifically

Strale is available via the **Model Context Protocol (MCP)**, which Google ADK supports natively:

```python
from google.adk.tools.mcp_tool import MCPToolset, SseServerParams

tools = MCPToolset(connection_params=SseServerParams(url="https://api.strale.io/mcp"))
```

All Strale capabilities are exposed as MCP tools. The integration is owned and tested by the MCP protocol, not by a framework-specific wrapper.

### For any framework (generic)

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
