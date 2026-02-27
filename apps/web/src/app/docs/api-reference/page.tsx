import type { Metadata } from "next";
import { CodeBlock } from "@/components/code-block";

export const metadata: Metadata = {
  title: "API Reference",
  description: "Complete Strale API reference — endpoints, authentication, error codes.",
};

export default function ApiReferencePage() {
  return (
    <div>
      <h1>API Reference</h1>
      <p>
        Base URL: <code>https://strale-production.up.railway.app</code>
      </p>

      <hr />

      <h2>Authentication</h2>
      <p>
        All authenticated endpoints require a Bearer token in the <code>Authorization</code> header:
      </p>
      <CodeBlock code='Authorization: Bearer sk_live_YOUR_KEY' language="text" />
      <p>
        Get your API key by registering at <code>POST /v1/auth/register</code>. The key is
        shown once on creation &mdash; store it securely.
      </p>

      <hr />

      <h2>POST /v1/do</h2>
      <p>
        Execute a capability. This is the primary endpoint your agent calls.
      </p>
      <h3>Request body</h3>
      <table>
        <thead>
          <tr>
            <th>Parameter</th>
            <th>Type</th>
            <th>Required</th>
            <th>Description</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><code>task</code></td>
            <td>string</td>
            <td>yes</td>
            <td>Natural language description of what you want to do</td>
          </tr>
          <tr>
            <td><code>inputs</code></td>
            <td>object</td>
            <td>yes</td>
            <td>Key-value parameters for the capability</td>
          </tr>
          <tr>
            <td><code>capability_slug</code></td>
            <td>string</td>
            <td>no</td>
            <td>Override automatic matching by specifying the exact capability</td>
          </tr>
          <tr>
            <td><code>max_price_cents</code></td>
            <td>number</td>
            <td>no</td>
            <td>Reject if capability costs more than this amount</td>
          </tr>
          <tr>
            <td><code>dry_run</code></td>
            <td>boolean</td>
            <td>no</td>
            <td>If true, match and price-check but don&rsquo;t execute or charge</td>
          </tr>
        </tbody>
      </table>
      <h3>Headers</h3>
      <table>
        <thead>
          <tr>
            <th>Header</th>
            <th>Required</th>
            <th>Description</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><code>Authorization</code></td>
            <td>yes</td>
            <td>Bearer token with your API key</td>
          </tr>
          <tr>
            <td><code>Idempotency-Key</code></td>
            <td>no</td>
            <td>Unique string to prevent duplicate executions</td>
          </tr>
          <tr>
            <td><code>Strale-Version</code></td>
            <td>no</td>
            <td>API version date (e.g., &ldquo;2026-02-25&rdquo;)</td>
          </tr>
        </tbody>
      </table>
      <h3>Example</h3>
      <CodeBlock
        code={`curl -X POST https://strale-production.up.railway.app/v1/do \\
  -H "Authorization: Bearer sk_live_YOUR_KEY" \\
  -H "Content-Type: application/json" \\
  -H "Idempotency-Key: unique-request-id-123" \\
  -d '{
    "task": "validate VAT number",
    "inputs": {"vat_number": "SE556012579001"}
  }'`}
        language="bash"
      />
      <h3>Response</h3>
      <CodeBlock
        code={`{
  "status": "completed",
  "capability_used": "vat-validate",
  "price_cents": 10,
  "wallet_balance_cents": 190,
  "latency_ms": 847,
  "data": {
    "valid": true,
    "country_code": "SE",
    "vat_number": "556012579001",
    "name": "Telefonaktiebolaget LM Ericsson"
  }
}`}
        language="json"
      />

      <hr />

      <h2>GET /v1/capabilities</h2>
      <p>
        List all available capabilities. This endpoint is public &mdash; no authentication required.
      </p>
      <CodeBlock
        code={`curl https://strale-production.up.railway.app/v1/capabilities`}
        language="bash"
      />
      <h3>Response</h3>
      <p>
        Returns an array of capability objects, each with:
      </p>
      <table>
        <thead>
          <tr>
            <th>Field</th>
            <th>Type</th>
            <th>Description</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><code>slug</code></td>
            <td>string</td>
            <td>Unique identifier (e.g., &ldquo;vat-validate&rdquo;)</td>
          </tr>
          <tr>
            <td><code>name</code></td>
            <td>string</td>
            <td>Human-readable name</td>
          </tr>
          <tr>
            <td><code>description</code></td>
            <td>string</td>
            <td>What the capability does</td>
          </tr>
          <tr>
            <td><code>category</code></td>
            <td>string</td>
            <td>Category slug</td>
          </tr>
          <tr>
            <td><code>price_cents</code></td>
            <td>number</td>
            <td>Cost per call in EUR cents</td>
          </tr>
          <tr>
            <td><code>input_schema</code></td>
            <td>object</td>
            <td>JSON Schema for required inputs</td>
          </tr>
        </tbody>
      </table>

      <hr />

      <h2>GET /v1/wallet/balance</h2>
      <p>Check your current wallet balance. Requires authentication.</p>
      <CodeBlock
        code={`curl https://strale-production.up.railway.app/v1/wallet/balance \\
  -H "Authorization: Bearer sk_live_YOUR_KEY"`}
        language="bash"
      />

      <hr />

      <h2>POST /v1/auth/register</h2>
      <p>Create a new account and get an API key.</p>
      <table>
        <thead>
          <tr>
            <th>Parameter</th>
            <th>Type</th>
            <th>Required</th>
            <th>Description</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><code>email</code></td>
            <td>string</td>
            <td>yes</td>
            <td>Your email address</td>
          </tr>
          <tr>
            <td><code>name</code></td>
            <td>string</td>
            <td>no</td>
            <td>Your name</td>
          </tr>
        </tbody>
      </table>

      <hr />

      <h2>POST /v1/auth/api-key</h2>
      <p>
        Regenerate your API key. Requires authentication with your current key. The old key
        becomes invalid immediately.
      </p>

      <hr />

      <h2>Error codes</h2>
      <p>
        All errors follow a consistent format:
      </p>
      <CodeBlock
        code={`{
  "error_code": "insufficient_balance",
  "message": "Your wallet balance is too low for this capability."
}`}
        language="json"
      />
      <table>
        <thead>
          <tr>
            <th>Error code</th>
            <th>HTTP</th>
            <th>Description</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><code>invalid_request</code></td>
            <td>400</td>
            <td>Missing or invalid parameters</td>
          </tr>
          <tr>
            <td><code>unauthorized</code></td>
            <td>401</td>
            <td>Missing or invalid API key</td>
          </tr>
          <tr>
            <td><code>insufficient_balance</code></td>
            <td>402</td>
            <td>Wallet balance too low</td>
          </tr>
          <tr>
            <td><code>no_matching_capability</code></td>
            <td>404</td>
            <td>No capability matches the task</td>
          </tr>
          <tr>
            <td><code>price_exceeded</code></td>
            <td>422</td>
            <td>Capability price exceeds max_price_cents</td>
          </tr>
          <tr>
            <td><code>rate_limited</code></td>
            <td>429</td>
            <td>Too many requests</td>
          </tr>
          <tr>
            <td><code>execution_failed</code></td>
            <td>502</td>
            <td>Capability execution failed (not charged)</td>
          </tr>
        </tbody>
      </table>

      <hr />

      <h2>Rate limits</h2>
      <p>
        10 requests per second per API key. Spend cap of &euro;100 per hour. Both limits
        return <code>429 Too Many Requests</code> with a <code>Retry-After</code> header.
      </p>
    </div>
  );
}
