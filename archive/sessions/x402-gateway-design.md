# x402 Scalable Gateway Design

Generated: 2026-03-29 (supersedes 2026-03-27 version)

---

## Section 1: Current Pattern Analysis

### How Each of the 5 Endpoints Works Today

All 5 endpoints are defined in `apps/api/src/routes/x402-gateway.ts` as a hardcoded `ENDPOINTS` array. Each entry is an `EndpointConfig` object:

```typescript
interface EndpointConfig {
  slug: string;
  path: string;
  description: string;
  maxAmountRequired: string;  // USDC atomic units (6 decimals)
  priceDisplay: string;       // Human-readable "$0.01"
  mapInput: (query: Record<string, string>) => Record<string, unknown>;
}
```

| # | Slug | Path | Price | Input Mapping |
|---|------|------|-------|--------------|
| 1 | `iban-validate` | `/x402/iban-validate` | $0.01 (10000 atomic) | `{ iban: query.iban }` |
| 2 | `vat-format-validate` | `/x402/vat-format-validate` | $0.01 (10000 atomic) | `{ vat_number: query.vat_number }` |
| 3 | `paid-api-preflight` | `/x402/paid-api-preflight` | $0.00 (free) | `{ url: query.url }` |
| 4 | `ssl-check` | `/x402/ssl-check` | $0.01 (10000 atomic) | `{ domain: query.domain }` |
| 5 | `sanctions-check` | `/x402/sanctions-check` | $0.02 (20000 atomic) | `{ name: query.name, country: query.country }` |

**Route registration:** Each endpoint gets an individual `x402Route.all(config.path, handler)` call inside a `for (const config of ENDPOINTS)` loop.

**Request flow:**
1. Check for `X-Payment` header
2. If absent and not free: return HTTP 402 with `paymentRequirements`
3. If present: call `verifyPayment()` -> POST to facilitator -> if valid, execute capability
4. Executor called via `getExecutor(config.slug)` from the capability registry
5. Input mapped via `config.mapInput(query)` — always from query params
6. Success: return `result.output` as JSON (HTTP 200)

### What's Shared vs. Per-Endpoint

**Shared (in the loop handler):**
- Payment verification logic (facilitator call)
- 402 response construction
- CORS config
- Error handling
- USDC contract address, network, wallet address

**Per-endpoint (in the config array):**
- Slug, URL path, description text
- Price (USDC atomic units)
- Input mapping function

### Two Separate x402 Systems (Technical Debt)

There are **two independent x402 implementations**:

1. **`/x402/*` routes** (`routes/x402-gateway.ts`) — Standalone gateway with 5 hardcoded endpoints. Uses direct facilitator HTTP calls for verification.

2. **`/v1/do` integration** (`routes/do.ts` lines 272-323 + `lib/x402-gateway.ts`) — Integrated into the main execution endpoint. Uses `@x402/core/server` library's `resourceServer.settle()`. Works for ALL capabilities, not just the 5 hardcoded ones.

**Key differences:**

| Aspect | `/x402/*` gateway | `/v1/do` integration |
|--------|-------------------|---------------------|
| Capabilities | 5 hardcoded | All 256 |
| Payment verification | Direct HTTP to facilitator | `@x402/core/server` library |
| Input handling | Query params only | JSON body |
| Transaction record | None | Yes (via executeFreeTier) |
| Settlement persistence | Not persisted | `c.set("x402_settlement")` but not in DB |
| USDC contract | Mainnet hardcoded | Configurable (mainnet/testnet) |

**The `/v1/do` path already solves the scalability problem** for POST-based JSON requests. The `/x402/*` gateway exists for developer experience: simpler GET URLs, discoverable paths, protocol-standard 402 responses.

### Lines of Code That Would Be Replaced

- `routes/x402-gateway.ts`: ~180 lines (entire file)
- `app.ts` lines 246-264: `/.well-known/x402.json` manifest (hardcoded endpoints list)
- Total: ~200 lines replaced by the new wildcard handler

### Payment Verification

