## Workflow Protocol

### Session Start
1. Declare session intent (one sentence: what is this session for?)
2. Determine mode:
   - **Quick:** Bug fix, config change, single small component (<2 hours, no design decisions)
   - **Full:** New feature, design exploration, multi-component work, anything requiring decisions
3. Escalation triggers: second feature touched, design decision emerges, >2hr estimate, contradiction detected.
See .claude/PROTOCOL.md for full criteria and protocol definitions.

### Notion Access (REQUIRED)
- Project Home: https://www.notion.so/31167c87-082c-81fb-96da-d3188d34aa72
- To-do & Build Plan: https://www.notion.so/33c67c87-082c-81c3-a72b-cc59b10ff4ac
- Decisions DB: ea57671f-7167-44e4-a254-c0a1de79e7f9
- Governance: How we work > How this workspace works (33c67c87-082c-81ea-8417-c4a701d68611)

### Notion Workspace Structure (8 sections under Project Home)
1. 🏠 Start Here — overview + navigation
2. 🎯 Strategy — what Strale is, the problem, opportunity, competitive landscape, business model
3. 🛠️ Products — SQS, Audit Trail, Discovery, Capabilities & solutions, Feature Registry DB
4. ✅ To-do & Build Plan — THE ONLY task list (To-do DB + Deferred DB)
5. 📣 Go-to-market — distribution surfaces, activation funnel, brand & voice, social media, Social Media Posts DB
6. 🔧 Internals — testing system, testing rules, onboarding pipeline, bug fix framework, tech stack
7. 📓 Journal — session logs, brainstorms, analyses (Journal DB)
8. ⚙️ How we work — working rules, governance, Decisions DB, Glossary DB

### Notion Governance Rules (enforced)
- **Check before creating** — look at the page directory before creating any new page
- ONE page per topic — never create v2, update existing subpage
- Brainstorms go to Journal DB, not as standalone pages
- To-do DB is THE ONLY task list — action items never live in prose
- Superseded pages archived same session (prefix + move to archive)
- Search existing pages before creating new ones

### GitHub Access (REQUIRED)
- Repo: strale (local)
- Main branch: main
- Feature branch pattern: type/kebab-description

### Project Spec
The original MVP spec files have been removed from this repo (archived to Notion).
For current build plan, priorities, and architecture, see Notion Project Home:
https://www.notion.so/31167c87-082c-81fb-96da-d3188d34aa72

### Tech Stack
- Runtime: Node.js + TypeScript
- Framework: Hono
- Database: PostgreSQL
- ORM: Drizzle
- Payments: Stripe Checkout (wallet top-ups only, no Connect)
- Hosting: Railway (US East / Virginia, project: desirable-serenity)
- Headless browser: Browserless.io (managed, NOT self-hosted Puppeteer)
- SDKs: TypeScript first, then Python

### Project Structure
```
strale/
├── apps/
│   └── api/                    # Hono API server
│       ├── src/
│       │   ├── routes/         # API route handlers
│       │   ├── capabilities/   # Capability executor functions
│       │   ├── db/             # Drizzle schema + queries + seed
│       │   ├── lib/            # Stripe, matching, auth, quality helpers
│       │   └── index.ts        # Entry point
│       ├── drizzle/            # Migration files (0001–0006+)
│       └── package.json
├── packages/
│   ├── mcp-server/             # strale-mcp (npm published)
│   ├── sdk-typescript/         # @strale/sdk (npm published)
│   ├── sdk-python/             # straleio (PyPI published)
│   ├── semantic-kernel-strale/ # strale-semantic-kernel (npm)
│   ├── langchain-strale/       # langchain-strale (PyPI published)
│   └── crewai-strale/          # crewai-strale (PyPI published)
├── package.json                # Monorepo root
└── CLAUDE.md
```

### Active Decisions

