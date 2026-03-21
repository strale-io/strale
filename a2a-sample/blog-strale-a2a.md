# Strale is now discoverable via the A2A protocol

The Agent-to-Agent (A2A) protocol is an open standard — now under the Linux Foundation with 150+ supporting organizations — that lets AI agents discover and call other agents' capabilities through structured JSON-RPC. Strale's entire capability catalog is now accessible through A2A.

## What this means

Any A2A-compatible orchestrator agent can:

1. **Discover** Strale's 337 skills by fetching a single URL
2. **Evaluate** each skill's quality score before deciding to call it
3. **Execute** capabilities with structured input/output — no SDK needed

The Agent Card lives at the standard well-known URL:

```
https://api.strale.io/.well-known/agent-card.json
```

## What's in the Agent Card

The card advertises 256 capabilities and 81 bundled solutions across company verification, compliance screening, data validation, financial data, web extraction, and developer tools — covering 27 countries.

Each skill includes a live **Strale Quality Score (SQS)** in its description. This is a differentiator: no other A2A agent exposes quality metrics. An orchestrator can compare `SQS: 96/100` vs `SQS: 51/100` and make an informed routing decision.

```json
{
  "id": "iban-validate",
  "name": "IBAN Validate",
  "description": "Validate an IBAN... SQS: 95/100. FREE — no API key required.",
  "tags": ["validation", "verify", "check"],
  "examples": ["Validate an IBAN and return bank details"]
}
```

Five capabilities are free-tier — no API key, no signup:
- `email-validate`, `dns-lookup`, `json-repair`, `url-to-markdown`, `iban-validate`

## Calling Strale via A2A

Discovery:

```bash
curl https://api.strale.io/.well-known/agent-card.json | jq '.skills | length'
# 337
```

Execution (free-tier, no auth):

```bash
curl -X POST https://api.strale.io/a2a \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "method": "message/send",
    "id": "1",
    "params": {
      "skillId": "iban-validate",
      "message": {
        "role": "user",
        "parts": [{"type": "data", "data": {"iban": "DE89370400440532013000"}}]
      }
    }
  }'
```

Response:

```json
{
  "jsonrpc": "2.0",
  "result": {
    "kind": "task",
    "status": {
      "state": "completed",
      "message": {
        "parts": [{"type": "data", "data": {"valid": true, "bank": "Commerzbank", "country": "DE"}}]
      }
    },
    "metadata": {
      "capability_used": "iban-validate",
      "latency_ms": 12
    }
  }
}
```

For paid capabilities, pass `Authorization: Bearer sk_live_...` in the request header.

## What's next

- **A2A Registry registration** — once the community registry stabilizes, Strale will be searchable by skill tags like "kyb", "compliance", "vat"
- **x402 payment integration** — HTTP 402 payment flow so agents can pay per-call without pre-funded wallets
- **Streaming support** — for long-running capabilities like web extraction and annual report analysis

## Try it

The Agent Card is live at `https://api.strale.io/.well-known/agent-card.json`. The free-tier capabilities work without any setup. The full Python example is at [github.com/strale-io/strale/a2a-sample](https://github.com/strale-io/strale/tree/main/a2a-sample).
