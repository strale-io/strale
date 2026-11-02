# Installing the Strale MCP server (for Cline and other agents)

Strale is a hosted MCP server. Nothing needs to be cloned, built or installed.

## 1. Add the server

Add this entry to the MCP settings file (in Cline: MCP Servers, then
"Configure MCP Servers", which opens `cline_mcp_settings.json`):

```json
{
  "mcpServers": {
    "strale": {
      "type": "streamableHttp",
      "url": "https://api.strale.io/mcp?src=cline",
      "disabled": false,
      "autoApprove": []
    }
  }
}
```

No API key is needed to start. Search, the free tools and the info tools
(`strale_ping`, `strale_getting_started`, `strale_methodology`,
`strale_trust_profile`) work without one; paid tools and `strale_balance`
need a key.

## 2. Check it works

Call the `strale_ping` tool. It should return the server status. Then call
`strale_execute` with:

```json
{ "slug": "iban-validate", "inputs": { "iban": "DE89370400440532013000" } }
```

The result has `output.valid: true` and costs nothing.

## 3. Optional: add an API key for paid tools

Paid tools need a key from https://strale.dev/signup. Ask the user for it;
never invent one. Add it as a header to the same entry:

```json
"headers": { "Authorization": "Bearer <the user's key>" }
```

Do not add the header without a real key: a placeholder value is refused,
and with it even the free tools stop working.

## Alternative: local stdio

If the client cannot use a remote server, run the published package
(Node.js 20 or later):

```json
{
  "mcpServers": {
    "strale": {
      "command": "npx",
      "args": ["-y", "strale-mcp"],
      "env": { "STRALE_API_KEY": "" }
    }
  }
}
```

Leave `STRALE_API_KEY` empty to use search and the free tools only.
