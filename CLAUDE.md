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
- Decisions DB: 5e1a81ee-7b9f-4d3c-b58d-c8d97ae6386c

### GitHub Access (REQUIRED)
- Repo: strale (local)
- Main branch: main
- Feature branch pattern: type/kebab-description

### Project Spec Files (Source of Truth)
- `strale-project-spec.md` — Full project specification
- `strale-review-synthesis.md` — External review decisions and revised contracts
- `strale-build-spec.md` — 4-week build plan with schema and endpoints

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
│   ├── api/                    # Hono API server
│   │   ├── src/
│   │   │   ├── routes/         # API route handlers
│   │   │   ├── capabilities/   # Capability executor functions
│   │   │   ├── db/             # Drizzle schema + queries
│   │   │   ├── lib/            # Stripe, matching, auth helpers
│   │   │   └── index.ts        # Entry point
│   │   └── package.json
│   └── dashboard/              # Minimal React frontend (week 3-4)
│       ├── src/
│       └── package.json
├── packages/
│   └── sdk-python/             # Python SDK
├── package.json                # Monorepo root
└── CLAUDE.md
```

### Active Decisions

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

### Revised Seed Capabilities
| # | Capability | Slug | Price |
|---|---|---|---|
| 1 | Swedish company data | swedish-company-data | €0.80 |
| 2 | Invoice/receipt → structured JSON | invoice-extract | €0.50 |
| 3 | Web page → structured data (JS rendering) | web-extract | €0.15 |
| 4 | EU VAT validation + VIES enrichment | vat-validate | €0.10 |
| 5 | Swedish annual report extraction | annual-report-extract | €1.00 |

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
