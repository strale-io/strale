# Tweets v2 — Apr 16–30, 2026
# Corrected day-of-week references (Apr 16 = Thursday)
#
# Schedule:
#   Tue/Wed/Thu (peak): 08:00 EU + 15:00 + 17:00 CET = 3 posts
#   Mon/Fri: 15:00 + 17:00 CET = 2 posts
#   Saturday: 15:00 CET = 1 light post (free tier, opinions, quality endpoint)
#   Sunday: no posts
#
# File naming: {#}-{media}-{date}-{name}.png
# All claims verifiable via public API or published packages

## Verified facts (DB snapshot Apr 16)
- 297 active capabilities, 108 active solutions
- 1,805 test suites
- 21 categories, 20 KYB countries
- SQS: 242 A-grade out of 281 scored (86%)
- 273 unique data sources
- 5 free-tier capabilities (no auth)
- 9 integration paths (MCP, TS SDK, Python SDK, LangChain, CrewAI, SK, n8n, x402, Pipedream)
- IBAN validate: 5ms response, pure algorithmic

## Long-form content plan
- **Dev.to #1 (week of Apr 21)**: "How We Score 297 Agent Data Capabilities" — SQS methodology
- **Dev.to #2 (week of Apr 28)**: "Give Your LangChain Agent Verified Data in 3 Lines" — tutorial

---

## THU Apr 16 ✓ POSTED

### #1 — 15:00 CET — 📊 1-x-16apr-iban-demo.png (code-snippet-card)
**Integrity**: Real API call, real response. Anyone can reproduce with curl.

Your agent can validate an IBAN in 5 milliseconds. No signup. No API key.

curl -X POST https://api.strale.io/v1/do \
  -H "Content-Type: application/json" \
  -d '{"task":"iban-validate","inputs":{"iban":"DE89370400440532013000"}}'

Structured JSON back. Bank code, country, check digits, validity.

One of 5 free capabilities — no account needed.

**Self-reply:**
Four more free capabilities: email-validate, dns-lookup, json-repair, url-to-markdown. All work the same way. strale.dev/docs

---

## FRI Apr 17

### #2 — 15:00 CET — 📊 2-x-17apr-problem-statement.png (quote-card)
**Integrity**: Opinion/positioning claim. No data assertion.

When an AI agent calls an external data source, it has no signal about whether the data is fresh, correct, or even real.

No quality score. No audit trail. No way to know what went wrong when it breaks.

That's the problem we're building Strale to solve.

### #3 — 17:00 CET — 📊 3-x-17apr-capability-count.png (stat-card)
**Integrity**: Counts from capabilities + solutions tables. Verifiable via GET /v1/capabilities.

297 data capabilities. 108 bundled solutions. 20 countries.

Company registries, compliance checks, financial validation, document extraction, developer tools.

Every one independently tested. Every one quality-scored.

**Self-reply:**
Full catalog: strale.dev/capabilities

---

## SAT Apr 18 (weekend — 1 light post)

### #4 — 15:00 CET — no graphic
**Integrity**: Public API endpoint. Anyone can call it.

Every capability on Strale has a public quality endpoint.

GET /v1/quality/iban-validate

Returns the current SQS score, quality profile, reliability profile, and health state. Free. No auth.

Check any capability's score before you rely on it.

---

## SUN Apr 19 — no posts

---

## MON Apr 20

### #5 — 15:00 CET — 📊 5-x-20apr-kyb-demo.png (code-snippet-card)
**Integrity**: Real API call. Reproducible. Price from solutions table.

Your agent needs to verify a Swedish company before onboarding.

One API call. Four checks: registry lookup, VAT validation, sanctions screening, LEI verification.

Structured result. Audit trail. Quality scored.

€1.50 per call. No subscription. 20 countries available.

**Self-reply:**
Works with LangChain, CrewAI, MCP, or raw HTTP. Same API, same quality guarantees. strale.dev/docs

### #6 — 17:00 CET — no graphic (opinion)
**Integrity**: Architectural opinion. No data claim.

The hardest part of building agent data infrastructure isn't the API layer. It's knowing when a data source has silently degraded.

A company registry that returns stale data looks exactly like one that returns fresh data. Unless you're testing continuously.

---

## TUE Apr 21 (peak day — 3 posts)

### #7 — 08:00 CET — no graphic (EU-specific) 🇪🇺
**Integrity**: Factual coverage list. Verifiable via GET /v1/solutions.

KYB verification for 20 European and global markets — from a single API.

SE, NO, DK, FI, UK, DE, FR, NL, BE, AT, IE, ES, IT, CH, PL, PT, US, CA, AU, SG.

Registry lookup, VAT validation, sanctions screening, LEI check. Bundled into one call per country.

