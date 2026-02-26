# Strale — Project Specification

## Document Purpose

This document describes what Strale is, the strategic decisions made so far, and the specific 4-week MVP we're about to build. It incorporates feedback from two prior external reviews (ChatGPT and Gemini) that reshaped the scope significantly. This is not a pitch — it's the actual working spec.

---

## 1. What Strale Is

Strale is a commercial API that lets AI agents buy capabilities they're missing at runtime.

When an AI agent encounters a task it can't handle — extracting data from a Swedish business registry, rendering a screenshot of a URL, understanding an invoice — it calls `strale.do()` with a task description and a budget. Strale matches the request to a capability, executes it, charges the developer's prepaid wallet, and returns structured results. The agent continues its work.

The developer experience:

```python
from strale import Strale

s = Strale(api_key="sk_...")

# The core pattern — buy a capability your agent doesn't have
result = await s.do(
    "Extract company data for Swedish org 559106-8089",
    max_price=2.00
)
print(result.output)
# {"revenue_sek": 282000000, "employees": 16, "profit_sek": 11280000}

# The fallback pattern — only buy when your own code fails
try:
    data = my_agent.extract_data(url)
except Exception:
    data = await s.do(f"Extract structured data from {url}", max_price=1.00)
```

The second pattern — `strale.do()` as an `except` clause — is the primary wedge. It positions Strale as a safety net for agents, not a destination.

---

## 2. The Long-Term Vision

The end state is an open marketplace where any AI agent can buy or sell capabilities to other agents. A full commerce protocol:

```
DISCOVER → REQUEST → BID → ACCEPT → DELIVER → VERIFY → SETTLE → RATE
```

With reputation scoring, sub-contracting chains, task decomposition, dual-execution verification, capability bounties, orchestration recipes, and an open protocol specification. Model-agnostic. The "commerce infrastructure for the agent economy."

**This is NOT what we're building first.** The vision document exists and is preserved, but the full spec was reviewed externally and the feedback was unanimous: building this as v1 would fail.

---

## 3. What External Review Told Us

We submitted the full vision to ChatGPT and Gemini for brutal critique. Both independently identified the same fatal flaws:

### 3.1 Scope Will Kill You

The full spec described 8 companies simultaneously: marketplace, payments, protocol, reputation engine, data intelligence (Strale Index), compliance automation, orchestration platform, and framework integrations. For a non-technical solo founder using AI coding tools, this is impossible in any timeframe.

### 3.2 Micropayment Economics Are Structurally Broken

At Strale's target transaction size (€0.50–2.00), per-transaction payment processing via Stripe destroys the business model:

| Transaction | Stripe Fee (EU) | Fee as % of Gross | Strale's 5% Take | Net to Strale |
|---|---|---|---|---|
| €0.50 | €0.26 | 52% | €0.025 | -€0.235 |
| €1.00 | €0.27 | 27% | €0.05 | -€0.22 |
| €2.00 | €0.28 | 14% | €0.10 | -€0.18 |
| €5.00 | €0.33 | 6.5% | €0.25 | -€0.08 |
| €10.00 | €0.40 | 4% | €0.50 | +€0.10 |

Strale loses money on every transaction below €10. The original plan (Stripe Connect with per-transaction settlement) is not viable.

### 3.3 Core Assumption Is Unproven

"Developers will let their agents autonomously spend money to resolve capability gaps" — this has not been validated. No existing products demonstrate this behavior at scale. Agent frameworks (LangChain, CrewAI) don't have native purchasing patterns. The developer communities haven't been asked.

### 3.4 Bidding Breaks Agent UX

The 8-step lifecycle (DISCOVER → REQUEST → BID → ACCEPT → ...) introduces 15-30 seconds of latency for what should be a sub-second operation. Agents need instant resolution, not auction mechanics.

### 3.5 What Both Reviews Agreed Works

- `strale.do()` as a fallback/safety net is a genuinely strong wedge
- Strale as the largest buyer (generating demand for providers) is the only reliable way to guarantee Day 1 liquidity
- EU/Nordic data focus is underserved by Silicon Valley AI companies
- Fixed pricing + instant routing is the right model for MVP

---

## 4. Strategic Decisions Made

Based on external review, the following decisions were locked:

### DEC-1: Scope Reduction
Build a 4-week MVP proving one thing: developers will let their agents buy capabilities. Everything else deferred.

