# PR Description for MCP Registry

---

## Add Strale to MCP Registry

**Strale** is the trust layer for AI agents — 250+ independently tested and quality-scored business data capabilities across 27 countries, accessible via MCP Streamable HTTP.

### Server Details

- **Name:** Strale
- **MCP Endpoint:** `https://api.strale.io/mcp`
- **Transport:** Streamable HTTP
- **Auth:** Bearer token (API key from https://strale.dev)
- **Free tier:** `strale_search` works without authentication
- **npm:** [strale-mcp](https://www.npmjs.com/package/strale-mcp)
- **Server Card:** https://api.strale.io/.well-known/mcp.json

### Capabilities

250+ tools spanning:
- IBAN, VAT, LEI, BIC validation
- Company data across EU, Nordic, UK, US, APAC (27 countries)
- Sanctions screening and adverse media checks
- SSL certificate and DNS checks
- EU compliance automation (KYB, AML, GDPR)
- Invoice, receipt, and contract data extraction
- Developer tools (CVE lookup, npm/PyPI info, GitHub analysis)

### Trust Scoring

Every capability is independently tested with the Strale Quality Score (SQS) — a dual-profile system measuring code quality and operational reliability, producing grades A through F.

### Multi-Protocol

Strale also supports A2A (Agent-to-Agent), REST API, and x402 micropayments alongside MCP.

### Links
- Homepage: https://strale.dev
- Docs: https://strale.dev/docs
- GitHub: https://github.com/petterlindstrom79/strale
- MCP Server Card: https://api.strale.io/.well-known/mcp.json
- AI Catalog: https://api.strale.io/.well-known/ai-catalog.json