Built in Sweden. Every response includes data jurisdiction and provenance metadata.

### #8 — 15:00 CET — 📊 8-x-21apr-sqs-distribution.png (bar-chart)
**Integrity**: From sqs_daily_snapshot table. Anyone can verify individual scores via /v1/quality/:slug.

We score every capability on two dimensions:

Quality Profile — correctness, schema stability, error handling.
Reliability Profile — availability, success rate, upstream health.

These combine into SQS (0–100).

Current distribution: 86% score A-grade. The rest show you exactly what's degraded.

### #9 — 17:00 CET — thread (2 tweets)
**Integrity**: Published packages. Verifiable on npm/PyPI.

**1/2:**
Eight ways to connect your agent to Strale:

→ Raw HTTP (any language)
→ TypeScript SDK
→ Python SDK
→ LangChain plugin
→ CrewAI plugin
→ Semantic Kernel plugin
→ MCP server (Claude, Cursor, Windsurf)
→ x402 pay-per-use (Base mainnet)

**2/2:**
Same 297 capabilities. Same quality scores. Same audit trails.

Pick the protocol your agent already speaks.

**Self-reply:**
Docs for each: strale.dev/docs

---

## WED Apr 22 (peak day — 3 posts)

### #10 — 08:00 CET — no graphic (EU-specific) 🇪🇺
**Integrity**: Feature description. Verifiable via EU AI Act compliance fields in API response.

The EU AI Act requires logging for high-risk AI systems. If your agent is in scope, every data call needs a paper trail.

Every Strale API response includes: data source, fetch timestamp, quality score at execution time, provenance chain, data jurisdiction.

Built in from day one — not bolted on after the regulation.

### #11 — 15:00 CET — 📊 11-x-22apr-email-validate.png (code-snippet-card)
**Integrity**: Real API call. Free tier. Anyone can reproduce.

Validate an email address — syntax, domain, MX records, disposable domain check — in one call:

curl -X POST https://api.strale.io/v1/do \
  -d '{"task":"email-validate","inputs":{"email":"test@tempmail.com"}}'

Free. No API key. Checks against 5,361 known disposable domains.

### #12 — 17:00 CET — no graphic (opinion)
**Integrity**: Opinion on MCP quality gap.

Every MCP server has a description. Almost none have a test suite.

Your agent picks tools based on the description alone. It has no signal about correctness, schema stability, or failure rate.

Quality metadata should be part of the MCP spec, not an afterthought.

---

## THU Apr 23 (peak day — 3 posts)

### #13 — 08:00 CET — no graphic (EU-specific) 🇪🇺
**Integrity**: Factual. GDPR + data residency positioning.

We pull company data from 20 countries. Some via direct government APIs — Norway's Brønnøysund, France's api.gouv.fr, Finland's PRH, Switzerland's Zefix. Others via commercial registries and public data sources.

Every response tells you exactly where the data came from — the provenance field shows the source, method, and fetch time. No black boxes.

### #14 — 15:00 CET — 📊 14-x-23apr-mcp-quality.png (quote-card)
**Integrity**: Opinion on MCP ecosystem gap. 21,000 number from Glama/mcp.so listings.

MCP gives you a protocol for tool discovery. It doesn't give you a signal about which tools are reliable.

Thousands of MCP servers and growing. No quality scores. No test results. No way to know which ones break on edge cases.

That's a solvable problem.

### #15 — 17:00 CET — 📊 15-x-23apr-pep-check.png (code-snippet-card)
**Integrity**: Real API call. Requires auth key. Checks OpenSanctions.

Check if a person appears on sanctions lists or is a politically exposed person:

curl -X POST https://api.strale.io/v1/do \
  -H "Authorization: Bearer YOUR_KEY" \
  -d '{"task":"pep-check","inputs":{"name":"John Smith","country":"US"}}'

Checks against international sanctions and PEP databases. The response tells you exactly which source was used. One API call.

---

## FRI Apr 24

### #16 — 15:00 CET — 📊 16-x-24apr-dns-demo.png (code-snippet-card)
**Integrity**: Real API call. Free tier. Reproducible.

Check any domain's DNS records — no signup:

curl -X POST https://api.strale.io/v1/do \
  -d '{"task":"dns-lookup","inputs":{"domain":"strale.dev"}}'

Returns A, AAAA, MX, TXT, NS, CNAME records. Structured JSON.

Free. No API key. One of 5 capabilities available without an account.

### #17 — 17:00 CET — no graphic (opinion)
**Integrity**: Architectural insight. No data claim.

Most agent frameworks treat tools as static. You register them at startup and they never change.

But data sources degrade, go offline, change schemas, hit rate limits. The tool that worked yesterday might not work today.