### DEC-2: Payment Architecture — Prepaid Wallet
**Problem:** Per-transaction Stripe fees make micropayments impossible.
**Solution:** Developers top up a wallet via Stripe Checkout (one larger payment, ~2% fee), then all marketplace transactions are internal ledger entries at zero per-transaction cost. Provider payouts aggregated monthly.

**Example:** Developer tops up €50. Stripe fee: €1.00 (2%). Developer now has €49.00 in credits. Makes 50 transactions at €1.00 each. Zero additional payment processing cost. Strale takes 5% per transaction = €2.50 total revenue. Without wallet model: 50 × €0.27 = €13.50 in Stripe fees alone.

**Future:** Internal ledger is designed to be swappable to stablecoin rails (USDC on Base) when transaction volumes justify it. The architecture accounts for this from day one without building it.

### DEC-3: Kill Bidding
No auction mechanics. Providers list capabilities at fixed prices. `strale.do()` instantly selects the best matching capability within budget. Latency target: under 5 seconds for the full cycle (match → execute → return).

### DEC-4: You Are the Only Provider
For the first 3 months, the founder operates all capabilities. This ensures perfect quality control, avoids the cold-start/chicken-and-egg problem, and means no provider onboarding, escrow, dispute resolution, or Stripe Connect is needed.

### DEC-5: Backend Language — TypeScript
MCP SDK is TypeScript-native. Most MCP developers work in the TS ecosystem. When the MCP server layer is added later, it's seamless. Python SDK for client developers comes in week 3-4.

### DEC-6: Seed Capabilities — EU/Nordic Data Wedge
Capabilities must be things an agent genuinely cannot do itself without significant setup. Free libraries and commodity APIs don't qualify.

Five seed capabilities locked:

| # | Capability | Slug | Price | Implementation |
|---|---|---|---|---|
| 1 | Swedish company data | `swedish-company-data` | €0.80 | Puppeteer scrape of Allabolag.se |
| 2 | Screenshot any URL | `screenshot-url` | €0.05 | Puppeteer screenshot, return image |
| 3 | Invoice/receipt → structured JSON | `invoice-extract` | €0.30 | Claude API + tuned extraction prompt |
| 4 | Web page → structured data (with JS rendering) | `web-extract` | €0.15 | Puppeteer + Claude API extraction |
| 5 | EU address validation + formatting | `eu-address-validate` | €0.10 | Geocoding API + EU format normalization |

Three of five share Puppeteer infrastructure. The category lean is deliberate: EU/Nordic data access where Silicon Valley doesn't build.

**Explicitly rejected for MVP:** text summarization (developers have LLMs), language detection (free libraries), PDF-to-text (free libraries), basic web-to-markdown (Jina Reader is free). If a developer can solve it with a free library and 3 lines of code, it's not worth paying Strale for.

---

## 5. What We're Building (4-Week MVP)

### 5.1 Architecture

```
Developer's Agent
      │
      ▼
  POST /v1/do (task, max_price)     ←── REST API call
      │
      ▼
┌─────────────────────────────┐
│      Strale API Server       │
│     (TypeScript / Hono)      │
│                              │
│  1. Authenticate (API key)   │
│  2. Match task → capability  │
│  3. Check wallet balance     │
│  4. Execute capability       │
│  5. Deduct credits           │
│  6. Log transaction          │
│  7. Return result            │
└─────────────────────────────┘
      │                    │
      ▼                    ▼
┌──────────────┐  ┌────────────────┐
│  PostgreSQL   │  │  Capability     │
│  (5 tables)   │  │  Executors      │
│               │  │  (TS functions  │
│               │  │   in codebase)  │
└──────────────┘  └────────────────┘
```

No marketplace mechanics. No external providers. No queue system. The API receives a request, matches it to one of the founder's capabilities, executes it, charges the wallet, and returns the result.

### 5.2 Database Schema

Five tables total:

**users** — id, email, name, api_key, created_at, updated_at

**wallets** — id, user_id (unique), balance_cents (EUR), created_at, updated_at

**wallet_transactions** — id, wallet_id, amount_cents (+/-), type (top_up/purchase/refund), reference_id, stripe_session_id, description, created_at

**capabilities** — id, name, slug (unique), description, category, input_schema (JSONB), output_schema (JSONB), price_cents, is_active, avg_latency_ms, success_rate, created_at, updated_at

