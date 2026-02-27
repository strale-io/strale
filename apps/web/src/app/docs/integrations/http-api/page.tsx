import type { Metadata } from "next";
import { CodeBlock } from "@/components/code-block";

export const metadata: Metadata = {
  title: "Direct HTTP API",
  description: "Call Strale capabilities directly via HTTP.",
};

export default function HttpApiDocsPage() {
  return (
    <div>
      <h1>Direct HTTP API</h1>
      <p>
        No SDK or plugin required. Strale is a standard HTTP API that any language or
        framework can call. Send a POST request, get structured JSON back.
      </p>

      <h2>Base URL</h2>
      <CodeBlock code="https://strale-production.up.railway.app" language="text" />

      <h2>Authentication</h2>
      <p>
        Include your API key as a Bearer token in the <code>Authorization</code> header:
      </p>
      <CodeBlock code='Authorization: Bearer sk_live_YOUR_KEY' language="text" />

      <h2>Execute a capability</h2>
      <CodeBlock
        code={`curl -X POST https://strale-production.up.railway.app/v1/do \\
  -H "Authorization: Bearer sk_live_YOUR_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "task": "validate this IBAN",
    "inputs": {
      "iban": "DE89370400440532013000"
    }
  }'`}
        language="bash"
      />

      <h2>TypeScript / JavaScript</h2>
      <CodeBlock
        code={`const response = await fetch("https://strale-production.up.railway.app/v1/do", {
  method: "POST",
  headers: {
    "Authorization": "Bearer sk_live_YOUR_KEY",
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    task: "validate this IBAN",
    inputs: { iban: "DE89370400440532013000" },
  }),
});

const result = await response.json();
console.log(result.data);`}
        language="typescript"
      />

      <h2>Python</h2>
      <CodeBlock
        code={`import requests

response = requests.post(
    "https://strale-production.up.railway.app/v1/do",
    headers={"Authorization": "Bearer sk_live_YOUR_KEY"},
    json={
        "task": "validate this IBAN",
        "inputs": {"iban": "DE89370400440532013000"},
    },
)

result = response.json()
print(result["data"])`}
        language="python"
      />

      <h2>TypeScript SDK</h2>
      <p>
        For TypeScript projects, the official SDK provides a cleaner interface:
      </p>
      <CodeBlock code="npm install straleio" language="bash" />
      <CodeBlock
        code={`import Strale from "straleio";

const strale = new Strale({ apiKey: "sk_live_YOUR_KEY" });

const result = await strale.do("iban-validate", {
  iban: "DE89370400440532013000",
});

console.log(result.data);`}
        language="typescript"
      />

      <p>
        See the <a href="/docs/api-reference">full API reference</a> for all endpoints,
        parameters, and error codes.
      </p>
    </div>
  );
}
