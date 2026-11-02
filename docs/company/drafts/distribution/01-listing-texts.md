# DRAFT — listing and description texts (not published)

**Status: DRAFT.** Nothing here is published, submitted or sent. Each block names
the surface it replaces, who may ship it, and the claims it depends on.
Written 2026-10-27 for `docs/research/2026-10-27-distribution-strategy.md` §6.

## Rules every block follows

- Lead with the job the agent gets done (DEC-20260905-A, DEC-20261023-B):
  one connection, many tools, pay per call. The flagship (official company
  records and screening) comes second, never as the headline.
- **No typed counts.** Library and country counts change weekly and three of
  our surfaces already carry wrong ones ("250+", "225+", "23 countries").
  Static texts say "hundreds of tools" only where a size word is needed, and
  point to `https://api.strale.io/v1/platform/facts` for the live figure.
  (Moderate confidence that "hundreds" stays true: 298 visible tools on
  2026-10-27.)
- x402 lines always carry "eligible tools" / "most tools": 275 of 298 tools and
  88 of 95 bundles are in `/x402/catalog` on 2026-10-27, so
  `all-x402-coverage` (forbidden) must not be implied.
- `no-account-required-x402` is **needs_evidence**: used only scoped to x402.
- Avoided words: verified, trusted, trust layer, quality-scored, SQS,
  independently tested, compliant, most popular, SLA, average latency.
- Search tools (Google results via Serper) may be named now that Serper's
  written permission is accepted (DQ-39, 2026-10-28). Prefer "web search" in
  body copy, which survives a vendor change, and never present the tools as
  an affiliate of Google.

---

## A. Official MCP registry — `server.json` `description`

Replaces: "Trust and quality infrastructure for AI agents. 250+
quality-scored capabilities with audit trails." (root `server.json`, version
pinned at 0.2.3 while npm is at 0.2.8).

> Hundreds of pay-per-call tools for agents: company records, screening, validation, web reading.

(95 characters; the registry schema caps `description` at 100.)
Ship: engineering session (repo edit + `mcp-publisher publish`, which is our
own registry namespace, not a third-party submission). Also bump `version`
to the published npm version.

## B. npm `strale-mcp` — `package.json` `description`

Replaces: "MCP server for Strale — pre-flight check any paid API before
your agent pays, plus 250+ business data, compliance, and validation tools…"

> MCP server for Strale: one connection to hundreds of pay-per-call tools — company records, sanctions and PEP screening, email/phone/IBAN/VAT checks, web page reading, document extraction. Works with Claude, Cursor, VS Code and any MCP client.

Ship: engineering session, next normal `strale-mcp` release (Distribution PR
Integrity Protocol step 6 smoke test applies to the publish).

## C. GitHub repository description (`strale-io/strale`)

Replaces: "Trust and quality infrastructure for AI agents. 225+
quality-scored capabilities, SQS scoring, EU AI Act support." Every PR
listing and every GitHub search result shows this line.

> Pay-per-call tools for AI agents — one API key or an x402 wallet. MCP server, REST API, TS/Python SDKs.

Topics to set: `mcp`, `mcp-server`, `x402`, `ai-agents`, `agent-tools`,
`company-data`, `kyb`, `api`.
Ship: repo settings change. Low risk, reversible, but it is a public text —
under DEC-20260822-A part 2 "demonstrably inaccurate public copy (narrowing
only)" it is Claude's to do; this draft narrows, so a session may apply it.

## D. Context7 — `context7.json` `description` and `folders`

Replaces: "Trust layer for AI agents. 250+ verified data capabilities…"
(`verified` is on the avoid list; `pydantic-ai`, `google-adk` and
`openai-agents` folders are listed although those packages are deprecated).

> Docs and examples for Strale: pay-per-call tools for AI agents over MCP, REST, and the TypeScript and Python SDKs. Free tools work without an API key.

Also remove `packages/openai-agents-strale`, `packages/pydantic-ai-strale`,
`packages/google-adk-strale` from `folders` — Context7 would otherwise feed
coding assistants examples from packages we deprecated for being hollow.
Ship: engineering session (repo file; Context7 re-crawls).