**402 Response shape** (both v1 header and JSON body):
```json
{
  "x402Version": 1,
  "paymentRequirements": [{
    "scheme": "exact",
    "network": "eip155:8453",
    "maxAmountRequired": "10000",
    "resource": "https://api.strale.io/x402/<slug>",
    "description": "<capability description>",
    "mimeType": "application/json",
    "payTo": "<wallet address>",
    "maxTimeoutSeconds": 300,
    "asset": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"
  }],
  "error": "Payment required",
  "accepts": [{ "network": "eip155:8453", "asset": "USDC", "amount": "$0.01" }]
}
```

**Blockchain config:**
- USDC on Base mainnet: `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`
- USDC on Base Sepolia (testnet): `0x036CbD53842c5426634e7929541eC2318f3dCF7e`
- Facilitator: `https://facilitator.x402.org`
- EUR->USD conversion: `EUR_USD_RATE` env var (default 1.08)

**No x402-specific DB columns exist today.** Settlement IDs are stored in request context but not persisted.

---

## Section 2: Scalable Gateway Design

### 2.1 DB Schema Changes

#### Migration: `0038_x402_gateway_columns.sql`

```sql
-- x402 gateway columns for capabilities
ALTER TABLE capabilities
  ADD COLUMN IF NOT EXISTS x402_enabled BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE capabilities
  ADD COLUMN IF NOT EXISTS x402_price_usd DECIMAL(10, 4);
ALTER TABLE capabilities
  ADD COLUMN IF NOT EXISTS x402_method VARCHAR(4) NOT NULL DEFAULT 'POST';

-- x402 for solutions
ALTER TABLE solutions
  ADD COLUMN IF NOT EXISTS x402_enabled BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE solutions
  ADD COLUMN IF NOT EXISTS x402_price_usd DECIMAL(10, 4);

-- Transaction tracking
ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS payment_method VARCHAR(20) DEFAULT 'wallet';
ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS x402_settlement_id TEXT;
ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS price_usd DECIMAL(10, 4);

-- Partial index for fast x402 lookups
CREATE INDEX IF NOT EXISTS idx_capabilities_x402
  ON capabilities (x402_enabled) WHERE x402_enabled = true AND is_active = true;

CREATE INDEX IF NOT EXISTS idx_solutions_x402
  ON solutions (x402_enabled) WHERE x402_enabled = true AND is_active = true;
```

#### Drizzle schema additions

```typescript
// In capabilities table:
x402Enabled: boolean("x402_enabled").notNull().default(false),
x402PriceUsd: decimal("x402_price_usd", { precision: 10, scale: 4 }),
x402Method: varchar("x402_method", { length: 4 }).notNull().default("POST"),

// In solutions table:
x402Enabled: boolean("x402_enabled").notNull().default(false),
x402PriceUsd: decimal("x402_price_usd", { precision: 10, scale: 4 }),

// In transactions table:
paymentMethod: varchar("payment_method", { length: 20 }).default("wallet"),
x402SettlementId: text("x402_settlement_id"),
priceUsd: decimal("price_usd", { precision: 10, scale: 4 }),
```

### 2.2 Wildcard Route Handler

