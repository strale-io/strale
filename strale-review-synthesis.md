# Strale MVP — Review Synthesis

Three external reviews (Gemini, ChatGPT, Claude) of the 4-week build spec. This document captures where all three agree, where they disagree, and the resulting decisions.

---

## Unanimous (All 3 Agree)

These items had identical feedback from all reviewers. Treat as mandatory changes.

### 1. Puppeteer Will Kill You
All three flagged self-hosted Puppeteer as the #1 technical risk. Memory leaks, zombie Chrome processes, container crashes, cold starts. AI coding tools can't debug these at 3 AM.

**Gemini:** "Do not host Puppeteer yourself. Use Browserless.io or Firecrawl."
**ChatGPT:** "Running headless Chrome reliably is where MVPs go to die."
**Claude:** "Use a managed browser service like Browserless.io or Browserbase."

**Decision:** Use Browserless.io (or similar managed browser API) instead of self-hosted Puppeteer. Turns an infrastructure problem into an API call. Slightly lower margins, dramatically higher reliability.

### 2. Wallet Race Condition — Row-Level Locking
All three identified the same critical bug: concurrent `POST /v1/do` requests can overdraw a wallet if you don't use `SELECT ... FOR UPDATE` or atomic updates.

**Decision:** Use `SELECT ... FOR UPDATE` inside a database transaction for every wallet debit. This is the single most important correctness requirement.

### 3. Idempotency Key on POST /v1/do
All three said: agents retry on network timeouts. Without an idempotency key, you double-charge and double-execute.

**Decision:** Add optional `Idempotency-Key` header. If the same key is submitted twice, return the result of the first execution without re-executing or re-charging.

### 4. Trial Credits — Non-Negotiable
All three said API key + SDK install + wallet top-up is too much friction. Nobody pulls out a credit card to evaluate an unknown tool.

**Gemini:** "Seed new accounts with €2.00 in free credits."
**ChatGPT:** "Trial credits are mandatory."
**Claude:** "€2 free, no card required. Non-negotiable for developer adoption."

**Decision:** €2.00 free credits on signup. No credit card required for trial. This is marketing budget, not lost revenue. Costs nothing since we're the provider.

### 5. Kill the Rating Endpoint
All three said: you're the only provider, who are you rating? Waste of dev time.

**Decision:** Remove `POST /v1/transactions/:id/rate` from MVP. Add when external providers join.

### 6. Screenshot Capability Is Weak
All three questioned `screenshot-url` at €0.05.

**Gemini:** "Will immediately hit CAPTCHAs and anti-bot protections."
**ChatGPT:** "I'd raise it or drop it from MVP."
**Claude:** "Screenshotone.com, Urlbox already do this cheaper. Competing on commodity."

**Decision:** Drop `screenshot-url` from the seed 5. Replace it (see Disagreements section).

### 7. Rate Limiting Is Mandatory
All three said: a compromised API key can drain a wallet in seconds without rate limiting.

**Decision:** Add rate limiting on `POST /v1/do` (max 10 req/sec per key) and a global per-request price cap (€20 max).

### 8. Stripe Webhook Idempotency
All three flagged: Stripe retries webhooks. Without a uniqueness check on `stripe_session_id`, you double-credit wallets.

**Decision:** Add unique constraint on `wallet_transactions.stripe_session_id`. Check-before-credit in webhook handler.

---

## Strong Majority (2 of 3 Agree)

### 9. Don't Charge Before Execution Succeeds
**ChatGPT:** "Reserve → execute → finalize. Avoids messy refunds."
**Claude:** "Don't charge until after successful execution. Simpler."
**Gemini:** Didn't address execution order specifically, but said to handle "charge then execution fails."

**Decision:** Check balance ≥ price → reserve (row lock held) → execute → if success, deduct → if failure, release lock, no charge. Eliminates refund-on-failure path entirely.

### 10. Add `capability_slug` Override
**ChatGPT:** "Support explicit structured inputs from day 1."
**Claude:** "If a developer knows which capability they want, let them specify it directly."
**Gemini:** Didn't mention explicitly.

