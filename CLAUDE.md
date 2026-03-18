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
- Roadmap (SINGLE task list): https://www.notion.so/31c67c87-082c-819c-a238-c0ae01957a69
- Decisions DB: 5e1a81ee-7b9f-4d3c-b58d-c8d97ae6386c
- Notion Governance Protocol: https://www.notion.so/31c67c87-082c-8173-9ca7-dcbe054f940e

### Notion Governance Rules (enforced)
- ONE canonical page per topic — never create v2, update existing
- Research pages go directly to Research Archive, not Project Home
- Roadmap is THE ONLY task list — no priorities in other pages
- Handoffs archived after absorbed into Roadmap
- Superseded pages archived same session
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
- Hosting: Railway (EU region)
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

### Capabilities & Quality
<!-- Reminder: changes to capabilities, SDKs, or integrations require updating public/llms.txt in strale-frontend -->
243+ capabilities across 7 verticals (company-data, compliance, developer-tools, finance, data-processing, web-scraping, monitoring) plus 20 bundled solutions across 6 categories (including 5 US-first solutions shipped 2026-03-07). Full catalog: GET /v1/capabilities. Solutions: GET /v1/solutions.

SQS engine live (Constitution v1): 5-factor scoring (correctness 40%, schema 25%, availability 20%, error handling 10%, edge cases 5%), recency-weighted rolling 10-run window, missing-factor re-weighting, circuit breaker score penalties (3 consecutive failures → −30, 5 correctness failures → −20, schema break → −15), trend computation (improving/stable/declining), floor-aware solution SQS (lowest step + 20 cap), min_sqs quality gate on POST /v1/do, platform floor SQS 25. 1215 auto-generated test suites (all 233 capabilities × 5 test types) with tiered scheduling (A: 6h, B: 24h, C: 72h). Public quality endpoint: GET /v1/quality/:slug.

Free-tier: 5 capabilities (email-validate, dns-lookup, json-repair, url-to-markdown, iban-validate) require no auth/signup. IP-based daily rate limit (10/day). Authenticated users calling free-tier capabilities get normal rate limits and no wallet debit.

Stripe is in SANDBOX mode — live key activation pending.

### Adding New Capabilities (MANDATORY PIPELINE)

**NEVER add capabilities by directly editing seed.ts.** The old seed.ts + onboarding hook approach only generates 2 of 5 required test types. All new capabilities MUST go through the manifest-driven pipeline.

#### Recommended workflow (--discover):

1. **Write the executor** at `apps/api/src/capabilities/{slug}.ts`
   - Register via `registerCapability(slug, handler)`
   - Handler returns `{ output, provenance: { source, fetched_at } }`
   - All external calls must have `AbortSignal.timeout()`
   - Errors must be structured, never raw HTML or stack traces

2. **Add import** to `apps/api/src/app.ts` in the correct category section

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

### Quick Session Checklist
1. Declare session intent
2. Connectivity check (Git + handoff; Notion if needed). Log failures.
3. Read handoff/from-chat/ for pending items (if empty, proceed)
4. Do the work
5. Write handoff file to `handoff/_general/from-code/`. Even one-liner, starts with Intent:
6. Create Journal entry in Notion (even one line)

### Full Session Checklist
1. Declare session intent
2. Run full Pre-Build Connectivity Checklist. Log failures.
3. Read Project Home → current focus
4. Read last 5 relevant Journal entries filtered by feature
5. Read active Decisions — global always, feature-scope when relevant
6. Read handoff/from-chat/ for pending specs or feedback
7. Do the work
8. Create Journal entry (full format)
9. Log decisions made (respect authority thresholds)
10. Save session summary to `handoff/_general/from-code/`
11. Contradiction check if decisions were made

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