#### MVP Decisions (Feb 2026)
- DEC-1: Scope reduced to 4-week MVP proving developers will let agents buy capabilities
- DEC-2: Prepaid wallet via Stripe Checkout — internal ledger for micropayments, zero per-transaction cost
- DEC-3: No bidding/auction — fixed pricing, instant routing, keyword matching for 5 capabilities
- DEC-4: Founder is the only provider for first 3 months
- DEC-5: TypeScript backend (Hono + Drizzle + PostgreSQL)
- DEC-6: EU/Nordic data wedge — 5 seed capabilities
- DEC-7: Use Browserless.io instead of self-hosted Puppeteer (unanimous reviewer feedback)
- DEC-8: SELECT FOR UPDATE row-level locking on wallet debits (unanimous)
- DEC-9: Idempotency-Key header on POST /v1/do (unanimous)
- DEC-10: €2.00 trial credits on signup, no card required (unanimous)
- DEC-11: Rating endpoint removed from MVP (unanimous)
- DEC-12: screenshot-url and eu-address-validate dropped; replaced by vat-validate and annual-report-extract
- DEC-13: Invoice extraction price raised to €0.50
- DEC-14: Don't charge before execution succeeds — lock → execute → deduct on success
- DEC-15: Add capability_slug override to POST /v1/do
- DEC-16: Add dry_run mode to POST /v1/do
- DEC-17: Return wallet_balance_cents in /v1/do response
- DEC-18: Dashboard scope reduced to: register, API key, balance, top-up, transaction list
- DEC-19: Structured error responses with stable error_code enum
- DEC-20: Hash API keys in DB, store key_prefix for lookup
- DEC-21: Rate limiting: 10 req/sec per key + €100/hour spend cap
- DEC-22: Hybrid sync/async execution — sync for <5s, async+poll for longer capabilities
- DEC-23: TypeScript SDK ships before Python SDK
- DEC-20260225-P-c5d6: 6th table — failed_requests (id, user_id, task, category, max_price_cents, created_at) logs every no_matching_capability response
- DEC-20260225-P-m5n6: swedish-company-data accepts fuzzy natural-language input; cheap LLM call resolves to org number before registry lookup

---

#### Current Decisions (March 2026)
- DEC-20260302-A: Capability Pricing Framework (€0.02–€1.00 per call)
- DEC-20260302-B: Capability QA Framework (tiered scheduling: smoke/daily/weekly)
- DEC-20260302-C: Homepage leads with solutions and trust positioning
- DEC-20260303-D: Search input uses query completions, not result dropdown
- DEC-20260303-E: POST /v1/suggest uses Voyage AI embeddings + Claude Haiku re-ranking
- DEC-20260303-G: Homepage restructure: 11-section order
- DEC-20260305-A through G: Trust display centralization, test infrastructure, security hardening
- DEC-20260306-A through F: Test run audit log, metric consistency, capability detail audit
- DEC-20260307: SQS Constitution adopted as authoritative scoring spec; Notion Governance Protocol established

#### Current Decisions (April 2026)
- **DEC-20260428-A** (global, active): Third-party scraping doctrine — three-tier framework. Tier 1: Strale itself never operates scrapers (absolute). Tier 2: may consume vendor-scraped data when underlying data is public records by statute, vendor has documented redistribution rights + indemnification, vendor provides primary-source provenance per fact, and Strale discloses sourcing via `provenance.upstream_vendor` / `acquisition_method` / `primary_source_reference`. Tier 3: prefer licensed-bulk over scraping-derived when both are available at compatible economics. Anchored on Meta v. Bright Data (NDCal Jan 2024) and hiQ v. LinkedIn (settled Dec 2022, $500k judgment). Supersedes the implicit absolute no-scraping rule. Full doctrine: Notion Decisions DB (page id `35067c87-082c-810d-b6a4-edf9f14b4446`).
- **DEC-20260428-B** (global, active): Engineering bar for Strale-built data services (sanctions/PEP, UBO, adverse media, future registry self-builds). Codifies regulatory-grade requirements: versioned dataset with stale-data circuit breaker, source-list manifest per response, Merkle-rooted ingest, match explainability, confidence buckets, dispute endpoint with disposition tracking, replay capability, golden test suite, canary deploys, per-list kill switches, GDPR Art. 22 compliance, threat-model document and public methodology page mandatory before production. AI synthesis steps (e.g. risk-narrative-generate) must require per-flag source citation, "screening checks found" framing, and never assert facts not present in input. Pairs with DEC-20260428-A.

