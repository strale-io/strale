---
slug: kyc-mcp-cursor
title: "How do I run PEP, sanctions and media checks in Cursor with the Strale MCP server?"
description: "Add the Strale MCP server to Cursor and ask the assistant to run PEP, sanctions and adverse media searches on a name."
group: screening
framework: "MCP"
language: "JSON"
tools: [pep-check, sanctions-check, adverse-media-check, uk-company-data]
steps:
  - "Create `.cursor/mcp.json` in your project root."
  - "Add the Strale server with your API key."
  - "Restart Cursor."
  - "Ask the assistant to run the searches."
---
Add the Strale MCP server to Cursor with your API key and ask the assistant to run PEP, sanctions and adverse media searches on a name. Cursor finds the tools with `strale_search` and runs them with `strale_execute`.

## The solution

```json Config
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

Then ask in Cursor's chat:

```text Prompt
Run PEP, sanctions and adverse media searches on 'Jane Doe' from Sweden and list what each returned.
```

## How it works

Cursor's assistant calls Strale through the server's meta-tools. It runs the searches you asked for and summarises what came back. The results are matches for a person to review, not a verdict.

This suits development-time checks, such as confirming that a test name returns the matches you expect. In production, call the tools from your application code so you control errors, retries and records. Keep the API key out of version control: the config reads it from your environment (`${env:STRALE_API_KEY}`).

The server's options are in [Connect over MCP](/docs/mcp).