## E. A2A agent card `description` (`/.well-known/agent-card.json`)

Replaces: "Commercial capability marketplace for AI agents. 298+
capabilities… Compliance, KYC/KYB… regulatory intelligence… Every call
returns an audit record." (The typed count will drift; "every call returns
an audit record" is not established for x402 or cached replays — see
MESSAGING-LEVELS.md proof gap 2.)

> A library of pay-per-call tools for agents: look up companies in official records, screen sanctions and PEP lists, check emails, phone numbers, IBANs and VAT numbers, read web pages and documents. Pay with an API key or, on eligible tools, an x402 wallet with no signup. Live counts: https://api.strale.io/v1/platform/facts

Ship: engineering session (served from code).

## F. `strale.dev/llms.txt` (strale-frontend `public/llms.txt`)

The API's own `https://api.strale.io/llms.txt` is current. The website copy is
not, and it is the one a model reads when someone shares strale.dev. Lines to
change:

| Current line | Problem | Replacement |
|---|---|---|
| "The trust layer of the agent economy. Independently tested API capabilities…" | retired framing; `every-tool-continuously-tested` family | "Give your agent a new tool without opening another provider account." |
| "All capabilities are available via x402" | false (275 of 298); breaks the `all-x402-coverage` rule in substance | "Most tools are available via x402 — check `/x402/catalog` for each tool." |
| "Trial: €2.00 free credits" | `trial-credit-amount` is needs_evidence | cite the live signup terms or drop the figure |

Simplest fix: make strale.dev/llms.txt a short pointer to the API's dynamic
file. Ship: strale-frontend maintenance edit (kept in maintenance under
DEC-20260902-A); narrowing only.

## G. Directory long description (Smithery, Glama, PulseMCP, mcp.so, MCP Market, x402 directories)

Replaces `docs/x402-listing.md` medium text, which still says "Every call is
independently quality-tested", "no minimum" (a wallet top-up is at least
€10) and "23 countries".

> **Strale — tools your agent can call and pay for per call.**
> One connection gives an agent hundreds of tools. Look up company records
> from business registers and register-backed sources in countries across
> Europe, the Americas and Asia-Pacific (live list:
> https://api.strale.io/v1/platform/facts); screen companies and people
> against sanctions and PEP lists and adverse media; check email addresses,
> phone numbers, IBAN format and EU VAT numbers; turn any web page into
> clean text; pull fields out of invoices, receipts and PDFs; run DNS, SSL
> and tech-stack checks.
>
> Pay per call, no subscription. Use one API key and a prepaid balance, or —
> on eligible tools — pay each request in USDC over x402 with no signup.
> A set of free tools works without a key. Each tool page lists inputs,
> output fields, price, limitations and source.
>
> Connect: remote MCP at `https://api.strale.io/mcp`, `npx strale-mcp`,
> REST `POST /v1/do`, TypeScript and Python SDKs.

Notes: no typed counts. "Official business registers" is deliberately not
used: MESSAGING-LEVELS.md proof gap 4 asks for a `needs_evidence` row for
"official records", and several countries (the US among them, per
`/v1/platform/facts`) come through vendors that wrap the register. When that
row exists and is ruled, this text may say "official".

## H. Job-shaped short entries (for directories that allow several listings or per-tool pages)

The paying population buys single primitives, not "a library". Where a venue
indexes per endpoint (x402 Bazaar, x402 directories, our own catalogue), the
first line of each tool's description should name the job and the input:

- `email-validate` — "Check an email address before your agent sends: syntax, domain and mail-server checks. Free."
- `company-data` per country — "Look up a {country} company by registration number in {source}: name, status, address{, directors}." ({source} is read from the manifest's `data_source` at generation time.)
- `sanctions-check` — "Screen a person or company name against sanctions lists. Returns matches with list and score for a person to review." (No vendor name in static copy: vendor names come from `/v1/platform/facts`, per the `vendor-switch` skill.)
- `url-to-markdown` — "Turn one web page into clean markdown for the model. Free, one page per call."

These change manifest `description` fields, so they go through the
onboarding pipeline (`onboard.ts --backfill`) and `claims:check`.