### Capabilities & Quality
<!-- Reminder: changes to capabilities, SDKs, or integrations require updating public/llms.txt in strale-frontend -->
290+ capabilities across 7 verticals (company-data, compliance, developer-tools, finance, data-processing, web-scraping, monitoring) plus 100+ bundled solutions across 6 categories. Full catalog: GET /v1/capabilities. Solutions: GET /v1/solutions. Counts grow frequently — check seed.ts and recent git log for exact current numbers.

**x402 Payment Gateway (March 2026):**
All capabilities and solutions available via x402 pay-per-use USDC payments on Base mainnet. No signup or API key needed — payment IS the auth. DB-driven: adding capabilities to x402 requires only `UPDATE capabilities SET x402_enabled = true`. Catalog: GET /x402/catalog. Discovery: GET /.well-known/x402.json. Wildcard handler: GET/POST /x402/:slug.

**New capabilities (March 2026):**
- `pep-check` — Dilisense consolidated PEP database (230+ territories, EU C/2023/724-aligned, RCAs included). Category: compliance. Price: €0.05. Transparency: algorithmic. Uses DILISENSE_API_KEY. (OpenSanctions previously primary with Dilisense fallback; OS dropped 2026-04-27 commit `16ca790` — single-vendor on Dilisense per DEC-20260429-A.)
- `adverse-media-check` — Dilisense Adverse Media (235k+ news sources, FATF-categorized) primary; Serper.dev (Google) fallback with deterministic keyword classification. No LLM. Category: compliance. Price: €0.20. Transparency: algorithmic. Uses DILISENSE_API_KEY (primary) + SERPER_API_KEY (fallback). Risk-level rule documented in output via `risk_level_thresholds`.
- `risk-narrative-generate` — AI synthesis of structured check results into plain-language risk narrative. Category: agent-tooling. Price: €0.05. Transparency: ai_generated. Uses ANTHROPIC_API_KEY.
- `au-company-data` — Australian Business Register (ABR) lookup by ABN. Category: company-data. Price: €0.05. Transparency: algorithmic. Uses ABN_LOOKUP_GUID.

**New solutions (March 2026):**
- KYB Essentials (×20 countries) — Quick company verification. 3-4 checks, €1.50. Slug: `kyb-essentials-{cc}`
- KYB Complete (×20 countries) — Full compliance check with risk narrative. 11-14 checks, €2.50. Slug: `kyb-complete-{cc}`
- Invoice Verify (×20 countries) — Invoice fraud detection with risk narrative. 12-14 checks, €2.50. Slug: `invoice-verify-{cc}`
- Countries: SE, NO, DK, FI, UK, DE, FR, NL, BE, AT, IE, ES, IT, CH, PL, PT, US, CA, AU, SG
- Deprecated: kyc-sweden, kyc-norway, kyc-denmark, kyc-finland, verify-us-company (isActive: false)

SQS engine live (dual-profile model): Quality Profile (QP) with 4 factors (correctness 50%, schema 31%, error handling 13%, edge cases 6%) excludes upstream failures. Reliability Profile (RP) with 4 factors (current availability, rolling success, upstream health, latency) includes upstream failures, type-specific weights. QP and RP letter grades (A-E) combine via 5×5 matrix into SQS (0-100). Legacy 5-factor model (40/25/20/10/5) retained for regression comparison only. Circuit breaker penalties (3 consecutive failures → −30, 5 correctness failures → −20, schema break → −15). Recovery: immediate after 3 consecutive passes (no time gate). Recency-weighted rolling 10-run window. Floor-aware solution SQS (lowest step + 20 cap), min_sqs quality gate on POST /v1/do, platform floor SQS 25. Tiered test scheduling (A: 6h = pure-computation, B: 24h = stable APIs, C: 72h = scraping). SQS < 50 triggers intensification to min(6h, tier). Fixture and canary test modes. Public quality endpoint: GET /v1/quality/:slug.