```typescript
// apps/api/src/routes/x402-gateway-v2.ts

import { Hono } from "hono";
import { cors } from "hono/cors";
import { eq, and } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { capabilities, transactions } from "../db/schema.js";
import { getExecutor } from "../capabilities/index.js";
import {
  isX402Configured,
  verifyX402Payment,
  extractPaymentHeader,
} from "../lib/x402-gateway.js";

// ─── Types ──────────────────────────────────────────────────────────────────

interface X402Capability {
  slug: string;
  name: string;
  description: string;
  x402PriceUsd: number;
  x402Method: string;
  inputSchema: Record<string, unknown> | null;
  priceCents: number;
}

// ─── Cache ──────────────────────────────────────────────────────────────────

const CACHE_TTL_MS = 60_000;
let _capabilityCache: Map<string, X402Capability> = new Map();
let _cacheExpiry = 0;

async function getX402Capability(slug: string): Promise<X402Capability | null> {
  if (Date.now() >= _cacheExpiry) await refreshCache();
  return _capabilityCache.get(slug) ?? null;
}

async function getAllX402Capabilities(): Promise<X402Capability[]> {
  if (Date.now() >= _cacheExpiry) await refreshCache();
  return [..._capabilityCache.values()];
}

async function refreshCache(): Promise<void> {
  try {
    const db = getDb();
    const rows = await db
      .select({
        slug: capabilities.slug,
        name: capabilities.name,
        description: capabilities.description,
        x402PriceUsd: capabilities.x402PriceUsd,
        x402Method: capabilities.x402Method,
        inputSchema: capabilities.inputSchema,
        priceCents: capabilities.priceCents,
      })
      .from(capabilities)
      .where(and(eq(capabilities.x402Enabled, true), eq(capabilities.isActive, true)));

    const newCache = new Map<string, X402Capability>();
    for (const row of rows) {
      newCache.set(row.slug, {
        slug: row.slug,
        name: row.name,
        description: row.description ?? "",
        x402PriceUsd: parseFloat(row.x402PriceUsd ?? "0"),
        x402Method: row.x402Method ?? "POST",
        inputSchema: row.inputSchema as Record<string, unknown> | null,
        priceCents: row.priceCents,
      });
    }
    _capabilityCache = newCache;
    _cacheExpiry = Date.now() + CACHE_TTL_MS;
  } catch (err) {
    console.error("[x402-gateway] Cache refresh failed:", err);
  }
}

// ─── Constants ──────────────────────────────────────────────────────────────

const USDC_ADDRESS = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const NETWORK = process.env.X402_NETWORK ?? "eip155:8453";
const WALLET_ADDRESS = process.env.X402_WALLET_ADDRESS;
const API_BASE_URL = process.env.API_BASE_URL ?? "https://api.strale.io";

function usdToUsdcAtomic(usd: number): string {
  return Math.ceil(usd * 1_000_000).toString();
}

// ─── Input extraction ───────────────────────────────────────────────────────

function isSimpleSchema(schema: Record<string, unknown> | null): boolean {
  if (!schema) return true;
  const props = (schema as any).properties;
  if (!props) return true;
  return Object.values(props).every(
    (p: any) =>
      p.type === "string" ||
      p.type === "number" ||
      p.type === "integer" ||
      p.type === "boolean",
  );
}

async function extractInputs(
  c: any,
  method: string,
  schema: Record<string, unknown> | null,
): Promise<Record<string, unknown>> {
  if (method === "POST" || c.req.header("content-type")?.includes("json")) {
    try {
      return await c.req.json();
    } catch {
      // Fall through to query params
    }
  }

  const query = c.req.query();
  if (!schema) return query;

  // Coerce types based on schema
  const props = (schema as any).properties ?? {};
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(query)) {
    const propType = (props[key] as any)?.type;
    if (propType === "number" || propType === "integer") {
      result[key] = Number(value);
    } else if (propType === "boolean") {
      result[key] = value === "true" || value === "1";
    } else {
      result[key] = value;
    }
  }
  return result;
}

// ─── 402 Response builder ───────────────────────────────────────────────────

function build402(cap: X402Capability, resourceUrl: string) {
  const maxAmount = usdToUsdcAtomic(cap.x402PriceUsd);
  const paymentRequirement = {
    scheme: "exact",
    network: NETWORK,
    maxAmountRequired: maxAmount,
    resource: resourceUrl,
    description: cap.description,
    mimeType: "application/json",
    payTo: WALLET_ADDRESS ?? "0x0000000000000000000000000000000000000001",
    maxTimeoutSeconds: 300,
    asset: USDC_ADDRESS,
  };

  const body = {
    x402Version: 1,
    paymentRequirements: [paymentRequirement],
    error: `Payment required. ${cap.name} costs $${cap.x402PriceUsd.toFixed(4)} USDC.`,
    accepts: [{ network: NETWORK, asset: "USDC", amount: `$${cap.x402PriceUsd.toFixed(2)}` }],
  };

  const headerPayload = Buffer.from(
    JSON.stringify({ x402Version: 1, ...paymentRequirement }),
  ).toString("base64");

  return { body, headerPayload };
}

// ─── Route ──────────────────────────────────────────────────────────────────

export const x402GatewayV2 = new Hono();

x402GatewayV2.use(
  "/*",
  cors({
    origin: "*",
    allowMethods: ["GET", "POST", "OPTIONS"],
    allowHeaders: ["Content-Type", "X-Payment", "X-Payment-Response"],
    exposeHeaders: ["Payment-Required", "X-Payment-Response"],
  }),
);

// ─── Discovery endpoint ─────────────────────────────────────────────────────

x402GatewayV2.get("/catalog", async (c) => {
  const caps = await getAllX402Capabilities();
  return c.json({
    x402: true,
    network: NETWORK,
    facilitator: process.env.X402_FACILITATOR_URL ?? "https://facilitator.x402.org",
    wallet: WALLET_ADDRESS ?? null,
    capabilities: caps.map((cap) => ({
      slug: cap.slug,
      name: cap.name,
      description: cap.description,
      price_usd: cap.x402PriceUsd,
      method: cap.x402Method,
      endpoint: `${API_BASE_URL}/x402/${cap.slug}`,
      input_schema: cap.inputSchema,
    })),
    total: caps.length,
  });
});

// ─── Wildcard capability handler ────────────────────────────────────────────

x402GatewayV2.all("/:slug", async (c) => {
  const slug = c.req.param("slug");
  if (slug === "catalog") return c.notFound();

  // 1. Look up capability
  const cap = await getX402Capability(slug);
  if (!cap) {
    return c.json(
      { error: "Capability not found or not available via x402.", hint: `${API_BASE_URL}/x402/catalog` },
      404,
    );
  }

  // 2. Method check for complex schemas
  if (cap.x402Method === "POST" && c.req.method === "GET" && !isSimpleSchema(cap.inputSchema)) {
    return c.json({ error: "This capability requires POST with JSON body." }, 405);
  }

  // 3. Extract and validate inputs BEFORE payment
  let inputs: Record<string, unknown>;
  try {
    inputs = await extractInputs(c, c.req.method, cap.inputSchema);
  } catch {
    return c.json({ error: "Invalid request body. Expected JSON." }, 400);
  }

  const schema = cap.inputSchema as any;
  if (schema?.required) {
    const missing = (schema.required as string[]).filter(
      (f) => inputs[f] === undefined || inputs[f] === null || inputs[f] === "",
    );
    if (missing.length > 0) {
      return c.json({ error: `Missing required fields: ${missing.join(", ")}`, input_schema: cap.inputSchema }, 400);
    }
  }

  // 4. Free capabilities skip payment
  if (cap.x402PriceUsd === 0) {
    return executeAndRespond(c, cap, inputs);
  }

  // 5. Check for payment header
  const paymentHeader = extractPaymentHeader(c.req.raw.headers);

  if (!paymentHeader) {
    if (!isX402Configured()) {
      return c.json({ error: "x402 payments not configured on this server." }, 503);
    }
    const { body, headerPayload } = build402(cap, `${API_BASE_URL}/x402/${slug}`);
    c.header("Payment-Required", headerPayload);
    return c.json(body, 402);
  }

  // 6. Verify payment
  if (!isX402Configured()) {
    return c.json({ error: "x402 payments not configured." }, 503);
  }

  const verification = await verifyX402Payment(paymentHeader, cap.priceCents);
  if (!verification.valid) {
    return c.json({ error: "Payment verification failed", detail: verification.error }, 402);
  }

  // 7. Execute
  return executeAndRespond(c, cap, inputs, verification.settlementId);
});

// ─── Execution ──────────────────────────────────────────────────────────────

async function executeAndRespond(
  c: any,
  cap: X402Capability,
  inputs: Record<string, unknown>,
  settlementId?: string,
) {
  const executor = getExecutor(cap.slug);
  if (!executor) {
    return c.json({ error: "Capability executor unavailable." }, 503);
  }

  const startMs = Date.now();
  try {
    const result = await executor(inputs);
    const latencyMs = Date.now() - startMs;

    recordX402Transaction(cap, inputs, result.output, latencyMs, settlementId).catch((err) =>
      console.error("[x402] Transaction recording failed:", err),
    );

    return c.json({
      ...result.output,
      _meta: {
        capability: cap.slug,
        latency_ms: latencyMs,
        provenance: result.provenance,
        payment: settlementId
          ? { method: "x402", settlement_id: settlementId, price_usd: cap.x402PriceUsd }
          : { method: "free" },
      },
    });
  } catch (err) {
    const latencyMs = Date.now() - startMs;
    const message = err instanceof Error ? err.message : String(err);
    recordX402Transaction(cap, inputs, null, latencyMs, settlementId, message).catch(() => {});
    const sanitized = message.length > 200 ? message.slice(0, 200) + "..." : message;
    return c.json({ error: sanitized }, 400);
  }
}

async function recordX402Transaction(
  cap: X402Capability,
  inputs: Record<string, unknown>,
  output: Record<string, unknown> | null,
  latencyMs: number,
  settlementId?: string,
  error?: string,
): Promise<void> {
  const db = getDb();
  await db.insert(transactions).values({
    userId: null,
    capabilitySlug: cap.slug,
    input: inputs,
    output,
    error: error ?? null,
    status: error ? "failed" : "completed",
    priceCents: cap.priceCents,
    priceUsd: cap.x402PriceUsd.toFixed(4),
    paymentMethod: "x402",
    x402SettlementId: settlementId ?? null,
    latencyMs,
    transparencyMarker: "algorithmic",
    dataJurisdiction: "EU",
    isFreeTier: false,
    auditTrail: {
      payment_method: "x402",
      settlement_id: settlementId ?? null,
      price_usd: cap.x402PriceUsd,
      capability: cap.slug,
      latency_ms: latencyMs,
      timestamp: new Date().toISOString(),
    },
  });
}
```

