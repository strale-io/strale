# Fact-Check Audit — All 26 Tweets
# Auditor: Claude (fact-checker role)
# Date: 2026-04-16
# Method: verified against source code, production DB, and package registries

## Summary
- ✅ PASS: 19 tweets — all claims verified
- ⚠️ NEEDS FIX: 7 tweets — specific claims inaccurate or misleading
- ❌ REJECT: 0

---

## ✅ #1 — IBAN demo (Apr 16) — PASS
- "5 milliseconds" — DB avg: 4ms, min: 0ms, max: 20ms. ✅ Accurate (typical case)
- "No signup. No API key." — iban-validate is in is_free_tier. ✅
- "Structured JSON back. Bank code, country, check digits" — verified in real response. ✅
- "One of 5 free capabilities" — 5 free-tier caps confirmed. ✅
- Self-reply lists: email-validate, dns-lookup, json-repair, url-to-markdown — all is_free_tier. ✅

## ✅ #2 — Problem statement (Apr 17) — PASS
- Pure opinion/positioning. No factual claims. ✅

## ✅ #3 — Capability count (Apr 17) — PASS
- "297 data capabilities" — DB: 297. ✅
- "108 bundled solutions" — DB: 108. ✅
- "20 countries" — KYB country count: 20. ✅

## ✅ #4 — Quality endpoint (Apr 18) — PASS
- "GET /v1/quality/iban-validate" — public endpoint, no auth. ✅
- "Returns SQS score, quality profile, reliability profile, health state" — verified. ✅

## ⚠️ #5 — KYB demo (Apr 20) — NEEDS FIX
- "Registry lookup + VAT validation + LEI check" — ❌ WRONG
  Actual steps: swedish-company-data, vat-validate, sanctions-check, lei-lookup.
  That's 4 steps, not 3. AND it includes sanctions-check which isn't mentioned.
- "€1.50 per call" — DB: 150 cents. ✅
- "20 countries available" — ✅
- **Fix**: "One API call. Registry lookup + VAT validation + sanctions screening + LEI check. Four checks, one call."

## ✅ #6 — Silent degradation (Apr 20) — PASS
- Pure opinion. No factual claims. ✅

## ⚠️ #7 — KYB 20 markets (Apr 21) — NEEDS FIX
- Country list SE, NO, DK, FI, UK, DE, FR, NL, BE, AT, IE, ES, IT, CH, PL, PT, US, CA, AU, SG — ✅ verified
- "Registry lookup, VAT validation, LEI check, sanctions screening" — ✅ (matches actual steps)
- "Built in Sweden" — ✅
- "Data stays in the jurisdictions it belongs to" — ⚠️ MISLEADING
  The API server is on Railway US East. Data transits through US infrastructure.
  data_jurisdiction field says "EU" for some but the server is in US.
  **Fix**: Remove "Data stays in the jurisdictions it belongs to." Replace with: "Every response includes data jurisdiction and provenance metadata."

## ✅ #8 — SQS distribution (Apr 21) — PASS
- "86% score A-grade" — DB: 242/281 = 86%. ✅
- QP + RP description matches methodology. ✅

## ⚠️ #9 — Nine integrations (Apr 21) — NEEDS FIX
- Raw HTTP ✅, TypeScript SDK (straleio npm) ✅, Python SDK (straleio PyPI) ✅
- LangChain (langchain-strale 0.1.4 PyPI) ✅, CrewAI (crewai-strale 0.1.4 PyPI) ✅
- Semantic Kernel (strale-semantic-kernel 0.1.4 npm) ✅
- MCP (strale-mcp 0.2.4 npm) ✅
- n8n — ⚠️ n8n-nodes-strale exists but AWAITING verification on Creator Portal. Not yet installable by n8n Cloud users.
- x402 — ✅ live on Base mainnet
- **Fix**: Change "n8n community node" to "n8n community node (pending verification)" or drop n8n and say "eight ways" until it's verified.

## ⚠️ #10 — EU AI Act audit trail (Apr 22) — NEEDS FIX
- "The EU AI Act requires audit trails for high-risk AI systems" — ⚠️ OVERSIMPLIFIED
  EU AI Act Article 12 requires logging for high-risk AI, but Strale is an API data provider, not itself a high-risk AI system. Strale helps its USERS comply, not itself.
- "Every Strale API response includes: data source, fetch timestamp, quality score at execution time, provenance chain, data jurisdiction" — ✅ verified in audit_trail field
- **Fix**: "The EU AI Act requires logging for high-risk AI systems. If your agent is in scope, every data call needs a paper trail. Every Strale API response includes: data source, fetch timestamp, quality score, provenance chain, data jurisdiction."