Free-tier: 5 capabilities (email-validate, dns-lookup, json-repair, url-to-markdown, iban-validate) require no auth/signup. IP-based daily rate limit (10/day, enforced via DB counter in do.ts using `rateLimitByIp`). Authenticated users calling free-tier capabilities get normal rate limits and no wallet debit.

Testing: test_suites table has `test_mode` column: `live` (calls real API), `fixture` (uses saved data, €0 external cost), `canary` (periodic live check at reduced frequency). `external_cost_cents` tracks estimated external API cost per test execution.

Stripe is LIVE in production (sk_live_ key on Railway). Local .env uses sk_test_ for development.

### Adding New Capabilities (MANDATORY PIPELINE)

**NEVER add capabilities by directly editing seed.ts.** The old seed.ts + onboarding hook approach only generates 2 of 5 required test types. All new capabilities MUST go through the manifest-driven pipeline.

#### Recommended workflow (--discover):

1. **Write the executor** at `apps/api/src/capabilities/{slug}.ts`
   - Register via `registerCapability(slug, handler)`
   - Handler returns `{ output, provenance: { source, fetched_at } }`
   - All external calls must have `AbortSignal.timeout()`
   - Errors must be structured, never raw HTML or stack traces

2. **Auto-registered** — executors are auto-imported at startup by `src/capabilities/auto-register.ts`. No manual import in `app.ts` needed.

3. **Create minimal manifest** at `manifests/{slug}.yaml`
   Required fields:
   - `slug`, `name`, `description`, `category`, `price_cents`
   - `data_source`, `data_source_type`, `transparency_tag`, `freshness_category`
   - `test_fixtures.health_check_input` — simple input that always works
   - `limitations` — at least 1 (every capability has limitations)
   **No need to write `expected_fields` or `output_field_reliability` — the pipeline generates them.**

4. **Run the pipeline with --discover:**
   `cd apps/api && npx tsx scripts/onboard.ts --discover --manifest ../../manifests/{slug}.yaml`
   The pipeline:
   - Executes the capability with health_check_input
   - Auto-generates expected_fields from the actual output
   - Auto-generates output_field_reliability (all fields marked guaranteed initially)
   - Writes the updated manifest back to disk
   - Generates all 5 test types (known_answer, schema_check, negative, edge_case, dependency_health)
   - Verifies the known_answer test passes against live output

5. **Review:** Check the auto-generated expected_fields in the manifest. Adjust reliability levels (guaranteed/common/rare) as needed.

6. **Verify:** `npx tsx scripts/smoke-test.ts --slug {slug}`

#### Pipeline flags:
```
--manifest <path>    Path to YAML manifest (required)
--dry-run            Preview without inserting to DB
--backfill           Update existing capability (add missing tests, update fixtures)
--discover           Auto-generate expected_fields from live execution output
--fix                Auto-correct high-confidence fixture mismatches (field name typos, case, type coercion)
--strict             Abort if execute-and-verify fails
```

Combine flags for existing capabilities: `--backfill --discover --fix`

#### For backfilling existing capabilities:
`cd apps/api && npx tsx scripts/onboard.ts --manifest ../../manifests/{slug}.yaml --backfill`
Skips capability creation, adds only missing test types, updates field reliability + limitations.

Use `--backfill --discover --fix` to auto-correct fixture mismatches on existing capabilities.

#### Field reliability rules:
- `guaranteed` — always present in successful responses. Safe to assert on.
- `common` — usually present, may be absent for some inputs. Type-checked only.
- `rare` — only present for specific inputs. Never asserted on.

Only `guaranteed` fields are used in known_answer test assertions. This prevents the "expected non-null on optional field" problem that broke 8 EU registries.

