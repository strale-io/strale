# Strale MVP — Build Spec (4 Weeks)

**What we're building:** `strale.do()` — a single API endpoint that resolves agent capability gaps. Fixed pricing. Instant routing. You are the only provider.

**What we're proving:** Developers will let their agents buy capabilities they're missing.

---

## Architecture Overview

```
Developer's Agent
      │
      ▼
  strale.do(task, max_price)     ←── REST API call
      │
      ▼
┌─────────────────────────┐
│     Strale API Server    │
│    (TypeScript / Hono)   │
│                          │
│  1. Authenticate (API key)│
│  2. Match task → capability│
│  3. Check wallet balance  │
│  4. Execute capability    │
│  5. Deduct credits        │
│  6. Log transaction       │
│  7. Return result         │
└─────────────────────────┘
      │
      ▼
┌──────────────┐  ┌──────────────┐
│  PostgreSQL   │  │  Capability   │
│  (users,      │  │  Executors    │
│   wallets,    │  │  (your code   │
│   transactions│  │   that does   │
│   capabilities│  │   the work)   │
│   ratings)    │  │              │
└──────────────┘  └──────────────┘
```

**Key simplification:** No marketplace. No bidding. No external providers. No escrow. The API receives a request, matches it to one of YOUR capabilities, executes it, charges the wallet, and returns the result. That's it.

---

## Week 1–2: Core API + Database + Wallet

### Database Schema (PostgreSQL)

**Table: users**
```sql
CREATE TABLE users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email         VARCHAR(255) UNIQUE NOT NULL,
  name          VARCHAR(255),
  api_key       VARCHAR(64) UNIQUE NOT NULL,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);
```

**Table: wallets**
```sql
CREATE TABLE wallets (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID REFERENCES users(id) NOT NULL UNIQUE,
  balance_cents INTEGER NOT NULL DEFAULT 0,  -- stored in EUR cents
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);
```

**Table: wallet_transactions**
```sql
CREATE TABLE wallet_transactions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_id     UUID REFERENCES wallets(id) NOT NULL,
  amount_cents  INTEGER NOT NULL,            -- positive = top-up, negative = purchase
  type          VARCHAR(20) NOT NULL,        -- 'top_up', 'purchase', 'refund'
  reference_id  UUID,                        -- links to transaction if purchase
  stripe_session_id VARCHAR(255),            -- links to Stripe if top-up
  description   TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);
```

**Table: capabilities**
```sql
CREATE TABLE capabilities (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          VARCHAR(255) NOT NULL,
  slug          VARCHAR(255) UNIQUE NOT NULL,
  description   TEXT NOT NULL,
  category      VARCHAR(50) NOT NULL,
  input_schema  JSONB NOT NULL,              -- JSON Schema defining expected input
  output_schema JSONB NOT NULL,              -- JSON Schema defining expected output
  price_cents   INTEGER NOT NULL,            -- price in EUR cents
  is_active     BOOLEAN DEFAULT true,
  avg_latency_ms INTEGER,                    -- updated from transaction history
  success_rate  DECIMAL(5,4),                -- updated from transaction history
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);
```

**Table: transactions**
```sql
CREATE TABLE transactions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID REFERENCES users(id) NOT NULL,
  capability_id   UUID REFERENCES capabilities(id) NOT NULL,
  status          VARCHAR(20) NOT NULL DEFAULT 'pending',
                  -- 'pending', 'executing', 'completed', 'failed', 'refunded'
  input           JSONB NOT NULL,
  output          JSONB,
  error           TEXT,
  price_cents     INTEGER NOT NULL,
  latency_ms      INTEGER,
  rating          SMALLINT,                  -- 1-5, optional buyer rating
  parent_transaction_id UUID REFERENCES transactions(id), -- for future chaining
  provenance      JSONB,                     -- for future provenance tracking
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  completed_at    TIMESTAMPTZ
);
```

### API Endpoints

**Authentication:** API key in header (`Authorization: Bearer sk_...`)

