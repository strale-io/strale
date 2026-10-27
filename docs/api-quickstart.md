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

## Several agents on one wallet

Create a separate additional key per agent with `POST /v1/api-keys`. Authenticate
with your primary key. Save `api_key` from the 201 response
securely: it is shown once and never included in list/update/revoke responses.

```json
{"label":"Invoice agent","max_spend_per_hour_cents":100,"max_spend_total_cents":1000}
```

- `GET /v1/api-keys` lists at most 25 active additional keys (revoked keys are excluded): `id`,
  `key_prefix`, `label`, both caps, `spent_hour_cents`, `spent_total_cents`,
  `created_at`, `last_used_at`, `revoked_at`. Dates are ISO 8601 or null.
- `PATCH /v1/api-keys/{id}` updates label and/or caps. Omitted fields stay as
  they are; null removes a cap; zero prevents paid calls. Caps are integer
  EUR cents from 0 through 2147483647. Labels are 1–64 characters after trimming; control characters are rejected, including before trimming.
- `DELETE /v1/api-keys/{id}` revokes idempotently. Only the primary key can revoke additional keys. The primary key remains available or recoverable through email recovery.

All four endpoints require the primary key as Bearer auth and share a 5 requests/second/account
management limit. A revoked key gets exactly the same 401 body as an unknown key.
The primary key and its account cap remain in place. Every additional-key paid
capability or solution call must pass both the account cap and its own caps.
x402 payments are unchanged.

A refusal returns HTTP 429 and `error_code` of `key_hourly_cap_exceeded` or
`key_total_cap_exceeded`, with `spent_cents`, `requested_cents`, and `limit_cents`
in `details`, alongside `retryable: false`. Ask the owner to raise that key's cap using the primary key, or use another key. `spend_cap_exceeded`
continues to mean the account hourly limit. The hour is a rolling 60 minutes.
Spending is ledger purchases, including open async reservations, less refunds
linked to the original purchase. A refund restores that purchase's budget; its
hour follows the purchase time. No balance/counter is stored on the key.

Last-used timestamps update at most once a minute per key across replicas.
Revocation/cap updates serialize with debits on the wallet row lock; an already
locked call can finish before revocation takes effect. Free calls have no debit.

Additional keys are spending keys: they can execute capabilities/solutions and
read balances, transactions and results, but cannot manage the account. Creating,
listing, updating or revoking keys, rotating the primary key, closing the account,
erasing transactions, reissuing audit links, submitting account-holder disputes and starting a Stripe wallet top-up
require the primary key. Additional keys receive HTTP 403 `primary_key_required`
with "Use the account's primary key for this action".

At most 25 non-revoked additional keys can exist per account. The 26th create
returns HTTP 409 `active_key_limit_exceeded`: "Revoke an unused key first".
Email recovery rotates only the primary key. Additional keys survive recovery and
can still spend up to their caps. Use the recovered primary key to review
`GET /v1/api-keys` and revoke unused or unrecognized keys with
`DELETE /v1/api-keys/{id}`. Keeping additional keys active avoids unexpectedly
stopping every agent when the owner recovers the primary key. Keep that primary
key secure. The dashboard key UI is follow-up. See `/openapi.json` for schemas.