#### What the pipeline does NOT do (human must provide):
- The known_answer test input (a real entity you've verified works)
- Field reliability annotations (which fields are truly guaranteed)
- Limitations (honest assessment of coverage gaps)
- The executor code itself

Everything else is auto-generated. This is how the platform scales to third-party providers.

#### Quick reference — manifest template:
```yaml
slug: "example-capability"
name: "Example Capability"
description: "What it does (50-160 chars for SEO)"
category: "validation"
price_cents: 5
data_source: "Example API"
data_source_type: "api"  # api | scrape | computed | reference
transparency_tag: "algorithmic"  # algorithmic | ai_generated | mixed
freshness_category: "live-fetch"  # live-fetch | reference-data | computed

test_fixtures:
  known_answer:
    input:
      field_name: "real_value"
    expected_fields:
      - { field: "output_field", operator: "not_null", reliability: "guaranteed" }
  health_check_input:
    field_name: "real_value"

output_field_reliability:
  output_field: "guaranteed"
  optional_field: "common"
  rare_field: "rare"

limitations:
  - title: "Coverage limitation"
    text: "Description of the limitation"
    category: "coverage"
    severity: "info"
```

### Scoring Integrity

NEVER modify SQS scoring logic (`sqs.ts`, `EXTERNAL_SERVICE_PATTERNS`, `isExternalServiceFailure`, `computeFromRows`) to fix a specific capability's score. If a capability scores poorly:

1. First: diagnose the ROOT CAUSE (missing credential? bad fixture? real bug?)
2. Fix the root cause (configure the key, fix the fixture, fix the code)
3. The score will improve naturally on the next test run

Adding exclusion patterns to make a score look better is PROHIBITED. The SQS must always reflect the user's actual experience.

See: Scoring Integrity Rules comment block in `apps/api/src/lib/sqs.ts`
See: SQS Constitution in Notion
See also: Capability Onboarding Protocol (DEC-20260320-B) — the equivalent enforcement rule for capability onboarding.

### Test Infrastructure Cost Principles (always enforce)

**Principle A — Zero-cost health probes:** Health probes in `dependency-manifest.ts` must
never consume billable API calls. Use `skipAuth: true` on the health probe for paid APIs
so the probe sends no auth header — a 401 proves connectivity without consuming quota.
Probes run ~4×/day per provider; authenticated probes waste 120+ API calls/month.

**Principle B — Input validation before paid APIs:** Every capability that calls a paid
external API must validate input and throw an error for empty, null, or sub-2-character
input BEFORE making the API call. This protects both test budget and customer-traffic budget.

**Principle C — Piggyback suites never scheduled:** Piggyback test suites (`test_type = 'piggyback'`)
receive data exclusively from real customer traffic via `recordPiggybackResult()`. The test
scheduler excludes them from all runs (test-runner.ts line 117). They are never executed proactively.

### Distribution PR Integrity Protocol (DEC-20260422-A)

**MANDATORY — applies to ANY session that touches a PR on a repo outside `strale-io/*` OR that publishes / modifies a `*-strale` package.**

**Trigger:** the session prompt mentions a PR on a framework repo (Pipedream, LangFlow, Flowise, pydantic-ai, langchain, crewAI, agno, composio, semantic-kernel, awesome-list, etc.), OR modifies files under `packages/*-strale/`, OR edits PyPI/npm publication metadata.

**Background:** on 2026-04-21 the pydantic-ai maintainer DouweM closed `pydantic/pydantic-ai#4866` with "Shame on you" after finding that the published `pydantic-ai-strale` package contained zero pydantic-ai-specific code. An audit found two more packages with the same gap (`google-adk-strale`, `openai-agents-strale`). A prior agent session (2026-04-18) had edited the PR to trim promotional prose but did not verify the code example's imports. See `CONTAINMENT_REPORT.md` for the full incident.

**Required steps (non-negotiable):**

1. **Verify every imported symbol before touching a distribution PR.** Before editing the PR body, inline comments, code examples, or any description-style text on a repo outside `strale-io/*`, fetch the referenced Strale package's `__init__.py` / entry point via `gh api repos/strale-io/strale/contents/packages/<pkg>/...` and grep for every symbol the PR imports. If any symbol is not in `__all__` or not exported, **STOP** and flag for Petter. Do not trim prose, do not fix bot findings, do not rebase, do not reply — nothing — while the PR contains a fabricated import.

2. **Run the distribution PR pre-flight checklist.** See `DISTRIBUTION_PR_PREFLIGHT.md`. The four verifications (imports resolve, package on approved list, description matches code, tone matches neighbors) are the standard. All four must pass before the session opens or edits a distribution PR.

3. **Run the framework-package integrity check locally before shipping a new or modified `*-strale` package:**
   ```
   node apps/api/scripts/check-framework-packages.mjs
   ```
   If the check fails, the package does not match its name. Either make the package live up to the name, rename it, or deprecate — do not publish.

4. **Never batch-create framework packages.** One framework package per PR, each including (a) real framework-interface code importing from the framework, (b) at least one test exercising the framework's own primitives, (c) README content that only references what's in the module.

5. **Polishing is not a substitute for verification.** A cleaner-looking PR containing a fabricated import is worse than the original. If a bot finding points at prose but the code example has an import problem underneath, fix the import first and the prose second, or stop and flag.

**At session end, report:**
- Every distribution PR touched, with the verification result for each.
- Every `*-strale` package modified, with the check-framework-packages output.
- Anything that couldn't be verified and why.

**Do NOT mark a distribution task as done if the pre-flight checklist didn't pass.** Report what's missing.

**This rule does NOT override:**
- The Scoring Integrity Protocol (never modify SQS scoring to fix a specific capability's score).
- The Capability Onboarding Protocol (DEC-20260320-B).
- Any PR-closure or code-change authorization that requires explicit Petter approval.

### Capability Onboarding Protocol (DEC-20260320-B)

**MANDATORY — applies to ANY session that creates, modifies, or onboards a capability.**

**Trigger:** Claude Code detects that the session involves any of: new executor file in `src/capabilities/`, new or modified DB row in `capabilities` table, new capability slug, manifest file, seed entry, or the prompt mentions adding/creating a capability.

**Rule:** The Capability Onboarding Pipeline spec is the authority on HOW capabilities enter the system. The prompt describes WHAT to build. These are separate concerns. A prompt that says "add pep-check capability" without mentioning manifests, field reliability, or validation does NOT mean those steps are optional.

**Required steps (non-negotiable):**

1. **Read the spec first.** Before writing any code, read the Capability Onboarding Pipeline design spec. If Notion is accessible, fetch page `32467c87-082c-819a-a731-d8a5f7237b33`. If not, the key requirements are listed below.
2. **Create/update onboarding manifest** (YAML file in repo) with: slug, name, description, category, schemas, pricing, data_source, transparency_tag, test_fixtures (known_answer + health_check_input), output_field_reliability for ALL output fields, and at least 1 limitation.
3. **Declare output_field_reliability** for every output field: `guaranteed` (always present), `common` (usually present), or `rare` (sometimes present). Only `guaranteed` fields get `not_null` test assertions.
4. **Set avg_latency_ms** — measure from test execution or estimate from transparency_tag (algorithmic=20ms, ai_generated=3000ms, mixed=2000ms, external API=check similar capabilities).
5. **Run structural validation**: `npx tsx scripts/validate-capability.ts --slug <slug>`
6. **Run readiness check**: Verify `checkReadiness(slug)` returns `ready: true` with zero issues.
7. **Run smoke test** (if available): `npx tsx scripts/smoke-test.ts --slug <slug>`

**At session end, report:**
- Readiness check result (pass/fail + any issues)
- Steps completed that the prompt didn't mention
- Steps that couldn't be completed and why

**Do NOT mark a capability task as done if the readiness check fails.** Report what's missing.

**This rule does NOT override:**
- The prompt's specification of what the capability does (slug, schemas, pricing, implementation logic)
- The Scoring Integrity Protocol (never modify SQS scoring logic)
- The DEACTIVATED list in `src/capabilities/auto-register.ts`

### Quick Session Checklist
1. Declare session intent
2. Connectivity check (Git + handoff; Notion if needed). Log failures.
3. Read handoff/from-chat/ for pending items (if empty, proceed)
4. Do the work
5. Move completed To-do items to Archive > Completed To-dos (page ID: 34067c87-082c-814e-a45c-fa8d851c8f12)
6. Write handoff file to `handoff/_general/from-code/`. Even one-liner, starts with Intent:
7. Create Journal entry in Notion (even one line)

### Full Session Checklist
1. Declare session intent
2. Run full Pre-Build Connectivity Checklist. Log failures.
3. Read Project Home → current focus
4. Read last 5 relevant Journal entries filtered by feature
5. Read active Decisions — global always, feature-scope when relevant
6. Read handoff/from-chat/ for pending specs or feedback
7. Do the work
8. Move completed To-do items to Archive > Completed To-dos (page ID: 34067c87-082c-814e-a45c-fa8d851c8f12)
9. Create Journal entry (full format)
10. Log decisions made (respect authority thresholds)
11. Save session summary to `handoff/_general/from-code/`
12. Contradiction check if decisions were made

### Workflow Invariants (Non-Negotiable)
- NEVER edit Journal entries, Decision content, or Deferred content
- NEVER delete anything in Notion
- Corrections → new Journal entry, type = course-correction
- Global decisions → ALWAYS get confirmation
- Supersessions → ALWAYS use Contradiction Protocol (including CLAUDE.md update)

**Conflict duty:** If the human's request would contradict an active Decision, state the conflict before proceeding. Quote the specific Decision being violated and ask the human to confirm, supersede, or revise.

### Degraded Mode
If Notion unavailable: work continues, log to handoff files with [BACKFILL] prefix.
If Git unavailable: STOP. Fix before proceeding.

## Cross-Repo Updates

When making changes to the backend repo, check if these files in the frontend repo (strale-frontend) need updating:

- **public/llms.txt** — Update when: adding/removing/renaming capability categories, adding new SDKs or integrations, changing API endpoints or auth flow, changing pricing model. This file is what LLMs read when someone shares strale.dev — it must stay accurate.
- **public/sitemap.xml** — Regenerate when: adding new pages or routes. Run: `npx tsx scripts/generate-sitemap.ts` in strale-frontend.
- **src/lib/compliance-types.ts `AuditRecord` interface** — Update when: any change to `AuditRecord` in `apps/api/src/routes/audit.ts`. The two declarations must match shape (field names + types). The CI check at `apps/api/scripts/check-audit-record-shape.mjs` enforces this and runs in the weekly drift cron with both repos checked out. If you add/remove/rename a field on the backend without updating the frontend, the check fails and an issue is auto-opened.

### Drift-prevention surfaces

When changing facts that appear on multiple surfaces (capability count, country count, retention period, vendor names, free-tier list, processing region), update **only** the canonical source and let consumers read from it:

- **Backend canonical source**: `apps/api/src/lib/platform-facts.ts` — `STATIC_FACTS` for fixed values, `computePlatformFacts()` for live-DB values. Exposed via `GET /v1/platform/facts` (cached 5 min).
- **Frontend consumer**: `usePlatformFacts()` hook in `strale-frontend/src/hooks/use-platform-facts.ts`. Component pages read from this; never hardcode the displayed value.
- **Static frontend files** that can't reach the hook (`public/llms.txt`, `public/.well-known/*.json`): use phrasing that doesn't bake in counts, with a pointer to `/v1/platform/facts`.

The `apps/api/scripts/check-platform-facts-drift.mjs` CI guard catches new hardcoded values introduced into surface files. The weekly cron runs the same sweep across both repos and opens a tracking issue on any drift.

For vendor switches specifically, invoke the `vendor-switch` skill (in `.claude/skills/vendor-switch/SKILL.md`) — it codifies the full surface-update + DEC-entry checklist.
