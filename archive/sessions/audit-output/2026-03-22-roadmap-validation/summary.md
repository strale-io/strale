# Roadmap Validation Audit — 2026-03-22

Verified codebase state against Consolidated Implementation Roadmap claims.

---

## 1. SQS Model — Which model is actually deployed?

**✅ CONFIRMED — Dual-profile model is the production path**

| Component | Status | Location |
|-----------|--------|----------|
| `computeDualProfileSQS()` | Exported, production entry point | `sqs.ts:761` |
| QP weights (50/31/13/6) | Correct | `quality-profile.ts:54-59` |
| RP 4 factors, type-specific weights | Correct (deterministic/stable_api/scraping/ai_assisted) | `reliability-profile.ts:61-86` |
| 5×5 matrix lookup | Present, values match spec | `sqs-matrix.ts:40-47` |
| Legacy `WEIGHTS` (40/25/20/10/5) | Still present, marked LEGACY | `sqs.ts:91-97` |
| `NEUTRAL_DEFAULT=70` | ❌ NOT FOUND — never existed in code | N/A |
| Trust API calls | Both `internal-trust.ts` and `quality.ts` call `computeDualProfileSQS()` exclusively | `internal-trust.ts:28,308,533`; `quality.ts:57` |

**Discrepancy:** Roadmap references `NEUTRAL_DEFAULT=70` but this constant does not exist and never did. Missing factors get `score: 0` with proportional re-weighting.

---

## 2. Glama/Registry SQS Descriptions

**✅ CONFIRMED — All READMEs use the correct dual-profile description**

| File | SQS Description | Status |
|------|-----------------|--------|
| Root `README.md` | "Quality Profile... Reliability Profile... 5×5 matrix" | ✅ Current |
| `packages/mcp-server/README.md` | Full dual-profile breakdown with QP weights and RP factors | ✅ Current |
| `smithery.yaml` | No SQS description (config only) | N/A |
| `packages/sdk-typescript/README.md` | Links only, no embedded SQS description | N/A |
| `packages/langchain-strale/README.md` | No SQS section | N/A |
| `packages/crewai-strale/README.md` | No SQS section | N/A |

**No outdated 5-factor descriptions found.** If Glama still shows the old description, it's cached from a previous README version — republishing will fix it.

---

## 3. Capability Counts

| Metric | Count | Source |
|--------|-------|--------|
| Executor files | **260** | `apps/api/src/capabilities/*.ts` (excluding index, auto-register, lib/) |
| Seeded test suites | **139** | `apps/api/src/db/seed-tests.ts` |
| Auto-generated test suites | 1,215+ | Via `generate-*.ts` scripts (additional to seed) |
| Solutions defined | **29** | `apps/api/src/db/seed-solutions.ts` |
| Frontend stats bar | **"250+"** | `strale-frontend/src/lib/constants.ts` |
| Live API count | **251** (active) | `GET /v1/capabilities` |
| Backend API (all including inactive) | **256** | DB total |

**⚠️ PARTIAL — Frontend says "250+" but 260 executors exist and 251 are active via API. The "250+" copy is slightly stale but within acceptable range for marketing copy.**

---

## 4. Free-Tier Capabilities

**✅ CONFIRMED — All 5 implemented**

| Check | Status | Evidence |
|-------|--------|----------|
| `is_free_tier` column in schema | ✅ | `schema.ts:109` |
| 5 free slugs configured | ✅ | `packages/mcp-server/src/tools.ts:209-215` (email-validate, dns-lookup, json-repair, url-to-markdown, iban-validate) |
| IP rate limiting 10/day | ✅ | `rateLimitFreeTierByIp()` in `lib/rate-limit.ts`, applied in `routes/do.ts` |
| MCP anonymous execution | ✅ | `packages/mcp-server/src/tools.ts` — strale_search works without auth, strale_execute allows free-tier without API key |

---

## 5. Credential Configuration

**✅ CONFIRMED — Credential health system exists**

| Check | Status | Evidence |
|-------|--------|----------|
| `OPENSANCTIONS_API_KEY` | Used by `pep-check` (required) and `sanctions-check` (optional, Claude fallback) | `capabilities/pep-check.ts`, `capabilities/sanctions-check.ts` |
| `ZEFIX_USERNAME` / `ZEFIX_PASSWORD` | Used by Swiss provider chain (primary), Browserless fallback | `capabilities/providers/swiss-company-data.ts` |
| Startup credential check | ⚠️ Tracked but NOT enforced at startup — test runner skips unconfigured capabilities | `lib/credential-health.ts` |
| 5 providers tracked | ✅ opensanctions, browserless, serper, companies_house, anthropic | `lib/credential-health.ts` |