```
POST   /v1/do                    # The core endpoint — execute a capability
GET    /v1/capabilities          # List available capabilities
GET    /v1/capabilities/:slug    # Get details of a specific capability

POST   /v1/wallet/topup          # Create Stripe Checkout session for top-up
GET    /v1/wallet/balance         # Check current balance
GET    /v1/wallet/transactions    # List wallet transaction history

GET    /v1/transactions           # List your transactions
GET    /v1/transactions/:id       # Get details of a transaction
POST   /v1/transactions/:id/rate  # Rate a completed transaction

POST   /v1/auth/register          # Register new account
POST   /v1/auth/api-key           # Regenerate API key
```

### The Core Endpoint: POST /v1/do

**Request:**
```json
{
  "task": "Extract company data for Swedish org number 559106-8089",
  "category": "data-extraction",        // optional, helps matching
  "max_price_cents": 200,               // max willing to pay (EUR cents)
  "timeout_seconds": 30,                // max wait time
  "output_schema": {                     // optional, what you expect back
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

**Response (failure):**
```json
{
  "error": "no_matching_capability",
  "message": "No capability found matching your request within budget.",
  "suggestions": ["Try increasing max_price", "Browse /v1/capabilities for available options"]
}
```

**How matching works (MVP — simple, not smart):**

1. If `category` provided → filter capabilities by category
2. If `output_schema` provided → find capabilities whose output_schema is compatible
3. Filter by `max_price_cents` → only capabilities within budget
4. If multiple matches → pick highest success_rate
5. If no match → try semantic match on `task` description against capability descriptions
6. If still no match → return `no_matching_capability` error

Step 5 (semantic matching) can use a simple embedding similarity check, or in the very first version, just keyword matching. Don't over-engineer this.

### Wallet Top-Up Flow

1. Developer calls `POST /v1/wallet/topup` with `{ "amount_cents": 5000 }` (€50)
2. Server creates Stripe Checkout session with that amount
3. Returns Checkout URL to developer
4. Developer (or their automated system) completes payment on Stripe
5. Stripe webhook fires on successful payment
6. Server adds credits to wallet, logs wallet_transaction

### Tech Stack (Week 1–2)

| Component | Choice | Why |
|---|---|---|
| Runtime | Node.js + TypeScript | MCP-native ecosystem |
| Framework | Hono | Lightweight, fast, simple |
| Database | PostgreSQL | ACID for financial transactions |
| ORM | Drizzle | Type-safe, lightweight, good DX |
| Payments | Stripe Checkout | Simple top-up, no Connect needed |
| Hosting | Railway | One-click deploy, EU region, PostgreSQL included |
| Task matching | Keyword/embedding | Simple first, smart later |

---

## Week 3–4: SDK + Seed Capabilities + Dashboard

### Python SDK

What the developer installs:
```bash
pip install strale
```

What the developer writes:
```python
from strale import Strale

s = Strale(api_key="sk_...")

# The one-liner
result = await s.do(
    "Extract company data for Swedish org 559106-8089",
    max_price=2.00
)
print(result.output)
# {"revenue_sek": 282000000, "employees": 16, ...}

# Fallback pattern
try:
    data = my_agent.extract_data(url)
except Exception:
    data = await s.do(f"Extract structured data from {url}", max_price=1.00)

# Browse capabilities
caps = await s.capabilities()
for cap in caps:
    print(f"{cap.name}: €{cap.price_cents/100:.2f} — {cap.description}")