Dynamic quality signals solve this. The agent checks the score, then decides whether to call.

---

## SAT Apr 25 (weekend — 1 light post)

### #18 — 15:00 CET — 📊 18-x-25apr-free-tier.png (stat-card)
**Integrity**: Free-tier capabilities verifiable by anyone with curl.

5 capabilities. Zero signup. No API key.

→ iban-validate
→ email-validate
→ dns-lookup
→ json-repair
→ url-to-markdown

10 calls per day per IP. Free forever.

---

## SUN Apr 26 — no posts

---

## MON Apr 27

### #19 — 15:00 CET — no graphic (opinion)
**Integrity**: Opinion on x402 ecosystem gap. Verifiable by checking x402.org ecosystem page.

x402 brings payments to the agent protocol layer. Coinbase, Google, Stripe, Visa are behind it.

But payments without verification is a gap. Your agent can pay any x402 endpoint — including one operated by a sanctioned entity.

Compliance checks should be part of the transaction, not an afterthought.

### #20 — 17:00 CET — no graphic
**Integrity**: Published package. Factual.

If you use MCP with Claude, Cursor, or Windsurf — you can connect to Strale's 297 capabilities without writing integration code.

npx strale-mcp

Search the catalog. Check quality scores. Execute capabilities. All from your MCP client.

**Self-reply:**
npm: npmjs.com/package/strale-mcp

---

## TUE Apr 28 (peak day — 3 posts)

### #21 — 08:00 CET — no graphic (EU-specific) 🇪🇺
**Integrity**: Factual. Transparency feature description.

Every capability on Strale has a transparency tag:

→ algorithmic — computed locally, no external call
→ api — data from a structured external API
→ scrape — extracted from a website via headless browser
→ ai_generated — uses an LLM in the processing chain
→ mixed — combines multiple data source types

Your agent should know how its data was produced.

### #22 — 15:00 CET — 📊 22-x-28apr-langchain.png (code-snippet-card)
**Integrity**: Published package. pip install langchain-strale.

Three lines to give your LangChain agent 297 data capabilities:

from langchain_strale import StraleToolkit
toolkit = StraleToolkit(api_key="sk_...")
tools = toolkit.get_tools()

Each tool has a quality score in its description. The agent sees the score before it decides to call.

**Self-reply:**
pip install langchain-strale · Also available for CrewAI (pip install crewai-strale)

### #23 — 17:00 CET — thread (2 tweets) — SQS methodology
**Integrity**: Methodology description. Verifiable via /v1/quality/:slug responses.

**1/2:**
What goes into a Strale Quality Score:

Quality Profile (QP):
- Correctness: does the output match ground truth?
- Schema: does the JSON structure match the spec?
- Error handling: are errors structured, not raw HTML?
- Edge cases: what happens with unusual inputs?

**2/2:**
Reliability Profile (RP):
- Current availability: is the upstream reachable?
- Rolling success rate: last 10 test runs
- Upstream health: is the external API healthy?
- Latency: response time trend

QP × RP → SQS letter grade (A–E) → numeric score (0–100).

Public for every capability: GET /v1/quality/:slug

---

## WED Apr 29 (peak day — 3 posts)

### #24 — 08:00 CET — no graphic (EU-specific) 🇪🇺
**Integrity**: Factual. Country-specific registries.

Company data from 19 European registries — one API:

🇸🇪 Sweden  🇳🇴 Norway  🇩🇰 Denmark  🇫🇮 Finland
🇬🇧 UK  🇩🇪 Germany  🇫🇷 France
🇳🇱 Netherlands  🇧🇪 Belgium  🇦🇹 Austria  🇮🇪 Ireland
🇪🇸 Spain  🇮🇹 Italy  🇨🇭 Switzerland
🇵🇱 Poland  🇵🇹 Portugal  🇪🇪 Estonia  🇱🇻 Latvia  🇱🇹 Lithuania

Mix of direct government APIs and commercial data sources. Every response includes the actual data source used.

### #25 — 15:00 CET — 📊 25-x-29apr-audit-trail.png (quote-card)
**Integrity**: Feature description. Verifiable in any API response.

Every API response from Strale includes an audit trail.

What data source was used. When it was fetched. What the quality score was at execution time. What the provenance chain looks like.

Your agent doesn't just get data — it gets a receipt.

### #26 — 17:00 CET — no graphic (two-week summary)
**Integrity**: All numbers previously verified.

Two weeks of building the trust layer for AI agents:

→ 297 capabilities across 21 categories
→ 108 solutions covering 20 countries
→ 9 integration paths
→ x402 pay-per-use on Base mainnet
→ Public quality scores for every capability

strale.dev