**Decision:** Add optional `capability_slug` field to `POST /v1/do`. If provided, skip matching and hit that capability directly. Power users will prefer this.

### 11. Add `dry_run` Mode
**ChatGPT:** "Huge for evaluation friction."
**Claude:** Not mentioned explicitly but recommended making evaluation frictionless.
**Gemini:** Didn't mention.

**Decision:** Add optional `dry_run: true` to `POST /v1/do`. Returns what it would execute and the price, without charging or executing. Low-cost to implement, high value for developer evaluation.

### 12. Return `balance_after` in Response
**ChatGPT:** "Add `balance_cents_after`."
**Claude:** "Developers will want to know remaining balance without a second API call."
**Gemini:** Didn't mention.

**Decision:** Add `wallet_balance_cents` to the `/v1/do` success response.

### 13. EU Address Validation Is Weak
**ChatGPT:** "Google Address Validation is $0.005/request. Nominatim is free. You're 20x more expensive."
**Claude:** "Depends on geocoding vendor; may feel commodity."
**Gemini:** Didn't specifically critique it, but said to go deeper on EU/Nordic data.

**Decision:** Drop `eu-address-validate`. Replace it (see below).

### 14. Kill or Reduce Dashboard Scope
**ChatGPT:** "Reduce dashboard scope."
**Claude:** "Kill the dashboard entirely. Developers evaluate APIs through code."
**Gemini:** Didn't comment on dashboard.

**Decision:** Dramatically reduce dashboard. Week 3-4 delivers: registration page, API key display, balance + top-up button, transaction list. No capabilities browser, no complex UI. Possibly skip React entirely and use a simple server-rendered page.

### 15. Better Error Responses
**ChatGPT:** "Add stable error_code enum, attempted_capability_slugs for debugging."
**Claude:** "Every error should include what went wrong, why, and what to do. Include balance, required amount, top-up URL."
**Gemini:** Didn't specifically address error format.

**Decision:** Error responses include: `error_code` (stable enum), `message` (human-readable), `details` (contextual data like balance, required amount, attempted matches). This is where developer trust is built.

### 16. `input_schema` / `output_schema` in DB Is Overkill
**ChatGPT:** "These schemas live in your TypeScript code. Skip the DB columns."
**Claude:** "Keep output_schema as a hint but don't pretend it's real enforcement."
**Gemini:** Didn't directly critique, but said not to over-engineer matching.

**Decision:** Keep `output_schema` in the capabilities table (useful for documentation/API responses) but don't build schema validation or compatibility matching. It's metadata, not enforcement.

---

## Disagreements Between Reviewers

### A. Charge-Before vs Charge-After Execution
**ChatGPT:** Reserve → execute → finalize (reserve/capture pattern, more complex)
**Claude:** Don't charge until after success (simpler, just hold the lock)
**Gemini:** Implied immediate charge with refund on failure

**Our call:** Claude's approach — hold the row lock, execute, deduct only on success. Simplest implementation. If the lock is held for too long (10+ seconds on Puppeteer jobs), this could block concurrent requests. Mitigate by keeping the lock scope tight: check balance → lock → execute → deduct → release. If execution is long, consider the async pattern instead.

### B. Async Execution Pattern
**Claude:** "Build async from the start. Return `{transaction_id, status: executing}` immediately, let clients poll."
**ChatGPT:** Mentioned long-running capabilities need webhook/callback support.
**Gemini:** Didn't address.

**Our call:** Start synchronous for capabilities under 5 seconds (address validation, etc.). For capabilities that might take 10+ seconds (web scraping, invoice extraction), return immediately with `status: executing` and let clients poll `GET /v1/transactions/:id`. This is a pragmatic hybrid — don't force everything async, but don't hold HTTP connections for 15 seconds either.

