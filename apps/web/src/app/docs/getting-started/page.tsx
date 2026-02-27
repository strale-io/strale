import type { Metadata } from "next";
import { CodeBlock } from "@/components/code-block";

export const metadata: Metadata = {
  title: "Quickstart",
  description: "Get started with Strale in under 2 minutes.",
};

export default function GettingStartedPage() {
  return (
    <div>
      <h1>Quickstart</h1>
      <p>
        Get an API key and make your first capability call in under 2 minutes.
      </p>

      <h2>1. Create an account and get your API key</h2>
      <p>
        Register with your email to get an API key and &euro;2.00 in free trial credits.
        No credit card required.
      </p>
      <CodeBlock
        code={`curl -X POST https://strale-production.up.railway.app/v1/auth/register \\
  -H "Content-Type: application/json" \\
  -d '{"email": "you@example.com"}'`}
        language="bash"
      />
      <p>
        The response includes your API key. Save it somewhere safe &mdash; it&rsquo;s shown only once.
      </p>
      <CodeBlock
        code={`{
  "user_id": "abc-123",
  "email": "you@example.com",
  "api_key": "sk_live_...",
  "wallet_balance_cents": 200
}`}
        language="json"
      />

      <h2>2. Make your first call</h2>
      <p>
        Call any capability using <code>POST /v1/do</code>. Here&rsquo;s a simple VAT validation:
      </p>
      <CodeBlock
        code={`curl -X POST https://strale-production.up.railway.app/v1/do \\
  -H "Authorization: Bearer sk_live_YOUR_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "task": "validate VAT number",
    "inputs": {
      "vat_number": "SE556012579001"
    }
  }'`}
        language="bash"
      />
      <p>Strale matches your task to the right capability automatically and returns structured JSON:</p>
      <CodeBlock
        code={`{
  "status": "completed",
  "capability_used": "vat-validate",
  "price_cents": 10,
  "wallet_balance_cents": 190,
  "data": {
    "valid": true,
    "country_code": "SE",
    "vat_number": "556012579001",
    "name": "Telefonaktiebolaget LM Ericsson",
    "address": "TORSHAMNSGATAN 21\\n164 83 STOCKHOLM"
  }
}`}
        language="json"
      />

      <h2>3. Check your balance</h2>
      <CodeBlock
        code={`curl https://strale-production.up.railway.app/v1/wallet/balance \\
  -H "Authorization: Bearer sk_live_YOUR_KEY"`}
        language="bash"
      />
      <CodeBlock
        code={`{
  "balance_cents": 190,
  "currency": "EUR"
}`}
        language="json"
      />

      <h2>Next steps</h2>
      <ul>
        <li><a href="/capabilities">Browse all 233 capabilities</a></li>
        <li><a href="/docs/integrations/mcp">Set up the MCP server</a> for Claude, Cursor, or Windsurf</li>
        <li><a href="/docs/integrations/langchain">Install the LangChain plugin</a></li>
        <li><a href="/docs/api-reference">Full API reference</a></li>
      </ul>
    </div>
  );
}
