# Strale API Quickstart

## Free capabilities (no API key needed)

These 5 capabilities work without signup or authentication. IP rate limited to 10 requests/day.

### Validate an email

```bash
curl -X POST https://api.strale.io/v1/do \
  -H "Content-Type: application/json" \
  -d '{"capability_slug": "email-validate", "inputs": {"email": "user@example.com"}}'
```

### Validate an IBAN

```bash
curl -X POST https://api.strale.io/v1/do \
  -H "Content-Type: application/json" \
  -d '{"capability_slug": "iban-validate", "inputs": {"iban": "DE89370400440532013000"}}'
```

### DNS lookup

```bash
curl -X POST https://api.strale.io/v1/do \
  -H "Content-Type: application/json" \
  -d '{"capability_slug": "dns-lookup", "inputs": {"domain": "example.com"}}'
```

### Convert URL to Markdown

```bash
curl -X POST https://api.strale.io/v1/do \
  -H "Content-Type: application/json" \
  -d '{"capability_slug": "url-to-markdown", "inputs": {"url": "https://example.com"}}'
```

### Fix malformed JSON

```bash
curl -X POST https://api.strale.io/v1/do \
  -H "Content-Type: application/json" \
  -d '{"capability_slug": "json-repair", "inputs": {"json_string": "{name: \"test\", missing: true,}"}}'
```

## Paid capabilities (API key required)

Set your API key as an environment variable:

```bash
export STRALE_API_KEY=sk_live_your_key_here
```

### Python

```python
import os
from straleio import Strale

s = Strale(api_key=os.environ["STRALE_API_KEY"])

# Execute a capability by slug
result = s.do(capability_slug="vat-validate", inputs={"vat_number": "SE556703748501"})
print(result.output)
# {"valid": True, "country_code": "SE", "company_name": "Spotify AB"}
print(result.provenance)  # data source and timestamp

# Run a multi-step solution
kyb = s.do(solution="kyb-essentials-se", input={"org_number": "5591674668"})
print(kyb.output)

# Dry run (preview cost without executing)
preview = s.dry_run(task="look up Swedish company Klarna")
print(preview.matched_capability)  # "swedish-company-data"
print(preview.price_cents)         # 80
```

### TypeScript

```typescript
import { Strale } from 'straleio';

const s = new Strale({ apiKey: process.env.STRALE_API_KEY });

// Execute a capability by slug
const result = await s.do({
  capabilitySlug: 'vat-validate',
  inputs: { vat_number: 'SE556703748501' },
});
console.log(result.output);
console.log(result.provenance);

// Run a multi-step solution
const kyb = await s.do({
  solution: 'kyb-essentials-se',
  input: { org_number: '5591674668' },
});

// Dry run
const preview = await s.dryRun({ task: 'look up Swedish company Klarna' });
console.log(preview.matched_capability); // "swedish-company-data"
console.log(preview.price_cents);        // 80
```

### Direct HTTP (any language)

```bash
curl -X POST https://api.strale.io/v1/do \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $STRALE_API_KEY" \
  -d '{"capability_slug": "swedish-company-data", "inputs": {"query": "5591674668"}}'
```

## MCP Server (for AI coding agents)

Connect any MCP client (Claude Code, Cursor, Windsurf, etc.) to Strale:

```json
{
  "mcpServers": {
    "strale": {
      "type": "streamableHttp",
      "url": "https://api.strale.io/mcp",
      "headers": {
        "Authorization": "Bearer sk_live_your_key_here"
      }
    }
  }
}
```

Free capabilities work without the Authorization header.

## Check quality before calling

Every capability has a Strale Quality Score (SQS) from 0 to 100:

```bash
curl https://api.strale.io/v1/quality/iban-validate
```

Returns quality grade, reliability grade, trend, and response time percentiles.

## Browse all 250+ capabilities

```bash
curl https://api.strale.io/v1/capabilities
```

Categories: compliance, validation, data-extraction, developer-tools, web3, security, web-scraping, monitoring, financial, text-processing, and more.

## Get an API key

Sign up at [strale.dev](https://strale.dev) — new accounts get €2.00 in trial credits, no card required.
