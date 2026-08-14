# Strale Example Agents

Four copy-paste-able templates showing different ways to adopt Strale,
covering the main integration surfaces: a framework SDK, the raw TypeScript
SDK as agent tools, the pay-per-use x402 protocol, and MCP.

| Example | Language | Shows | Auth |
|---|---|---|---|
| [`kyb-agent-langchain/`](./kyb-agent-langchain) | Python | `langchain-strale`'s `StraleToolkit` — 250+ capabilities as LangChain tools in one call | Strale API key + Anthropic API key |
| [`compliance-check-claude-sdk/`](./compliance-check-claude-sdk) | TypeScript | `@anthropic-ai/claude-agent-sdk` custom tools wrapping the `straleio` SDK, printing the audit trail | Strale API key + Anthropic API key |
| [`x402-autonomous-buyer/`](./x402-autonomous-buyer) | TypeScript | Zero-signup pay-per-call access via [x402](https://x402.org) — USDC on Base mainnet | Wallet private key only (no Strale account) |
| [`mcp-quickstart/`](./mcp-quickstart) | Config only | `strale-mcp` (npm, stdio) and the hosted `https://api.strale.io/mcp` endpoint for Claude Desktop, Claude Code, Cursor, etc. | Strale API key (free-tier tools work without one) |

Each example has its own `README.md` with prerequisites, install, run, and
expected-output sections. Every dependency version is pinned to what was
actually installed and exercised while building these — see each README's
"Verified" section for what was run, when, and against what.

## No API key yet?

Sign up at [strale.dev/signup](https://strale.dev/signup) for EUR 2.00 in
free trial credit, no card required. Five capabilities also work with **no
key at all**: `email-validate`, `dns-lookup`, `json-repair`,
`url-to-markdown`, `iban-validate`, plus six crypto address validators
(bitcoin/eth/solana/tron/dogecoin/xrp-address-validate) — call them via
`POST /v1/do` with `max_price_cents: 0`, or through any of the examples
here.

## Which one should I start with?

- Building a LangChain agent already? → `kyb-agent-langchain/`
- Building on the Claude Agent SDK, or want to see the audit trail up
  close? → `compliance-check-claude-sdk/`
- Want an agent that pays for data with no account/signup step at all? →
  `x402-autonomous-buyer/`
- Just want Strale in Claude Desktop/Code/Cursor's tool list right now,
  no code? → `mcp-quickstart/`

## What's *not* here

These are hand-verified reference implementations living in this repo, not
a published package or a standalone repo — see the PR description for the
reasoning. If you're looking for the published SDKs and framework
integrations themselves, they're in `packages/`:
`packages/sdk-typescript` (`straleio` on npm), `packages/sdk-python`
(`straleio` on PyPI), `packages/mcp-server` (`strale-mcp` on npm),
`packages/langchain-strale`, `packages/crewai-strale`,
`packages/semantic-kernel-strale`.
