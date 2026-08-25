# Strale — the data layer agents call mid-task

> **Rewritten 2026-08-15.** The previous version led with "250+ compliance,
> KYC/KYB and business verification APIs — sanctions, PEP, adverse media,
> beneficial ownership". Our only paying customer made 1,306 calls in 30 days
> and **not one was a compliance call**: they buy search, email validation,
> deliverability, tech-stack detection and keyword tools. Ten directories were
> all advertising a product we do not sell. Lead with what sells; the
> compliance catalogue is still here, further down, where it belongs.
> Counts verified against `GET /v1/platform/facts` on the day of writing —
> re-check before resubmitting anywhere.

## Short description (1 line)

290 APIs your agent can call and pay for mid-task — web search, email and
domain verification, company enrichment, content extraction. USDC on Base, no
signup, no API key.

## Medium description (3 lines)

Strale is a pay-per-call data layer for AI agents. Web search and SERP
analysis, email validation and deliverability, company enrichment and
tech-stack detection, web and document extraction, translation and OCR, plus
company registry data across 23 countries and a full compliance catalogue.
Every call is independently quality-tested and returns an audit record. Pay per
call in USDC on Base via x402 — no account, no key, no minimum, no contract.

## Category

Data & Intelligence APIs / Agent Tooling

## Links

- x402 catalogue: https://api.strale.io/x402/catalog
- x402 discovery: https://api.strale.io/.well-known/x402.json
- Agent card (A2A): https://api.strale.io/.well-known/agent-card.json
- Website: https://strale.dev
- MCP server: https://www.npmjs.com/package/strale-mcp
- GitHub: https://github.com/strale-io

## What agents actually buy

Ordered by real external revenue over the last 30 days — not by what we find
most interesting to build.

| capability | what it does | price |
|---|---|---|
| `google-search` | Google results, structured | $0.10 |
| `email-validate` | syntax, MX, disposable, role, typo suggestions | free tier |
| `serp-analyze` | SERP composition and ranking analysis | $0.15 |
| `email-deliverability-check` | will this address actually receive mail | $0.05 |
| `tech-stack-detect` | what a site is built with | $0.03 |
| `keyword-suggest` | long-tail keywords, questions, related terms | $0.03 |
| `brand-mention-search` | where a brand is being discussed | $0.05 |
| `company-enrich` | firmographics from a domain or name | $0.05 |

Plus 280 more: web extraction, OCR, translation, invoice and document parsing,
DNS/SSL/security checks, crypto address validation, business registries in 23
countries, and the compliance set (sanctions, PEP, adverse media, beneficial
ownership) for teams that need it.

**11 capabilities are free** with no key and no payment — `email-validate`,
`dns-lookup`, `json-repair`, `url-to-markdown`, `iban-validate` and six crypto
address validators. They are the cheapest way to check we work before paying
for anything.

## Why agents use it

- **Payment is the authentication.** No signup, no API key, no procurement.
  Settle the 402 challenge and the call proceeds.
- **One integration, many tasks.** An agent doing lead research needs search,
  then verification, then enrichment, then extraction. That is four vendors, or
  one endpoint pattern.
- **Variable cost.** No monthly minimum. A workflow that runs twice costs twice.
- **Auditable.** Every call returns provenance and an audit record,
  which matters when your own customers ask where a fact came from.

## Example flow

```
GET https://api.strale.io/x402/email-validate?email=test@example.com
→ 200 (free tier, no payment needed)

GET https://api.strale.io/x402/google-search?q=competitor+pricing
→ 402 { accepts: [{ amount: "100000", asset: USDC, network: "eip155:8453" }] }
→ retry with X-Payment header
→ 200 { results: [...], provenance: {...} }
```

## Awesome-x402 / README entry

```markdown
- [Strale](https://strale.dev) — 290 pay-per-call APIs for agents: web search,
  SERP and brand monitoring, email and domain verification, company enrichment,
  tech-stack detection, web/document extraction, translation, OCR, plus company
  registries in 23 countries. [$0.01–$0.22 per call, 11 free](https://api.strale.io/x402/catalog),
  USDC on Base, no signup.
```

## Positioning note for whoever submits this

Lead with the lead-research and web-intelligence workflow, because that is what
produces revenue today. Compliance and KYB remain a genuine strength and a
strategic bet — but they are not what our paying users buy, and putting them
first has been costing us the attention of the buyers we actually have. See
`docs/company/DISTRIBUTION-FINDINGS.md`.
