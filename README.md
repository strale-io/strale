# Strale

Trust and quality infrastructure for AI agents.

[![strale MCP server](https://glama.ai/mcp/servers/strale-io/strale/badges/card.svg)](https://glama.ai/mcp/servers/strale-io/strale)

[![npm](https://img.shields.io/npm/v/strale-mcp?label=strale-mcp)](https://www.npmjs.com/package/strale-mcp)
[![npm](https://img.shields.io/npm/v/straleio?label=straleio)](https://www.npmjs.com/package/straleio)
[![PyPI](https://img.shields.io/pypi/v/straleio?label=straleio%20PyPI)](https://pypi.org/project/straleio/)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![strale.dev](https://img.shields.io/badge/strale.dev-live-green)](https://strale.dev)

## What Strale is

Strale is a capability marketplace for AI agents. Agents call `strale.do()`
at runtime to reach verified capabilities — company registry lookups,
compliance checks, financial validation, Web3 security, and more — plus
bundled solutions for multi-step workflows like a full KYB check or company
due diligence, instead of the agent's own code hardcoding integrations and
managing credentials for every data source it might need.

Every capability is watched: free-tier capabilities are tested against real
upstreams on a schedule, paid capabilities are watched through production
observability and an enforced quality floor, and every call returns a
structured, auditable result with source provenance. The current catalog,
free-tier list, and country coverage are live values, not numbers printed
here — see [How to use it](#how-to-use-it) below for where to read them.

## How to use it

### MCP server (recommended: no install)

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

Works with Claude Desktop, Claude Code, Cursor, and any MCP client
supporting Streamable HTTP. For local stdio instead, or the full tool
surface, see [`packages/mcp-server/README.md`](packages/mcp-server/README.md).

### TypeScript SDK

```bash
npm install straleio
```

```typescript
import Strale from "straleio";

const strale = new Strale({ apiKey: process.env.STRALE_API_KEY });
const result = await strale.do("eu-vat-validate", { vat_number: "SE556000000001" });
```

Full reference: [`packages/sdk-typescript/README.md`](packages/sdk-typescript/README.md).

### Python SDK

```bash
pip install straleio
```

```python
from straleio import Strale

strale = Strale(api_key="your_api_key")
result = strale.do("eu-vat-validate", {"vat_number": "SE556000000001"})
```

Full reference: [`packages/sdk-python/README.md`](packages/sdk-python/README.md).

### Get started without an API key

A subset of capabilities (email/IBAN/crypto-address validation, DNS lookup,
JSON repair, URL-to-markdown, and more) work with no signup, no API key, and
no wallet — only an IP-based daily rate limit. Read the current list from
`GET /v1/platform/facts` (`free_tier_slugs`), not from a number in this
file. Get a key and trial credits at [strale.dev](https://strale.dev) when
you need the rest of the catalog.

### Framework integrations

| Package | Registry | Description |
| --- | --- | --- |
| [`strale-mcp`](https://www.npmjs.com/package/strale-mcp) | npm | MCP server — the full capability catalog via Claude, Cursor, any MCP host |
| [`straleio`](https://www.npmjs.com/package/straleio) | npm | TypeScript/JavaScript SDK |
| [`straleio`](https://pypi.org/project/straleio/) | PyPI | Python SDK |
| [`langchain-strale`](https://pypi.org/project/langchain-strale/) | PyPI | LangChain toolkit (`StraleToolkit`) |
| [`crewai-strale`](https://pypi.org/project/crewai-strale/) | PyPI | CrewAI integration — drop-in BaseTools for agents |
| [`strale-semantic-kernel`](https://www.npmjs.com/package/strale-semantic-kernel) | npm | Semantic Kernel plugin for .NET and TypeScript agents |
| [`composio-strale`](https://pypi.org/project/composio-strale/) | PyPI | Composio integration — custom actions |

Each package's own README is the reference for that integration; this file
only points at them. Every distribution PR against an external framework
repo, and every publish of one of these packages, follows CLAUDE.md's
Distribution PR Integrity Protocol — a package claiming framework-native
integration is verified against the published artefact, not the source
tree, before the claim ships.

### Web3

Web3 capabilities (wallet risk scoring, token honeypot detection, ENS
resolution, DeFi protocol data, gas oracle, EU MiCA VASP verification,
market sentiment) and bundled solutions for on-chain agents are available
via the x402 payment protocol — pay per call with USDC on Base mainnet, no
signup required. Not every capability is x402-eligible; read the live,
dynamic subset from:

```
GET https://api.strale.io/x402/catalog
GET https://api.strale.io/.well-known/x402.json
```

### Quality

Capabilities are continuously tested against their real upstreams: known-
answer, schema, negative, edge-case, and dependency-health checks, plus
piggyback checks fed by real production traffic where a capability's cost
model rules out proactive testing. An enforced quality floor quarantines a
capability that falls below it on real traffic and promotes it back
automatically on recovery. Strale deliberately publishes no single numeric
composite quality score — an earlier one was retired because it compressed
unrelated failure modes into a number that looked more precise than it
was. What is exposed instead is the raw evidence per capability: status,
last-tested timestamp, recent test history, known limitations, and the
data source behind it.

```
GET https://api.strale.io/v1/capabilities/vat-validate
```

Every capability publishes its limitations honestly, including coverage
gaps. Methodology: [strale.dev/quality](https://strale.dev/quality).

### IDE rules for safe data handling

Drop these into your project to give your coding agent security guidance
for trust-sensitive data (IBANs, company registries, sanctions, PII):

- **Cursor:** [`docs/ide-rules/strale-compliance.mdc`](docs/ide-rules/strale-compliance.mdc) → `.cursor/rules/`
- **Windsurf:** [`docs/ide-rules/strale-compliance.windsurfrules`](docs/ide-rules/strale-compliance.windsurfrules) → project root, or `.windsurf/rules/` as `.md`
- **Claude Code:** the snippet at [`docs/claude-md-snippet.md`](docs/claude-md-snippet.md) → your project's `CLAUDE.md`

These prevent the most common vibe-coding vulnerabilities: client-side IBAN
validation, hardcoded API keys, missing provenance metadata, and direct
registry scraping.

### Agent Skills & code examples

- **[Agent Skills](https://github.com/strale-io/agent-skills)** — `SKILL.md` files for Claude Code, Cursor, Copilot, and Codex. Copy `skills/strale/` into `.claude/skills/`, `.github/skills/`, or `.cursor/skills/`.
- [Verify a company with Strale](https://gist.github.com/petterlindstrom79/5e22945748c3ce42155bf6d41f46c4e0) (Python)
- [Validate IBANs — free, no API key](https://gist.github.com/petterlindstrom79/7f83fdc892dcafbc280735af5d0e360d) (Python)
- [Build an agent with Strale](https://gist.github.com/petterlindstrom79/2e4750eb919d314db7c697a504086e0b) (TypeScript)
- [Connect Strale to Claude](https://gist.github.com/petterlindstrom79/c08ddc1cb3dfed3ca434c70305dc9e54) (setup guide)

### More

- [strale.dev](https://strale.dev) — homepage and sign-up
- [strale.dev/docs](https://strale.dev/docs) — API reference
- [strale.dev/pricing](https://strale.dev/pricing) — pricing
- [scan.strale.io](https://scan.strale.io) — Beacon, a free agent-readiness scanner
- [api.strale.io/mcp](https://api.strale.io/mcp) — MCP endpoint (Streamable HTTP)
- [Examples](https://github.com/strale-io/strale-examples) — copy-paste examples for every integration

## How the code is organised

```
strale/
├── apps/api/          Hono API server: routes, capability executors,
│                       Drizzle schema + queries, Stripe/matching/auth
│                       helpers. drizzle/ holds the migration history.
├── packages/           Published SDKs and framework integrations (see the
│                       table above) plus internal workspace packages.
├── manifests/          One YAML file per live capability: pricing, data
│                       source, field-reliability declarations, test
│                       fixtures. The onboarding pipeline
│                       (apps/api/scripts/onboard.ts) is the only
│                       sanctioned way a capability enters the system —
│                       see CLAUDE.md's Capability Onboarding Protocol.
├── design/             Design tokens as data (colors, type, spacing) —
│                       one active file per surface, candidates carry a
│                       status, promotion is a decision plus a file swap.
├── config/              Cross-cutting configuration as data, e.g. the
│                       environment-variable manifest every process.env
│                       read is registered against.
└── scripts/            Repo-root tooling: the checkers behind every
                        `npm run *:check` script, the session-handoff
                        gate, and one-off operator scripts.
```

`apps/api/scripts/` and `apps/api/src/capabilities/` carry the same idea at
capability-authoring scope — read `CLAUDE.md`'s "Adding New Capabilities"
section before writing a new executor.

## How the company runs the repository

**Where truth lives.** Product, state, and roadmap truth is migrating from
Notion into this repository (`docs/project/`), but the migration is not
complete: `docs/project/START-HERE.md` and the rest of `docs/project/` are
explicitly **candidates** (`authority_active: false`) until a founder-
confirmed cutover. Until then, Notion (Project Home, the To-do & Build
Plan, the Decisions DB) is authoritative, and `CLAUDE.md` / `AGENTS.md` say
so at the top of every session. `docs/README.md` indexes every `docs/`
subtree with its current authority status; `docs/project/STRUCTURE.md`
records exactly where the repo's layout still deviates from the migration's
target and why.

**Where work in flight lives.** Multi-batch work is tracked in
`docs/programs/` (start at `docs/programs/README.md`): each program has a
`PROGRAM.md` with a "Resume here" section and a machine-checked
`tracks.yaml`. A session resuming a program reads only those two files and
follows their pointers — chat history is never required.

**How sessions work.** `CLAUDE.md` is the canonical operating manual for
Claude Code sessions; `AGENTS.md` is its condensed derivative for Codex-CLI
sessions and points back at `CLAUDE.md` for anything that can drift rather
than restating it. Every session ends through a handoff gate
(`scripts/handoff/handoff-check.mjs`, installed as a git hook) that refuses
to let a session leave uncommitted work, an unpushed branch, a stale
worktree, or code changes with no resume surface for the next session.
Batch work happens in an isolated `git worktree`, never the shared primary
checkout — see `WORKTREES.md`.

**What CI checks, by category, not by exhaustive list** (see
`.github/workflows/ci.yml` for the exact, current set): an ephemeral-
Postgres integration lane for money- and audit-chain-critical behavior;
typecheck and lint across `apps/api` and every published package; capability
manifest structural and fixture-consistency gates; framework-package
integrity (a published `*-strale` package must contain real code from the
framework it claims to integrate with); a family of content-as-data
registers, each with its own checker and generated index — research
(`docs/research/`), design tokens (`design/`), the environment-variable
manifest (`config/`), the model-id registry, the public claims register
(`docs/company/claims.yaml`), program track registers
(`docs/programs/*/tracks.yaml`), and this repository's own `docs/`
structure (`docs:check`, `archive:index -- --check`); and the session-
handoff gate itself. Every one of these checkers plants a failure case in a
throwaway fixture and proves it fails before the fix — see
`docs/company/LESSONS.md` family F5.

## Where history lives

`archive/` holds closed, historical, and superseded material — see
`archive/README.md` for what each subtree holds, generated (with hand-
written prose above it) by `npm run archive:index`. `handoff/` holds one
file per session's end-of-session record; `handoff/README.md` is a
generated, reverse-chronological index of all of them by date and stated
intent. Neither directory is required reading to resume work — the program
register and `docs/project/START-HERE.md` are.

## License

MIT
