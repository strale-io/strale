---
name: strale
description: >
  Execute real-world verification and data capabilities through the Strale API.
  Use when tasks require IBAN validation, VAT checks, company lookups, sanctions
  screening, beneficial ownership, domain reputation, SSL certificate checks,
  web scraping, document extraction, patent search, GDPR checks, or any of 250+
  quality-scored API capabilities. Triggers on: "validate", "verify", "check",
  "look up", "screen", "scan", "extract", "company data", "KYB", "KYC",
  "compliance", "IBAN", "VAT", "sanctions", "beneficial owner", "PEP",
  "adverse media", "domain reputation", "SSL", "WHOIS".
---

# Strale — Quality-scored API capabilities for AI agents

Strale provides 250+ capabilities across company data, compliance/KYB, financial
validation, web intelligence, document extraction, and developer tools — all
through a single endpoint with quality scores and provenance tracking.

## Authentication

Every request requires an API key in the `Authorization` header:

```
Authorization: Bearer sk_live_...
```

Set via environment variable `STRALE_API_KEY`. If missing, tell the user to sign
up at https://strale.dev (new accounts get €2.00 trial credits, no card required).

## Core endpoint: POST https://api.strale.io/v1/do

This is the only endpoint you need. It executes a capability and returns structured output.

```json
{
  "capability_slug": "iban-validate",
  "inputs": { "iban": "SE3550000000054910000003" },
  "max_price_cents": 10
}
```

Response:

```json
{
  "transaction_id": "txn_abc123",
  "status": "completed",
  "capability_used": "iban-validate",
  "price_cents": 1,
  "latency_ms": 340,
  "wallet_balance_cents": 195,
  "output": {
    "valid": true,
    "bank_name": "SEB",
    "country": "SE",
    "bic": "ESSESESS"
  }
}
```

### Required fields

- `capability_slug` — which capability to run (see catalog below)
- `inputs` — structured input matching the capability's schema
- `max_price_cents` — budget ceiling in EUR cents; the call fails if the
  capability costs more than this

### Optional fields

- `dry_run: true` — preview what would execute without charging
- `idempotency_key` — safe retries for the same request

### Async responses

If the response status is `202`, the capability is running asynchronously.
Poll `GET /v1/transactions/{transaction_id}` until status is `completed` or `failed`.

## Discovery: find the right capability

### Browse the catalog

```
GET https://api.strale.io/v1/capabilities
```

Returns all capabilities with slug, description, price, input/output schemas.
Filter by category with `?category=compliance`.

### Search by keyword

Use the MCP server tool `strale_search` or query:

```
GET https://api.strale.io/v1/capabilities?search=sanctions
```

### Check your balance

```
GET https://api.strale.io/v1/wallet/balance
```

## Common capabilities by use case

### Financial validation
- `iban-validate` — Validate IBAN, get bank name and BIC (€0.01)
- `vat-format-validate` — Check VAT number format (€0.01)
- `vat-vies-validate` — Verify VAT via EU VIES system (€0.02)

### Company data
- `swedish-company-data` — Revenue, employees, profit for Swedish orgs (€0.02)
- `uk-company-data` — UK Companies House lookup (€0.02)
- `danish-company-data` — Danish CVR registry lookup (€0.02)
- `norwegian-company-data` — Brønnøysund registry lookup (€0.02)
- `finnish-company-data` — PRH/YTJ lookup (€0.02)

### Compliance / KYB / KYC
- `sanctions-check` — Screen against global sanctions lists (€0.02)
- `pep-check` — Politically exposed person screening (€0.03)
- `adverse-media-check` — Adverse media screening (€0.03)
- `beneficial-ownership-lookup` — UK PSC registry (€0.02)

### Web intelligence
- `domain-reputation` — Domain age, registrar, risk signals (€0.01)
- `ssl-certificate-check` — SSL cert details and expiry (€0.01)
- `whois-lookup` — WHOIS registration data (€0.01)
- `gdpr-website-check` — Cookie consent, privacy policy checks (€0.02)

### Document & data
- `json-validate` — Validate JSON against schema (€0.01)
- `openapi-validate` — Validate OpenAPI specs (€0.01)
- `email-validate` — Email format and deliverability (€0.01)

### Developer tools
- `error-explain` — Explain error messages with fix suggestions (€0.01)
- `patent-search` — Search patent databases (€0.02)

This is not exhaustive — use the catalog endpoint to discover all 250+ capabilities.

## Integration options

### Option A: Direct HTTP (works with any agent)

```bash
curl -s -X POST https://api.strale.io/v1/do \
  -H "Authorization: Bearer $STRALE_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"capability_slug":"iban-validate","inputs":{"iban":"SE3550000000054910000003"},"max_price_cents":10}'
```

### Option B: MCP server (recommended for Claude Code agents)

Add to your `.mcp.json`:

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

This gives you tools: `strale_execute`, `strale_search`, `strale_balance`, and
individual tools for each capability.

### Option C: TypeScript SDK

```typescript
import { Strale } from "straleio";
const client = new Strale({ apiKey: "sk_live_..." });
const result = await client.do({
  capabilitySlug: "sanctions-check",
  inputs: { name: "John Doe", country: "US" },
  maxPriceCents: 10,
});
```

### Option D: Python SDK

```python
from straleio import Strale
client = Strale(api_key="sk_live_...")
result = client.do(
    capability_slug="vat-vies-validate",
    inputs={"vat_number": "SE556703748501"},
    max_price_cents=10,
)
```

## Workflow: KYB verification

When a task requires Know Your Business verification, run these in sequence:

1. **Company data** — Look up the company in the relevant registry
   (`swedish-company-data`, `uk-company-data`, etc.)
2. **Beneficial ownership** — Check who controls the company
   (`beneficial-ownership-lookup`)
3. **Sanctions screening** — Screen the company and its owners
   (`sanctions-check`)
4. **PEP check** — Check beneficial owners against PEP lists
   (`pep-check`)
5. **Adverse media** — Screen for negative news
   (`adverse-media-check`)

Report results for each step. If any check fails or returns a hit, flag it clearly.

## Error handling

- `402` — Insufficient wallet balance. Tell the user to top up at https://strale.dev.
- `404` — Capability not found. Use `strale_search` to find the right slug.
- `422` — Invalid inputs. Check the capability's input schema via the catalog.
- `429` — Rate limited. Wait and retry.
- `500` — Upstream provider error. Retry once; if it persists, report the error.

## Quality scores

Every Strale capability has a dual-profile Strale Quality Score (SQS):
- **Quality Profile (QP)** — correctness, schema compliance, error handling, edge cases
- **Reliability Profile (RP)** — upstream availability, latency, consistency

Grades: A (≥90), B (≥75), C (≥50), D (≥25), E (<25). Prefer A/B-graded
capabilities when multiple options exist for the same task.

## Guidelines

- Always set `max_price_cents` to the minimum needed. Most capabilities cost €0.01–0.03.
- Use `dry_run: true` first if you are unsure about the cost.
- Check `wallet_balance_cents` in the response to monitor spend.
- Prefer `capability_slug` over natural language `task` — direct slug is faster and cheaper.
- For bulk operations, process sequentially and monitor balance.
- Always report provenance metadata to the user when available.