### 2.3 Updated `/.well-known/x402.json` (DB-driven)

Replace the hardcoded manifest in `app.ts`:

```typescript
app.get("/.well-known/x402.json", async (c) => {
  const caps = await getAllX402Capabilities(); // from x402-gateway-v2.ts export
  return c.json({
    x402: true,
    facilitator: process.env.X402_FACILITATOR_URL ?? "https://facilitator.x402.org",
    network: NETWORK,
    wallet: WALLET_ADDRESS ?? null,
    endpoints: caps.map((cap) => ({
      path: `/x402/${cap.slug}`,
      method: cap.x402Method,
      price: cap.x402PriceUsd.toFixed(2),
      currency: "USDC",
      network: NETWORK,
      description: cap.description,
    })),
  }, 200, { "Cache-Control": "public, max-age=300" });
});
```

### 2.4 Auth Bypass

The x402 path already operates outside the auth middleware:
- `app.ts` registers x402 routes on `/x402/*` with `publicCors` (no auth middleware)
- No wallet debit — USDC payment IS the auth
- Transaction records: `userId: null`, `paymentMethod: "x402"`

### 2.5 Error Handling

| Scenario | HTTP | Response | When |
|----------|------|----------|------|
| Capability not found | 404 | `{ error, hint }` | Before payment |
| Invalid input | 400 | `{ error, input_schema }` | Before payment |
| x402 not configured | 503 | `{ error }` | Before payment |
| Payment failed | 402 | `{ error, detail }` | After input validation |
| Executor missing | 503 | `{ error }` | After payment |
| Executor error | 400 | `{ error }` (sanitized) | After payment (recorded) |