**Discrepancy:** Sprint 13B claimed credential health check was "specced but not implemented." It IS implemented as a tracking system, but does not BLOCK startup — it silently skips unconfigured capabilities during test runs.

---

## 6. x402 Gateway

**✅ CONFIRMED**

| Check | Status | Evidence |
|-------|--------|----------|
| x402 routes exist | ✅ | `routes/x402-gateway.ts` |
| 5 capabilities exposed | ✅ | iban-validate ($0.05), vat-format-validate ($0.05), paid-api-preflight ($0.02), ssl-check ($0.05), sanctions-check ($0.10) |
| Payment verification | ⚠️ **DUAL**: Real in `routes/do.ts` (calls `verifyX402Payment`), STUB in `routes/x402-gateway.ts` (any X-Payment header accepted) | `lib/x402-gateway.ts:122-158`, `routes/x402-gateway.ts:93-137` |
| Env vars referenced | ✅ | `X402_WALLET_ADDRESS`, `X402_NETWORK`, `X402_FACILITATOR_URL`, `EUR_USD_RATE`, `API_BASE_URL` |
| Network | Base mainnet (`base-mainnet` in payment headers) | Verified via curl in earlier session |

---

## 7. Sprint 5A — MCP Decision-Ready Capability Graph

**❌ NOT FOUND — Still uses generic pattern**

Current MCP tool names (from `packages/mcp-server/src/tools.ts`):
- `strale_balance`
- `strale_execute`
- `strale_getting_started`
- `strale_methodology`
- `strale_ping`
- `strale_search`
- `strale_transaction`
- `strale_trust_profile`

**Missing from Sprint 5A spec:**
- ❌ `search_workflows` — not implemented
- ❌ `search_capabilities` — not implemented (uses `strale_search` instead)
- ❌ `get_quality_score` — not implemented (uses `strale_trust_profile` instead)
- ❌ `get_capability_health` — not implemented
- ❌ `run_workflow` — not implemented
- ❌ `run_capability` — not implemented (uses `strale_execute` instead)

**The MCP tool names are branded (`strale_*`) rather than generic. This appears to be a deliberate design choice rather than a missing implementation.**

---

## 8. Agent Skills Repo and Plugin Submissions

| Check | Status | Evidence |
|-------|--------|----------|
| `.claude-plugin/marketplace.json` | ❌ NOT FOUND | Does not exist |
| ClawHub SKILL.md files | ❌ NOT FOUND | No `claw/` or `openclaw/` directories |
| LobeHub files | ❌ NOT FOUND | No LobeHub-related files |
| Git log references | ❌ No commits mentioning ClawHub, LobeHub, awesome-agent-skills | `git log` search returned empty |
| awesome-x402 PR #135 | ❌ No commit reference | Not in git history |
| coinbase/x402 PR #1709 | ❌ No commit reference | Not in git history |
| smithery.yaml | ✅ EXISTS | Repo root, MCP server config for smithery.ai |

**These are outstanding roadmap items — no work has been done on agent skills repos or plugin submissions.**

---

## 9. EU Registry API Migrations

| Country | API Used | Browserless? | Status |
|---------|----------|-------------|--------|
| Norway | `data.brreg.no` direct API | No | ✅ Direct API |
| France | `recherche-entreprises.api.gouv.fr` | No | ✅ Direct API |
| Finland | `avoindata.prh.fi` v3 | No | ✅ Direct API |
| Switzerland | Browserless scraping of `zefix.admin.ch` (main executor) | Yes | ⚠️ Provider chain has Zefix REST API primary + Browserless fallback, but main executor still uses Browserless |
| Belgium | Browserless scraping of KBO/BCE | Yes | ⚠️ Still Browserless |
| Australia | Dual: `au-company-data.ts` (XML API) + `australian-company-data.ts` (Browserless) | Both exist | ⚠️ Both active, provider chain has API primary + Browserless fallback |

---

## 10. DataProvider Abstraction

**✅ CONFIRMED**

| Check | Status | Evidence |
|-------|--------|----------|
| `data-provider.ts` with FallbackChain | ✅ | `lib/data-provider.ts` — exports `FallbackChain`, `registerChain()`, `executeWithFallback()` |
| Provider chain files | 4 files | `capabilities/providers/` |
| Countries with chains | Norway, Finland, Switzerland, Australia | Single-provider chains for NO/FI; fallback chains for CH/AU |

---

## 11. Event-Driven Testing (Sprint 6C)

**✅ CONFIRMED**

| Trigger | Status | Evidence |
|---------|--------|----------|
| On-deploy | ✅ | `lib/event-triggers.ts` — spot-checks unstable/recovering capabilities |
| On-failure | ✅ | `lib/event-triggers.ts` — verifies capability on first failure after clean streak |
| On-dependency-change | ✅ | `lib/event-triggers.ts` — re-tests affected capabilities |
| Dependency map | ✅ | `lib/upstream-health-gate.ts`, `lib/dependency-health.ts` — maps VIES, OpenSanctions, GLEIF, Brreg, Browserless to capabilities |

