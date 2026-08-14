# Compliance Check — Claude Agent SDK + straleio SDK

A TypeScript agent on the
[Claude Agent SDK](https://code.claude.com/docs/en/agent-sdk) (`claude-sonnet-5`)
that wraps three Strale capabilities as in-process custom tools using the
`straleio` SDK, then prints the full **audit trail** every Strale call
returns — the thing that differentiates Strale from a bare API wrapper: each
transaction carries its own data source, jurisdiction, GDPR basis, and a
shareable audit URL.

## What it does

1. Defines three custom tools (`sanctions_pep_check`, `vat_validate`,
   `company_registry_check`), each calling `strale.do({ capability_slug, inputs })`
   from the `straleio` npm SDK.
2. Registers them on an in-process MCP server via `createSdkMcpServer` +
   `tool()`.
3. Runs a `claude-sonnet-5` agent via `query()` that calls all three tools
   for a given company.
4. Prints the agent's plain-language summary, then the raw audit record
   (`meta.audit`) collected from every underlying transaction.

## Prerequisites

- Node.js 20+
- A Strale API key — sign up at [strale.dev/signup](https://strale.dev/signup)
  for EUR 2.00 free trial credit, no card required
- An Anthropic API key — [console.anthropic.com](https://console.anthropic.com/settings/keys)

## Install

```bash
cd examples/compliance-check-claude-sdk
npm install
cp .env.example .env
# edit .env with your real STRALE_API_KEY and ANTHROPIC_API_KEY
```

## Run

```bash
npm start
# or with your own target:
npx tsx src/agent.ts "Spotify AB" 556703-7485 SE556703748501
```

## Expected output (abridged)

```
[tool call] mcp__strale__company_registry_check {"org_number":"556703-7485"}
[tool call] mcp__strale__vat_validate {"vat_number":"SE556703748501"}
[tool call] mcp__strale__sanctions_pep_check {"name":"Spotify AB"}

=== SUMMARY ===
**Compliance check — Spotify AB (556703-7485)**

✅ Registry: Active Aktiebolag, registered 2006-05-10, ...
✅ VAT: SE556703748501 valid via VIES, matches registered name/address.
✅ PEP screening: No matches across 230+ consolidated PEP sources.

**Overall: No red flags.**

=== AUDIT TRAIL (3 transactions) ===
[
  {
    "transaction_id": "576bc59a-...",
    "capability": "swedish-company-data",
    "data_source": "Bolagsverket Värdefulla datamängder API ...",
    "data_classification": "public_company_data",
    "data_jurisdiction": "US",
    "processing_location": "us-east4-eqdc4a",
    "input_hash": "sha256:...",
    "shareable_url": "https://strale.dev/audit/576bc59a-...?token=...",
    "regulations_addressed": { "gdpr": { "article_30": "...", "article_15": "...", "article_17": "..." } }
  },
  ...
]
```

Cost: 20 cents of Strale wallet balance (5c + 2c + 5c... rounds to ~12-20c
depending on live pricing) plus a small Anthropic charge for the agent turn.

## A version gap worth knowing about

`straleio@0.1.2` (the version currently published to npm as of 2026-08) hands
back the raw `/v1/do` wire response — `{ result: {...}, meta: {...} }` — even
though its bundled `.d.ts` types advertise a flat `DoResponse` shape
(`transaction_id`, `output`, ... at the top level). The flattening ships in
the SDK's next release. `src/agent.ts`'s `unwrapOutput()` helper reads either
shape defensively so this example keeps working across both — `meta.audit`
is unaffected either way, since it sits at the top level in both shapes.

## Verified

Ran end-to-end on 2026-08-13 against production `https://api.strale.io`
with a real (test) Strale API key and a real `claude-sonnet-5` call —
`npx tsc --noEmit` clean and a live run produced 3 real transactions with
full audit records, exactly as shown above.