**transactions** — id, user_id, capability_id, status (pending/executing/completed/failed/refunded), input (JSONB), output (JSONB), error, price_cents, latency_ms, rating (1-5), provenance (JSONB), created_at, completed_at

All financial fields stored in EUR cents as integers. No floating point money.

### 5.3 API Endpoints

Authentication via API key in header: `Authorization: Bearer sk_...`

```
POST   /v1/do                    # Core endpoint — execute a capability
GET    /v1/capabilities          # List available capabilities
GET    /v1/capabilities/:slug    # Get capability details

POST   /v1/wallet/topup          # Create Stripe Checkout session
GET    /v1/wallet/balance        # Check current balance
GET    /v1/wallet/transactions   # Wallet transaction history

GET    /v1/transactions          # List capability transactions
GET    /v1/transactions/:id      # Transaction details
POST   /v1/transactions/:id/rate # Rate a completed transaction

POST   /v1/auth/register         # Register new account
POST   /v1/auth/api-key          # Regenerate API key
```

### 5.4 The Core Endpoint: POST /v1/do

**Request:**
```json
{
  "task": "Extract company data for Swedish org number 559106-8089",
  "category": "data-extraction",
  "max_price_cents": 200,
  "timeout_seconds": 30,
  "output_schema": {
    "type": "object",
    "properties": {
      "revenue_sek": { "type": "number" },
      "employees": { "type": "integer" }
    }
  }
}
```

**Response (success):**
```json
{
  "transaction_id": "txn_abc123",
  "status": "completed",
  "capability_used": "swedish-company-data",
  "price_cents": 80,
  "latency_ms": 2340,
  "output": {
    "revenue_sek": 282000000,
    "employees": 16,
    "profit_sek": 11280000,
    "fiscal_year": "2024"
  },
  "provenance": {
    "source": "allabolag.se",
    "extracted_at": "2026-02-25T10:32:15Z"
  }
}
```

**Matching logic (MVP — intentionally simple):**
1. If `category` provided → filter capabilities by category
2. Filter by `max_price_cents` → only within budget
3. If `output_schema` provided → match compatible capabilities
4. Multiple matches → pick highest success_rate
5. No exact match → keyword match on `task` vs capability descriptions
6. Still no match → return `no_matching_capability` error

No embeddings, no semantic search. Keyword matching is sufficient for 5 capabilities.

### 5.5 Wallet Top-Up Flow

1. Developer calls `POST /v1/wallet/topup` with `{ "amount_cents": 5000 }` (€50)
2. Server creates Stripe Checkout session
3. Returns Checkout URL
4. Developer completes payment on Stripe
5. Stripe webhook confirms payment
6. Server adds credits to wallet, logs wallet_transaction

Minimum top-up: €10. Suggested amounts: €10, €25, €50, €100.

### 5.6 Python SDK

Thin wrapper around the REST API. Target: ~200 lines of code. Published on PyPI as `strale`.

```python
from strale import Strale

s = Strale(api_key="sk_...")

# Execute a capability
result = await s.do("Extract company data for org 559106-8089", max_price=2.00)

# Browse capabilities
caps = await s.capabilities()

# Check balance
balance = await s.balance()
```

### 5.7 Dashboard (Minimal)

React + Tailwind + Vite. Functional, not polished.

Pages: Sign up/Login, Dashboard (balance + recent transactions + top-up), Transaction history, Capabilities browser, API key management, Top-up (→ Stripe Checkout).

### 5.8 Tech Stack

| Component | Choice | Why |
|---|---|---|
| Runtime | Node.js + TypeScript | MCP-native ecosystem |
| Framework | Hono | Lightweight, fast, minimal boilerplate |
| Database | PostgreSQL | ACID for financial transactions |
| ORM | Drizzle | Type-safe, lightweight |
| Payments | Stripe Checkout | Simple top-up (no Connect needed) |
| Hosting | Railway | One-click deploy, EU region, PG included |
| Headless browser | Puppeteer | Powers 3 of 5 seed capabilities |
| Dashboard | React + Tailwind + Vite | Standard, fast to build |