## ✅ #11 — Email validate (Apr 22) — PASS
- "Checks against 5,361 known disposable domains" — disposable-domains.txt: 5,361 lines. ✅
- Free tier, no API key — ✅

## ✅ #12 — MCP no test suites (Apr 22) — PASS
- Opinion. "Almost none have a test suite" — reasonable observation, not a statistical claim. ✅

## ⚠️ #13 — Source registries (Apr 23) — NEEDS FIX (already flagged)
- "data comes from Bolagsverket" — ❌ Code goes to allabolag.se
- "Brønnøysundregistrene" — ✅ Code goes to data.brreg.no
- "api.gouv.fr" — ✅ Code goes to recherche-entreprises.api.gouv.fr
- "We don't aggregate into a third-party database. We go to the source." — ❌ FALSE for ~60% of countries
- **Fix**: Already drafted above. Use honest version acknowledging mix of direct + indirect sources.

## ⚠️ #14 — MCP quality gap (Apr 23) — NEEDS FIX
- "21,000 MCP servers and counting" — This was from our social media sweep, sourced from Glama/mcp.so listings. ⚠️ Should attribute or say "thousands" instead of citing a specific number that may be stale.
- **Fix**: "Thousands of MCP servers and growing" or "Over 20,000 MCP servers" with source note.

## ⚠️ #15 — PEP check (Apr 23) — NEEDS FIX (already flagged)
- "Checks against OpenSanctions" — ❌ May use Dilisense as fallback
- **Fix**: Already drafted. "Checks against international sanctions and PEP databases. The response tells you exactly which source was used."

## ✅ #16 — DNS demo (Apr 24) — PASS
- Free tier, no auth, returns DNS records — all verified. ✅

## ✅ #17 — Static tools opinion (Apr 24) — PASS
- Pure opinion. No factual claims. ✅

## ⚠️ BORDERLINE — #18 — Free tier (Apr 25)
- "100 calls per day. Free forever." — ❌ WRONG
  Code: FREE_TIER_DAILY_LIMIT = 10, not 100.
  CLAUDE.md says limit was "raised from 10 to 100" but the code shows 10.
  **Fix**: Verify current production value. If code says 10, say 10. Don't trust CLAUDE.md over source code.

## ✅ #19 — x402 gap (Apr 27) — PASS
- Opinion on x402 ecosystem. No specific factual claim. ✅

## ✅ #20 — MCP npx (Apr 27) — PASS
- "npx strale-mcp" — strale-mcp 0.2.4 published on npm. ✅
- "297 capabilities" — ✅

## ✅ #21 — Transparency tags (Apr 28) — PASS
- algorithmic, api, scrape, ai_generated, mixed — all valid transparency_tag values. ✅
- But note: DB column is called transparency_tag, actual values verified. ✅

## ✅ #22 — LangChain demo (Apr 28) — PASS
- "pip install langchain-strale" — langchain-strale 0.1.4 on PyPI. ✅
- "pip install crewai-strale" — crewai-strale 0.1.4 on PyPI. ✅
- "297 data capabilities" — ✅

## ✅ #23 — SQS thread (Apr 28) — PASS
- QP factors (correctness, schema, error handling, edge cases) — matches sqs.ts. ✅
- RP factors (availability, success rate, upstream health, latency) — matches sqs.ts. ✅
- "QP × RP → SQS letter grade (A–E) → numeric score (0–100)" — simplified but accurate. ✅

## ✅ #24 — EU registry flags (Apr 29) — PASS if #13 is fixed
- Lists registry NAMES, not claims about direct connections. If presented as "registries we cover" rather than "registries we connect to directly," this is fine.
- **Fix**: Change heading from "EU company registries we connect to directly" to "EU company registries we cover"

## ✅ #25 — Audit trail (Apr 29) — PASS
- "data source, fetch timestamp, quality score, provenance chain" — all in audit_trail JSONB. ✅

## ✅ #26 — Two-week summary (Apr 29) — PASS
- All numbers previously verified. ✅

---

## Required fixes (7 tweets):

1. **#5**: "3 checks" → "4 checks" (add sanctions-check)
2. **#7**: Remove "Data stays in the jurisdictions" → replace with provenance metadata note
3. **#9**: n8n "pending verification" caveat, or drop to "eight ways"
4. **#10**: Reframe EU AI Act — Strale helps users comply, isn't itself in scope
5. **#13**: Rewrite completely — honest about mix of direct and indirect sources
6. **#14**: "21,000" → "Thousands" or "Over 20,000" without false precision
7. **#15**: "OpenSanctions" → "international sanctions and PEP databases"

## Critical fix:
8. **#18**: "100 calls per day" is likely WRONG — code says 10. VERIFY BEFORE PUBLISHING.