**Key:** Input validation happens BEFORE payment verification. Never charged for bad input.

### 2.6 Rate Limiting

- **IP-based:** 100 req/min per IP (existing Hono middleware)
- **Natural limiter:** Each request costs real USDC
- **Wallet-based:** Deferred (requires parsing payment header pre-verification)

---

## Section 3: Migration Plan

### 3.1 Enable Current 5 Endpoints

```sql
UPDATE capabilities SET x402_enabled = true, x402_price_usd = 0.01, x402_method = 'GET'
  WHERE slug = 'iban-validate';
UPDATE capabilities SET x402_enabled = true, x402_price_usd = 0.01, x402_method = 'GET'
  WHERE slug = 'vat-format-validate';
UPDATE capabilities SET x402_enabled = true, x402_price_usd = 0.00, x402_method = 'GET'
  WHERE slug = 'paid-api-preflight';
UPDATE capabilities SET x402_enabled = true, x402_price_usd = 0.01, x402_method = 'GET'
  WHERE slug = 'ssl-check';
UPDATE capabilities SET x402_enabled = true, x402_price_usd = 0.02, x402_method = 'GET'
  WHERE slug = 'sanctions-check';
```

### 3.2 Backward Compatibility Verification

1. `curl /x402/iban-validate?iban=SE35...` returns 402 with same `paymentRequirements` shape
2. `curl /x402/catalog` returns all 5+ endpoints
3. `curl /.well-known/x402.json` returns DB-driven list
4. Payment flow identical (same facilitator, USDC contract, verification)