### 5.9 Project Structure

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
│   └── dashboard/              # React frontend
│       ├── src/
│       └── package.json
├── packages/
│   └── sdk-python/             # Python SDK
│       ├── strale/
│       │   ├── __init__.py
│       │   └── client.py
│       └── setup.py
├── package.json                # Monorepo root
└── README.md
```

---

## 6. Timeline

### Week 1–2: Core API + Wallet + First Capability

**Checkpoint:** API running on Railway. Can register, get API key, top up wallet via Stripe, call `POST /v1/do`, get a result from at least 1 capability, see transaction logged and wallet debited.

### Week 3–4: SDK + All Capabilities + Dashboard

**Checkpoint:** Python SDK on PyPI. 5 capabilities working reliably. Dashboard functional. Documentation exists. At least 1 external developer has used it.

---

## 7. What's Explicitly NOT in This Build

Everything from the full vision that was deferred:

- ❌ MCP server interface (REST API first, MCP layer added later)
- ❌ Bidding / auction mechanics
- ❌ External providers / provider onboarding
- ❌ Escrow / Stripe Connect
- ❌ Reputation scoring engine (just log success/failure rates)
- ❌ Dual-execution verification
- ❌ Sub-contracting / task chains
- ❌ Orchestration recipes
- ❌ Strale Index (data intelligence product)
- ❌ Public transaction feed
- ❌ Enterprise features / private marketplace
- ❌ Compliance automation
- ❌ Open protocol specification
- ❌ Stablecoin payment rails
- ❌ TypeScript SDK
- ❌ Framework integrations (LangChain, CrewAI, etc.)
- ❌ Capability bounty board
- ❌ Agent identity / keypairs
- ❌ Spending controls (per-day limits, category restrictions)

All deferred to post-validation. The vision document is preserved.

---

## 8. What We're Validating

After 4 weeks, we'll know:

1. **Can a developer get a result in under 5 minutes?** (Install SDK → API key → first call → result)
2. **Do developers top up their wallets?** (Will they put money in?)
3. **Do agents call `strale.do()` more than once?** (Is it a one-time experiment or ongoing usage?)
4. **Which capabilities get used?** (Are some categories significantly more valuable?)
5. **Is the "agent fallback" pattern real?** (Do developers actually use the try/except pattern?)

**If positive:** Open marketplace to external providers. Add MCP server layer. Expand capabilities. Build toward full vision.

**If negative:** We spent 4 weeks and learned the market isn't ready. Cheap education.

---

## 9. Open Questions We Haven't Resolved

These are real uncertainties, not rhetorical questions:

1. **Take rate:** 5% was chosen arbitrarily. Gemini argued 15-20% is justified for a software marketplace (Apple 30%, Upwork 10%). For the MVP with 5 founder-operated capabilities, the take rate is effectively 100% (you're both the platform and the provider), so this only matters when external providers join.

2. **Matching sophistication:** With 5 capabilities, keyword matching is fine. At 50 capabilities, it breaks. At 500, you need embeddings. When should this investment happen?

3. **MCP server timing:** The MVP is REST-only. When does the MCP server interface need to ship? MCP adoption is accelerating. Being REST-only while competitors offer MCP might be a problem.

4. **Stablecoin timing:** The wallet ledger is designed for future stablecoin rails. When does the switch actually make economic sense? What's the transaction volume threshold?

5. **Category focus vs. horizontal:** The 5 seed capabilities lean EU/Nordic data. Should post-MVP expand horizontally (add US data sources, different categories) or go deeper vertically (more EU registries, more Nordic sources)?

6. **Provider economics:** When external providers join, do they set their own prices or does Strale set prices? Provider-set prices enable a market but create quality variance. Strale-set prices ensure consistency but limit the marketplace.

7. **Anti-abuse:** What stops someone from topping up €10, calling expensive capabilities, and disputing the charges? The wallet model limits exposure (they can only lose what they deposited), but refund policy needs definition.

8. **Developer adoption friction:** Is an API key + SDK install + wallet top-up too many steps for a developer to evaluate the product? Should there be a free tier or trial credits?

---

## 10. Founder Context

- Solo non-technical founder based in Sweden
- Using AI coding tools (Claude Code, Cursor) for development
- Prior experience in Nordic B2B intelligence/distribution space
- This is a bootstrapped project — no external funding, no team
- Available full-time for the 4-week build

This context is relevant because it affects technical risk assessment. Complex distributed systems, async state machines, and payment edge cases are specifically hard to build with AI coding tools, which is why the scope was reduced so aggressively.