---

## 12. Compliance Infrastructure

| Check | Status | Evidence |
|-------|--------|----------|
| SHA-256 hash chain | ✅ | `lib/integrity-hash.ts` — per-day chain, genesis hash `sha256("strale-genesis-v1")`, columns `integrityHash` + `previousHash` on transactions |
| 3-year retention | ✅ | `lib/data-retention.ts` — transactions/quality 3yr, test_results 90d, health events 180d, snapshots 365d |
| Litigation hold | ✅ | `legal_hold` column on transactions, enforced across all purge functions |

---

## 13. Onboarding Pipeline

**✅ CONFIRMED**

| Check | Status | Evidence |
|-------|--------|----------|
| `scripts/onboard.ts` | ✅ | Manifest-driven pipeline |
| `--discover` flag | ✅ | Auto-generates expected_fields from live execution |
| `--backfill` flag | ✅ | Updates existing capabilities |
| `--fix` flag | ✅ | Auto-corrects fixture mismatches |
| `--strict` flag | ✅ | Aborts on execute-and-verify failure |
| `--dry-run` flag | ✅ | Preview without DB writes |
| `output_field_reliability` column | ✅ | `schema.ts` — JSONB column `{field: 'guaranteed'\|'common'\|'rare'}` |
| PATCH test suite rules endpoint | ✅ | `POST /v1/internal/tests/patch-suite-rules` (admin-only) |

---

## 14. Self-Healing / Auto-Remediation

**✅ CONFIRMED**

| Component | Status | Evidence |
|-----------|--------|----------|
| `auto-remediation.ts` | ✅ | 7 rules: stale_date, dead_url, field_rename, field_removal, schema_drift, field_reliability_downgrade, volatile_value_recalibration |
| `health-sweep.ts` | ✅ | Weekly sweep: stale date scan, URL liveness, quarantine review, upstream recovery, health report |
| `failure-classifier.ts` | ✅ | 8 verdicts: upstream_transient, upstream_degraded, upstream_changed, test_infrastructure, test_design, capability_bug, stale_input, unknown |
| `lifecycle.ts` | ✅ | 6 states: draft → validating → probation → active ↔ degraded → suspended |

---

## 15. Frontend State

| Check | Status | Evidence |
|-------|--------|----------|
| Methodology page | ✅ | `strale-frontend/src/pages/Methodology.tsx` (964 lines), route `/trust` |
| Dual-profile model documented | ✅ | QP weights, RP factors, 5×5 matrix all present |
| Capability count in stats bar | "250+" | `strale-frontend/src/lib/constants.ts` — `CAPABILITY_COUNT_DISPLAY = "250+"` |
| Playground page | ❌ NOT FOUND | No route, no file, no content |
| `public/llms.txt` | ✅ | 538 lines, full SQS methodology, dual-profile description |

---

## 16. Pending PRs Verification

| PR | Status | Evidence |
|----|--------|----------|
| awesome-x402 PR #135 | ❌ No reference in git history | Not submitted from this repo |
| coinbase/x402 PR #1709 | ❌ No reference in git history | Not submitted from this repo |

---

## Critical Discrepancies Summary

### Roadmap says DONE but code doesn't fully match:
1. **Sprint 5A MCP tool renaming** — Tools use `strale_*` pattern, not the `search_workflows`/`run_capability` names from the spec. This appears intentional (branding) rather than missing.
2. **x402 payment verification** — Real in `/v1/do`, but STUB in `/x402/*` gateway routes. Mixed state.
3. **Swiss company data API** — Provider chain has Zefix REST API, but main executor still uses Browserless.

### Roadmap says OUTSTANDING but actually exists:
1. **Credential health check** — Listed as "specced but not implemented" in Sprint 13B, but `credential-health.ts` IS implemented (tracks 5 providers, test runner skips unconfigured capabilities).
2. **Event-driven testing** — All 3 triggers (on-deploy, on-failure, on-dependency-change) are implemented.

### Genuinely outstanding (confirmed NOT done):
1. **Agent skills repos** — No ClawHub, LobeHub, or awesome-agent-skills submissions
2. **Playground page** — Does not exist on frontend
3. **Plugin marketplace files** — No `.claude-plugin/marketplace.json`
4. **awesome-x402 and coinbase PRs** — Not submitted

### Outdated but acceptable:
1. **Frontend "250+"** — Backend has 260 executors, 251 active via API. Marketing copy "250+" is slightly stale but not misleading.
2. **`NEUTRAL_DEFAULT=70`** — Referenced in roadmap but never existed in code. Missing factors use score=0 with proportional re-weighting.