# Check balance
balance = await s.balance()
print(f"€{balance.balance_cents/100:.2f} remaining")
```

The SDK is a thin wrapper around the REST API. No magic. Maybe 200 lines of code total.

### Seed Capabilities (You Operate These)

Start with 5. Not 10, not 15. Five that work perfectly.

| # | Capability | Slug | Price | How It Works |
|---|---|---|---|---|
| 1 | Swedish company data | `swedish-company-data` | €0.80 | Scrape Allabolag.se for org number |
| 2 | Web page to markdown | `web-to-markdown` | €0.05 | Use Jina Reader API or similar |
| 3 | PDF text extraction | `pdf-to-text` | €0.10 | Use pdf-parse or similar library |
| 4 | Text summarization | `summarize-text` | €0.15 | Call Claude API with summarization prompt |
| 5 | Language detection | `detect-language` | €0.02 | Use franc or similar library |

**Each capability is a TypeScript function** in the Strale codebase. When a request matches, the server calls the function directly. No external providers, no network calls (except to upstream APIs like Allabolag or Claude).

Add more capabilities only after these 5 work flawlessly.

### Dashboard (Minimal)

A simple web UI at `app.strale.dev` or similar.

**Pages:**
1. **Sign up / Log in** — email + password, or GitHub OAuth
2. **Dashboard** — current balance, recent transactions, quick top-up button
3. **Transactions** — list of all transactions with status, price, rating option
4. **Capabilities** — browse what's available
5. **API Keys** — view/regenerate your API key
6. **Top Up** — select amount, redirects to Stripe Checkout

**Tech:** React + Tailwind + Vite. Deployed on same Railway project or Vercel. Functional, not beautiful. Nobody will judge the dashboard — they'll judge whether `strale.do()` works.

---

## What's NOT in this build

Everything else from the 30-section spec is deferred. Specifically:

- ❌ MCP server (REST API first, MCP layer added later)
- ❌ Bidding / auction
- ❌ External providers
- ❌ Escrow / Stripe Connect
- ❌ Reputation scoring (just log success/failure rates)
- ❌ Dual-execution verification
- ❌ Sub-contracting / chaining
- ❌ Recipes / orchestration
- ❌ Strale Index
- ❌ Public transaction feed
- ❌ Enterprise features
- ❌ Compliance automation
- ❌ Protocol spec publication
- ❌ Stablecoin rails
- ❌ TypeScript SDK (Python first, TS later)
- ❌ Framework integrations (manual for now)
- ❌ Bounty board
- ❌ Provider onboarding
- ❌ Agent identity / keypairs

All of this comes AFTER we prove developers will use `strale.do()`.

---

## Deployment

Everything runs on Railway (or similar):

```
strale/
├── apps/
│   ├── api/              # Hono API server
│   │   ├── src/
│   │   │   ├── routes/   # API route handlers
│   │   │   ├── capabilities/  # Capability executor functions
│   │   │   ├── db/       # Drizzle schema + queries
│   │   │   ├── lib/      # Stripe, matching, auth helpers
│   │   │   └── index.ts  # Server entry point
│   │   ├── package.json
│   │   └── tsconfig.json
│   └── dashboard/        # React frontend
│       ├── src/
│       └── package.json
├── packages/
│   └── sdk-python/       # Python SDK
│       ├── strale/
│       │   ├── __init__.py
│       │   └── client.py
│       ├── setup.py
│       └── README.md
├── package.json          # Monorepo root
└── README.md
```

---

## Success Criteria (4 weeks)

**Week 2 checkpoint:**
- [ ] API server running on Railway
- [ ] Can register, get API key
- [ ] Can top up wallet via Stripe
- [ ] Can call `POST /v1/do` and get a result from at least 1 capability
- [ ] Transaction logged in database, wallet debited

**Week 4 checkpoint:**
- [ ] Python SDK published on PyPI (`pip install strale`)
- [ ] 5 capabilities working reliably
- [ ] Dashboard functional (register, top up, view transactions)
- [ ] Documentation exists (README + API docs)
- [ ] At least 1 external developer has used it

---

## The Question We're Answering

After 4 weeks, we'll know:

1. Can a developer install the SDK and get a result in under 5 minutes?
2. Do developers actually top up their wallets?
3. Do agents call `strale.do()` more than once?
4. Which capabilities get used? Which don't?
5. Is the "agent fallback" pattern real, or theoretical?

If the answers are positive → open to external providers, add MCP server, expand capabilities, build toward the full vision.

If the answers are negative → we spent 4 weeks and learned the market isn't ready. That's cheap education.
