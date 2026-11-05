---
slug: mcp-server-cursor-setup
title: "How do I connect the Strale MCP server to Cursor?"
description: "Add a .cursor/mcp.json file and Cursor's assistant can search and call Strale tools."
group: agents
framework: "MCP"
language: "JSON"
tools: [iban-validate, email-validate, url-to-markdown]
steps:
  - "Create the `.cursor/` directory in your project root if it is missing."
  - "Create `mcp.json` with the Strale server."
  - "Add your `STRALE_API_KEY` for paid tools, or leave it out for free tools only."
  - "Restart Cursor and ask the assistant to use Strale."
---
Add a `.cursor/mcp.json` file to your project and Cursor's assistant can search and call Strale tools. Free tools need no key.

## The solution

```json .cursor/mcp.json
{
  "mcpServers": {
    "strale": {
      "command": "npx",
      "args": ["-y", "strale-mcp"],
      "env": {
        "STRALE_API_KEY": "${env:STRALE_API_KEY}"
      }
    }
  }
}
```

Restart Cursor, then ask in the chat:

```text Prompt
Use Strale to validate IBAN DE89370400440532013000
```

## How it works

Cursor reads project-level MCP configuration from `.cursor/mcp.json`. The assistant finds tools with `strale_search` and runs them with `strale_execute`, so "look up a Swedish company" works without a slug.

For a team, commit the file but not the key: reference an environment variable instead. See [Connect over MCP](/docs/mcp) for all options.
