import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Documentation",
  description: "Strale documentation — integrate AI agent capabilities via MCP, A2A, SDKs, or HTTP.",
};

export default function DocsPage() {
  return (
    <div>
      <h1>Documentation</h1>
      <p>
        Strale gives your AI agent access to hundreds of real-world capabilities
        at runtime &mdash; company registries, financial validation, compliance checks,
        document extraction, and more. Every call returns structured JSON with
        transparent, per-call pricing.
      </p>

      <h2>Quick links</h2>
      <div className="not-prose mt-4 grid gap-3 sm:grid-cols-2">
        <Link href="/docs/getting-started" className="rounded-xl border border-border bg-surface p-5 transition-colors hover:border-border-bright hover:bg-surface-bright">
          <h3 className="font-semibold text-foreground">Quickstart</h3>
          <p className="mt-1 text-sm text-muted">Create an account, get an API key, and make your first call in under 2 minutes.</p>
        </Link>
        <Link href="/docs/integrations/mcp" className="rounded-xl border border-border bg-surface p-5 transition-colors hover:border-border-bright hover:bg-surface-bright">
          <h3 className="font-semibold text-foreground">MCP Server</h3>
          <p className="mt-1 text-sm text-muted">Connect Strale to Claude, Cursor, Windsurf, and 300+ MCP clients.</p>
        </Link>
        <Link href="/docs/integrations/langchain" className="rounded-xl border border-border bg-surface p-5 transition-colors hover:border-border-bright hover:bg-surface-bright">
          <h3 className="font-semibold text-foreground">LangChain Plugin</h3>
          <p className="mt-1 text-sm text-muted">All capabilities as LangChain tools with pip install langchain-strale.</p>
        </Link>
        <Link href="/docs/api-reference" className="rounded-xl border border-border bg-surface p-5 transition-colors hover:border-border-bright hover:bg-surface-bright">
          <h3 className="font-semibold text-foreground">API Reference</h3>
          <p className="mt-1 text-sm text-muted">POST /v1/do, GET /v1/capabilities, authentication, error codes.</p>
        </Link>
      </div>

      <h2>How Strale works</h2>
      <p>
        Strale is a prepaid-wallet API. You sign up, get &euro;2.00 in free trial credits,
        and your agent can immediately start calling capabilities. Each capability has a
        fixed price that&rsquo;s deducted from your wallet on successful execution only.
      </p>
      <p>
        Your agent can discover Strale through multiple channels: as an MCP server
        (for Claude, Cursor, Windsurf), via A2A Agent Card (for Google A2A protocol agents),
        through framework plugins (LangChain, CrewAI, Semantic Kernel), or by calling
        the HTTP API directly.
      </p>

      <h2>Key concepts</h2>
      <ul>
        <li><strong className="text-foreground">Capabilities</strong> &mdash; Individual functions your agent can call (e.g., &ldquo;swedish-company-data&rdquo;, &ldquo;vat-validate&rdquo;).</li>
        <li><strong className="text-foreground">Wallet</strong> &mdash; Prepaid balance. Top up via Stripe Checkout. No subscriptions.</li>
        <li><strong className="text-foreground">strale.do()</strong> &mdash; The single endpoint. Pass a task description or capability slug, get structured JSON back.</li>
        <li><strong className="text-foreground">API Key</strong> &mdash; Bearer token authentication. One key per account, regeneratable.</li>
      </ul>
    </div>
  );
}