### C. TypeScript SDK vs Python SDK First
**Claude:** "Ship TS SDK before Python. MCP developers use TypeScript."
**ChatGPT:** Mentioned TS SDK but didn't prioritize.
**Gemini:** Didn't address SDK language priority.

**Our call:** Ship both, but TS first if forced to choose. The API is TypeScript, MCP ecosystem is TypeScript, early adopters are MCP developers. Python SDK follows immediately.

### D. What to Replace Dropped Capabilities With
**Gemini:** EU VAT validation + VIES lookup; bank statement normalization
**ChatGPT:** Swedish annual report PDF extraction; EU VAT validation with enrichment; Swedish UBO lookup
**Claude:** Company registry beyond Sweden (Norway, Denmark); VAT/VIES validation

**Our call:** Replace the two dropped capabilities (screenshot, EU address) with:
- **EU VAT validation + VIES enrichment** (all three mentioned this — reliable, B2B useful, free VIES API is unreliable/rate-limited, real value in a reliable wrapper)
- **Swedish annual report extraction** (Claude suggested this — combines scraping + PDF + LLM extraction, uniquely hard, high value)

### E. Invoice Extraction Pricing
**Claude:** "€0.30 is low — companies pay €1-5 per invoice. Charge €0.50-1.00."
**Gemini:** Didn't critique pricing.
**ChatGPT:** Didn't critique pricing.

**Our call:** Raise invoice extraction to €0.50. Claude is right — this is genuinely valuable and €0.30 underprices it.

### F. Take Rate
**Gemini:** 20%
**ChatGPT:** 15%, ratchet down for volume
**Claude:** 20%, start high, lower to attract

**Our call:** 20% when external providers join. Irrelevant for MVP (we keep 100%). Easier to lower than raise.

### G. `provenance` Field
**Claude:** "Nice but not necessary. Cut it or simplify to a string."
**ChatGPT:** Didn't critique.
**Gemini:** Didn't critique.

**Our call:** Keep it, but simplify. Each capability returns a simple `{source: "allabolag.se", fetched_at: "..."}` object. No complex provenance graph. Costs almost nothing to include and is genuinely useful for debugging.

---

## Revised Seed Capabilities (Post-Review)

| # | Capability | Slug | Price | Change |
|---|---|---|---|---|
| 1 | Swedish company data | `swedish-company-data` | €0.80 | **Unchanged** — unanimous approval |
| 2 | Invoice/receipt → structured JSON | `invoice-extract` | €0.50 | **Price raised** from €0.30 |
| 3 | Web page → structured data (JS rendering) | `web-extract` | €0.15 | **Kept with caveat** — document "static/unprotected pages" limitation |
| 4 | EU VAT validation + VIES enrichment | `vat-validate` | €0.10 | **NEW** — replaces screenshot-url |
| 5 | Swedish annual report extraction | `annual-report-extract` | €1.00 | **NEW** — replaces eu-address-validate |

---

## Revised API Contract: POST /v1/do

**Request:**
```json
{
  "task": "Extract company data for Swedish org 559106-8089",
  "capability_slug": "swedish-company-data",
  "inputs": { "org_number": "559106-8089" },
  "max_price_cents": 200,
  "timeout_seconds": 30,
  "dry_run": false
}
```

Fields:
- `task` (string, optional if `capability_slug` provided) — natural language description
- `capability_slug` (string, optional) — force a specific capability, skip matching
- `inputs` (object, optional) — structured inputs passed directly to the capability executor
- `max_price_cents` (integer, required) — maximum willingness to pay
- `timeout_seconds` (integer, optional, default 30, server-capped at 60) — max wait time
- `dry_run` (boolean, optional, default false) — if true, returns what would execute + price without charging

Header:
- `Idempotency-Key` (string, optional) — prevents double-execution on retries

**Response (success):**
```json
{
  "transaction_id": "txn_abc123",
  "status": "completed",
  "capability_used": "swedish-company-data",
  "price_cents": 80,
  "latency_ms": 2340,
  "wallet_balance_cents": 4120,
  "output": {
    "revenue_sek": 282000000,
    "employees": 16
  },
  "provenance": {
    "source": "allabolag.se",
    "fetched_at": "2026-02-25T10:32:15Z"
  }
}
```

