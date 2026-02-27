import type { Metadata } from "next";
import { CodeBlock } from "@/components/code-block";

export const metadata: Metadata = {
  title: "MCP Server",
  description: "Connect Strale to Claude, Cursor, Windsurf, and 300+ MCP clients.",
};

export default function McpDocsPage() {
  return (
    <div>
      <h1>MCP Server</h1>
      <p>
        Strale exposes all 233 capabilities as an MCP (Model Context Protocol) server.
        Any MCP-compatible client &mdash; Claude Desktop, Cursor, Windsurf, and 300+ others &mdash;
        can discover and call Strale capabilities natively.
      </p>

      <h2>Streamable HTTP transport</h2>
      <p>
        Strale uses the Streamable HTTP transport, which means no local process to run.
        Just point your MCP client at the URL:
      </p>
      <CodeBlock
        code="https://strale-production.up.railway.app/mcp"
        language="text"
      />

      <h2>Claude Desktop</h2>
      <p>
        Add Strale to your Claude Desktop config file:
      </p>
      <CodeBlock
        code={`// ~/Library/Application Support/Claude/claude_desktop_config.json (macOS)
// %APPDATA%\\Claude\\claude_desktop_config.json (Windows)
{
  "mcpServers": {
    "strale": {
      "url": "https://strale-production.up.railway.app/mcp",
      "headers": {
        "Authorization": "Bearer sk_live_YOUR_KEY"
      }
    }
  }
}`}
        language="json"
        filename="claude_desktop_config.json"
      />
      <p>Restart Claude Desktop. You&rsquo;ll see 233 tools available in the tool picker.</p>

      <h2>Cursor</h2>
      <p>
        In Cursor, open Settings &rarr; MCP Servers and add:
      </p>
      <CodeBlock
        code={`{
  "mcpServers": {
    "strale": {
      "url": "https://strale-production.up.railway.app/mcp",
      "headers": {
        "Authorization": "Bearer sk_live_YOUR_KEY"
      }
    }
  }
}`}
        language="json"
      />

      <h2>Windsurf</h2>
      <p>
        In Windsurf, open the MCP configuration and add the same URL and headers as above.
      </p>

      <h2>Authentication</h2>
      <p>
        Pass your API key in the <code>Authorization</code> header. All capability calls are
        charged to your wallet. If you don&rsquo;t include an API key, you can still discover
        capabilities but won&rsquo;t be able to execute them.
      </p>

      <h2>Available tools</h2>
      <p>
        Every Strale capability is exposed as an MCP tool with its full input schema.
        Your AI agent can discover them via the standard MCP tool listing and call them
        with structured parameters. See the <a href="/capabilities">full capability catalog</a> for details.
      </p>
    </div>
  );
}