### 3.3 Code to Delete

- `apps/api/src/routes/x402-gateway.ts` — entire file (replaced by v2)
- `app.ts` lines 246-264 — hardcoded `/.well-known/x402.json`
- Keep `lib/x402-gateway.ts` — still used for `verifyX402Payment()`, `isX402Configured()`, etc.

---

## Section 4: Tier 1 Expansion

### Capabilities

```sql
-- Financial validation
UPDATE capabilities SET x402_enabled = true, x402_price_usd = 0.01, x402_method = 'GET'
  WHERE slug = 'vat-validate';
-- Input: vat_number (string) — VIES EU VAT validation

UPDATE capabilities SET x402_enabled = true, x402_price_usd = 0.01, x402_method = 'GET'
  WHERE slug = 'bank-bic-lookup';
-- Input: bic (string, 8 or 11 chars) — local lookup table, pure algorithmic

UPDATE capabilities SET x402_enabled = true, x402_price_usd = 0.01, x402_method = 'GET'
  WHERE slug = 'exchange-rate';
-- Input: from (string, default "USD"), to (string, default "EUR") — ECB API, free

UPDATE capabilities SET x402_enabled = true, x402_price_usd = 0.02, x402_method = 'POST'
  WHERE slug = 'invoice-validate';
-- Input: invoice (object with line_items, amounts, vendor_vat, etc.) — complex, POST only

-- Compliance
UPDATE capabilities SET x402_enabled = true, x402_price_usd = 0.02, x402_method = 'GET'
  WHERE slug = 'pep-check';
-- Input: name (string), date_of_birth (optional), country (optional) — Dilisense API

UPDATE capabilities SET x402_enabled = true, x402_price_usd = 0.02, x402_method = 'GET'
  WHERE slug = 'adverse-media-check';
-- Input: name (string), entity_type (optional) — Dilisense Media API

UPDATE capabilities SET x402_enabled = true, x402_price_usd = 0.03, x402_method = 'POST'
  WHERE slug = 'beneficial-ownership-lookup';
-- Input: company_name or company_number, jurisdiction (default "gb") — UK Companies House

UPDATE capabilities SET x402_enabled = true, x402_price_usd = 0.01, x402_method = 'GET'
  WHERE slug = 'aml-risk-score';
-- Input: entity_name (string), country_code (string) — pure algorithmic, no external API

UPDATE capabilities SET x402_enabled = true, x402_price_usd = 0.01, x402_method = 'GET'
  WHERE slug = 'insolvency-check';
-- Input: company_name or company_number, country_code (string) — UK Companies House

-- Web intelligence
UPDATE capabilities SET x402_enabled = true, x402_price_usd = 0.01, x402_method = 'GET'
  WHERE slug = 'domain-reputation';
-- Input: domain (string) — algorithmic (DNS, HTTPS, headers), no external paid API

UPDATE capabilities SET x402_enabled = true, x402_price_usd = 0.01, x402_method = 'GET'
  WHERE slug = 'whois-lookup';
-- Input: domain (string) — WHOIS protocol over TCP port 43

UPDATE capabilities SET x402_enabled = true, x402_price_usd = 0.01, x402_method = 'GET'
  WHERE slug = 'company-name-match';
-- Input: name_a (string), name_b (string) — pure algorithmic (Jaro-Winkler, Levenshtein)
```