**Response (executing — for long-running capabilities):**
```json
{
  "transaction_id": "txn_abc123",
  "status": "executing",
  "capability_used": "annual-report-extract",
  "price_cents": 100,
  "poll_url": "/v1/transactions/txn_abc123",
  "estimated_seconds": 15
}
```

**Response (error):**
```json
{
  "error_code": "insufficient_balance",
  "message": "Your wallet has €0.45 but this capability costs €0.80.",
  "details": {
    "wallet_balance_cents": 45,
    "required_cents": 80,
    "topup_url": "https://app.strale.dev/topup"
  }
}
```

Error codes (stable enum): `insufficient_balance`, `no_matching_capability`, `capability_unavailable`, `execution_failed`, `timeout_exceeded`, `invalid_request`, `rate_limited`

**Response (dry run):**
```json
{
  "dry_run": true,
  "would_execute": "swedish-company-data",
  "price_cents": 80,
  "wallet_balance_cents": 4200,
  "wallet_sufficient": true
}
```

---

## Revised Database Changes

1. Add `idempotency_key VARCHAR(255)` to `transactions` table (with unique constraint)
2. Add unique constraint on `wallet_transactions.stripe_session_id`
3. Keep `output_schema` on `capabilities` but treat as documentation only, not enforcement
4. Hash API keys in DB, store a `key_prefix` (first 8 chars) for lookup
5. Add `max_spend_per_hour_cents` to `users` table (default €10000 = €100)

---

## Revised Week-by-Week

### Week 1-2: Core API + Wallet + 2 Capabilities
- Database schema with all corrections above
- `POST /v1/do` with idempotency, capability_slug, dry_run, proper error codes
- Wallet with row-level locking, Stripe Checkout, webhook idempotency
- Rate limiting (10 req/sec per key)
- 2 capabilities working: `swedish-company-data` + `vat-validate` (simplest two)
- Trial credits (€2.00 on signup)
- Health check endpoint

### Week 3-4: Remaining Capabilities + SDK + Minimal Dashboard
- 3 more capabilities: `invoice-extract`, `web-extract`, `annual-report-extract`
- Async execution for long-running capabilities (return immediately, poll for result)
- TypeScript SDK (priority) + Python SDK
- Minimal dashboard: register, API key, balance, top-up, transaction list
- Documentation (README + API docs + error code reference)
- Deploy, get first external developer using it

---

## Summary of Changes from Original Spec

| Category | Original | Revised |
|---|---|---|
| Puppeteer | Self-hosted on Railway | Managed service (Browserless.io) |
| Wallet debit | Implicit (charge then refund on fail) | Lock → execute → deduct only on success |
| Idempotency | Not present | Required on /v1/do + Stripe webhooks |
| Trial credits | None (€10 minimum top-up) | €2.00 free on signup, no card required |
| Rating endpoint | In MVP | Cut from MVP |
| Screenshot capability | In MVP (€0.05) | Cut — replaced by EU VAT validation |
| EU address validation | In MVP (€0.10) | Cut — replaced by Swedish annual report extraction |
| Invoice extraction price | €0.30 | €0.50 |
| API response | Basic | Includes wallet_balance_cents, stable error_code enum, detailed error context |
| POST /v1/do request | task + max_price only | + capability_slug, inputs, dry_run, Idempotency-Key header |
| Dashboard | Full React app (6 pages) | Minimal (register, key, balance, top-up, transactions) |
| SDK priority | Python first | TypeScript first, Python follows |
| Long-running tasks | Synchronous only | Hybrid: sync for fast, async+poll for slow |
| Rate limiting | Not present | 10 req/sec per key + €100/hour spend cap |
| API key storage | Plaintext in users table | Hashed, with key_prefix for lookup |
| Error responses | Basic message string | Structured: error_code + message + details object |