### Solutions

```sql
UPDATE solutions SET x402_enabled = true, x402_price_usd = 0.08
  WHERE slug = 'crypto-counterparty-kyb';
-- Input: entity_name (string), entity_website (uri)
-- Steps: sanctions-check, domain-reputation, ssl-check, whois-lookup, email-deliverability-check

UPDATE solutions SET x402_enabled = true, x402_price_usd = 0.05
  WHERE slug = 'customer-risk-screen';
-- Input: name (string), country_code (optional), birth_date (optional)
-- Steps: sanctions-check, pep-check, adverse-media-check (parallel)

UPDATE solutions SET x402_enabled = true, x402_price_usd = 0.02
  WHERE slug = 'payment-validate';
-- Input: iban (string), vat_number (string)
-- Steps: iban-validate, vat-validate (sequential)

UPDATE solutions SET x402_enabled = true, x402_price_usd = 0.08
  WHERE slug = 'web3-counterparty-kyb';
-- Input: entity_name (string), domain (string)
-- Steps: sanctions-check, whois-lookup, ssl-check, domain-reputation, header-security-check, dns-lookup

UPDATE solutions SET x402_enabled = true, x402_price_usd = 0.05
  WHERE slug = 'defi-risk-check';
-- Input: protocol_url (uri), protocol_name (string)
-- Steps: ssl-check, domain-reputation, sanctions-check, whois-lookup

UPDATE solutions SET x402_enabled = true, x402_price_usd = 0.10
  WHERE slug = 'token-project-dd';
-- Input: project_url (uri), team_entity_name (string)
-- Steps: tech-stack-detect, ssl-check, domain-reputation, whois-lookup, sanctions-check
```

---

## Section 5: Future-Proofing Checklist

### Capability count: 1,000 / 10,000 / 100,000

**Cache layer handles it.** The cache holds only x402-enabled capabilities (expected: <1% of total). At 100,000 capabilities with 1,000 x402-enabled, the cache is a 1,000-entry Map (trivial). The DB query uses the partial index (`WHERE x402_enabled = true AND is_active = true`), so index scans are O(log n).

**Executor registry is already O(1).** `getExecutor(slug)` is a Map lookup.

### Capability deactivated

Cache query filters on `is_active = true`. Setting `is_active = false` removes it from the next cache refresh (within 60s). Handler returns 404 for uncached slugs.

### x402 price changes

```sql
UPDATE capabilities SET x402_price_usd = 0.05 WHERE slug = 'sanctions-check';
```
Takes effect within 60 seconds. No deploy.

### New capability added

1. Register executor (existing auto-import)
2. Seed to DB (existing pipeline)
3. `UPDATE capabilities SET x402_enabled = true, x402_price_usd = 0.02 WHERE slug = 'new-cap';`
4. Available at `/x402/new-cap` within 60 seconds. Zero deploys.

### Versioning (v1 vs v2)

Not needed yet. Breaking changes -> new slug (e.g., `sanctions-check-v2`). Old slug continues working. Matches existing `/v1/do` pattern.

### Geographic routing (EU-only capabilities)

`data_jurisdiction` column already tracks this. Better handled at executor level (already enforces jurisdiction). x402 layer stays jurisdiction-agnostic.

### Dual x402 systems coexistence

Both should coexist:
- **`/v1/do`**: Full-featured, POST-only, JSON body, for SDK/programmatic use
- **`/x402/:slug`**: Developer-friendly, GET+POST, query params, simpler responses, protocol-discoverable

The new wildcard handler replaces the old 5-endpoint gateway while maintaining the same DX.
