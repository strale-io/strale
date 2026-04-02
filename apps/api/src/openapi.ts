/**
 * OpenAPI 3.1.0 specification for the Strale API.
 *
 * Serves at GET /openapi.json. Covers all public and authenticated endpoints.
 * Internal admin, test management, and onboarding endpoints are excluded.
 */

const errorSchema = {
  type: "object" as const,
  properties: {
    error_code: { type: "string" as const },
    message: { type: "string" as const },
    details: { type: "object" as const },
  },
  required: ["error_code", "message"],
};

const errorResponse = (code: string, message: string) => ({
  description: message,
  content: { "application/json": { schema: errorSchema, example: { error_code: code, message } } },
});

export const openApiSpec = {
  openapi: "3.1.0",
  info: {
    title: "Strale API",
    version: "1.0.0",
    description:
      "The trust layer for AI agents — 250+ independently tested data capabilities across 27 countries. Execute capabilities via REST, MCP, A2A, or x402 micropayments. Every capability is quality-scored with the Strale Quality Score (SQS).",
    contact: { name: "Strale", email: "hello@strale.io", url: "https://strale.dev" },
    termsOfService: "https://strale.dev/terms",
    license: { name: "MIT", url: "https://opensource.org/licenses/MIT" },
  },
  externalDocs: { description: "Strale Documentation", url: "https://strale.dev/docs" },
  servers: [{ url: "https://api.strale.io", description: "Production — includes sandbox access via free trial (€2.00 credits on signup, no card required)" }],
  tags: [
    { name: "capabilities", description: "Browse and execute capabilities" },
    { name: "solutions", description: "Bundled multi-capability workflows" },
    { name: "wallet", description: "Wallet balance and top-ups" },
    { name: "transactions", description: "Transaction history and verification" },
    { name: "auth", description: "Registration and API key management" },
    { name: "trust", description: "Quality scores and trust data" },
    { name: "suggest", description: "AI-powered capability suggestions" },
    { name: "discovery", description: "Agent discovery endpoints" },
  ],
  components: {
    securitySchemes: {
      BearerAuth: {
        type: "http" as const,
        scheme: "bearer",
        description: "Strale API key (starts with sk_live_). Obtain from https://strale.dev after registration.",
      },
    },
    schemas: {
      Error: errorSchema,
      Capability: {
        type: "object" as const,
        properties: {
          slug: { type: "string" as const, example: "iban-validate" },
          name: { type: "string" as const, example: "IBAN Validation" },
          description: { type: "string" as const },
          category: { type: "string" as const, example: "validation" },
          price_cents: { type: "integer" as const, description: "Price in EUR cents (0 = free tier)", example: 0 },
          input_schema: { type: "object" as const },
          output_schema: { type: "object" as const },
          transparency_tag: { type: "string" as const, nullable: true, enum: ["algorithmic", "ai_generated", "mixed"] },
          geography: { type: "string" as const, nullable: true },
          data_source: { type: "string" as const, nullable: true },
          is_free_tier: { type: "boolean" as const },
          search_tags: { type: "array" as const, items: { type: "string" as const }, description: "Searchability tags" },
          sqs: { type: "number" as const, description: "Strale Quality Score (0-100, freshness-decayed)" },
          sqs_raw: { type: "number" as const, description: "Raw SQS before freshness decay" },
          sqs_label: { type: "string" as const, enum: ["Excellent", "Good", "Fair", "Poor", "Degraded", "Pending"] },
          quality: { type: "string" as const, description: "Quality Profile grade", enum: ["A", "B", "C", "D", "F", "pending"] },
          reliability: { type: "string" as const, description: "Reliability Profile grade", enum: ["A", "B", "C", "D", "F", "pending"] },
          trend: { type: "string" as const, enum: ["stable", "improving", "declining", "stale"] },
          freshness_level: { type: "string" as const, description: "Test data freshness", enum: ["fresh", "aging", "stale", "expired", "unverified"] },
          last_tested_at: { type: "string" as const, format: "date-time", nullable: true, description: "When this capability was last tested" },
          usable: { type: "boolean" as const },
          strategy: { type: "string" as const, enum: ["direct", "retry_with_backoff", "queue_for_later", "unavailable"] },
        },
      },
      Solution: {
        type: "object" as const,
        properties: {
          slug: { type: "string" as const, example: "kyb-essentials-se" },
          name: { type: "string" as const },
          description: { type: "string" as const },
          category: { type: "string" as const },
          price_cents: { type: "integer" as const },
          step_count: { type: "integer" as const },
          geography: { type: "string" as const },
          transparency_tag: { type: "string" as const, nullable: true, description: "Data transparency category" },
          compliance_coverage: { type: "array" as const, items: { type: "string" as const }, description: "Compliance frameworks covered" },
          search_tags: { type: "array" as const, items: { type: "string" as const }, description: "Searchability tags" },
          capabilities: { type: "array" as const, items: { type: "string" as const }, description: "Step capability slugs" },
          data_sources: { type: "array" as const, items: { type: "string" as const }, description: "Unique data sources across steps" },
          sqs: { type: "number" as const, description: "Solution SQS (avg of steps, capped at weakest + 20)" },
          sqs_label: { type: "string" as const, enum: ["Excellent", "Good", "Fair", "Poor", "Degraded"] },
          quality: { type: "string" as const, description: "Worst step QP grade", enum: ["A", "B", "C", "D", "F", "pending"] },
          reliability: { type: "string" as const, description: "Worst step RP grade", enum: ["A", "B", "C", "D", "F", "pending"] },
          trend: { type: "string" as const, enum: ["stable", "improving", "declining", "stale"] },
          freshness_level: { type: "string" as const, description: "Worst step freshness", enum: ["fresh", "aging", "stale", "expired", "unverified"] },
          last_tested_at: { type: "string" as const, format: "date-time", nullable: true, description: "Oldest step last-tested timestamp" },
          usable: { type: "boolean" as const },
          strategy: { type: "string" as const, enum: ["direct", "retry_with_backoff", "queue_for_later", "unavailable"] },
        },
      },
      DoRequest: {
        type: "object" as const,
        description: "Provide either capability_slug (direct execution) or task (semantic matching).",
        properties: {
          task: { type: "string" as const, description: "Natural language task description. The system finds the best matching capability.", example: "Validate this IBAN: DE89370400440532013000" },
          capability_slug: { type: "string" as const, description: "Direct capability slug to execute.", example: "iban-validate" },
          inputs: { type: "object" as const, description: "Capability-specific input fields.", example: { iban: "DE89370400440532013000" } },
          max_price_cents: { type: "integer" as const, description: "Maximum price willing to pay (EUR cents). Required for authenticated requests to paid capabilities." },
          timeout_seconds: { type: "integer" as const, description: "Max execution time (1-60, default 30)." },
          dry_run: { type: "boolean" as const, description: "If true, returns matched capability without executing.", default: false },
          min_sqs: { type: "integer" as const, description: "Minimum SQS score required (0-100)." },
        },
      },
      DoResponse: {
        type: "object" as const,
        description: "Response from POST /v1/do. Core execution data in `result`, trust metadata in `meta`.",
        properties: {
          result: {
            type: "object" as const,
            description: "What the caller asked for — the execution result.",
            properties: {
              transaction_id: { type: "string" as const, format: "uuid" },
              status: { type: "string" as const, enum: ["completed", "executing", "failed"] },
              capability_used: { type: "string" as const },
              price_cents: { type: "integer" as const },
              latency_ms: { type: "integer" as const },
              wallet_balance_cents: { type: "integer" as const, description: "Remaining wallet balance (authenticated only)." },
              output: { type: "object" as const, nullable: true },
              provenance: {
                type: "object" as const,
                properties: {
                  source: { type: "string" as const },
                  fetched_at: { type: "string" as const, format: "date-time" },
                },
              },
            },
          },
          meta: {
            type: "object" as const,
            description: "Trust layer metadata — quality scores, execution guidance, audit trail.",
            properties: {
              quality: {
                type: "object" as const,
                properties: {
                  sqs: { type: "number" as const },
                  label: { type: "string" as const },
                  quality_profile: { type: "object" as const },
                  reliability_profile: { type: "object" as const },
                  trend: { type: "string" as const },
                },
              },
              execution_guidance: {
                type: "object" as const,
                properties: {
                  usable: { type: "boolean" as const },
                  strategy: { type: "string" as const },
                  confidence_after_strategy: { type: "number" as const },
                },
              },
              audit: { type: "object" as const, description: "EU AI Act compliant audit trail." },
            },
          },
          free_tier: { type: "boolean" as const, description: "True for unauthenticated free-tier calls." },
          usage: { type: "object" as const, description: "Free-tier usage counter (unauthenticated only)." },
          upgrade: { type: "object" as const, description: "Upgrade prompt with paid capability examples (free-tier only)." },
        },
      },
    },
  },
  paths: {
    // ─── Capabilities ──────────────────────────────────────────────────
    "/v1/capabilities": {
      get: {
        tags: ["capabilities"],
        summary: "List all capabilities",
        description: "Returns the full catalog of active capabilities with their current SQS scores, pricing, and input schemas. No authentication required.",
        responses: {
          "200": {
            description: "Capability catalog",
            content: {
              "application/json": {
                schema: {
                  type: "object" as const,
                  properties: {
                    capabilities: { type: "array" as const, items: { $ref: "#/components/schemas/Capability" } },
                  },
                },
              },
            },
          },
        },
      },
    },
    "/v1/capabilities/{slug}": {
      get: {
        tags: ["capabilities"],
        summary: "Get a single capability",
        description: "Returns detailed information for a specific capability including its input/output schema, pricing, and which solutions include it.",
        parameters: [{ name: "slug", in: "path" as const, required: true, schema: { type: "string" as const }, example: "iban-validate" }],
        responses: {
          "200": { description: "Capability details", content: { "application/json": { schema: { $ref: "#/components/schemas/Capability" } } } },
          "404": errorResponse("not_found", "Capability not found."),
        },
      },
    },

    // ─── Solutions ─────────────────────────────────────────────────────
    "/v1/solutions": {
      get: {
        tags: ["solutions"],
        summary: "List all solutions",
        description: "Returns all active bundled solutions with pricing, step counts, and SQS scores.",
        parameters: [{ name: "category", in: "query" as const, required: false, schema: { type: "string" as const }, description: "Filter by category slug" }],
        responses: {
          "200": {
            description: "Solution catalog",
            content: {
              "application/json": {
                schema: {
                  type: "object" as const,
                  properties: {
                    solutions: { type: "array" as const, items: { $ref: "#/components/schemas/Solution" } },
                    total: { type: "integer" as const },
                  },
                },
              },
            },
          },
        },
      },
    },
    "/v1/solutions/{slug}": {
      get: {
        tags: ["solutions"],
        summary: "Get a single solution",
        description: "Returns detailed solution information including individual steps, input mapping, pricing breakdown, and related solutions.",
        parameters: [{ name: "slug", in: "path" as const, required: true, schema: { type: "string" as const }, example: "kyb-essentials-se" }],
        responses: {
          "200": { description: "Solution details", content: { "application/json": { schema: { $ref: "#/components/schemas/Solution" } } } },
          "404": errorResponse("not_found", "Solution not found."),
        },
      },
    },

    // ─── Execute ───────────────────────────────────────────────────────
    "/v1/do": {
      post: {
        tags: ["capabilities"],
        summary: "Execute a capability",
        description:
          "Execute a Strale capability. Two patterns:\n\n" +
          "1. **Direct execution**: Provide `capability_slug` and `inputs` to execute a specific capability.\n" +
          "2. **Semantic matching**: Provide `task` as a natural language description — the system finds and executes the best matching capability.\n\n" +
          "Free-tier capabilities (iban-validate, email-validate, dns-lookup, json-repair, url-to-markdown) work without authentication.\n\n" +
          "For long-running capabilities (>10s), the response has `status: \"pending\"` with a `transaction_id`. Poll `GET /v1/transactions/{id}` until `status` is `completed` or `failed`.\n\n" +
          "Supports `Idempotency-Key` header for safe retries.",
        security: [{ BearerAuth: [] }, {}],
        "x-ratelimit": { limit: 10, window: "1s", scope: "per API key" },
        requestBody: {
          required: true,
          content: { "application/json": { schema: { $ref: "#/components/schemas/DoRequest" } } },
        },
        responses: {
          "200": {
            description: "Capability executed successfully (synchronous).",
            headers: {
              "X-Credits-Remaining": { description: "Wallet balance in EUR cents after this transaction", schema: { type: "integer" as const } },
              "X-Cost-Cents": { description: "Cost of this execution in EUR cents", schema: { type: "integer" as const } },
              "X-Credits-Currency": { description: "Currency for credit values (always EUR)", schema: { type: "string" as const, example: "EUR" } },
            },
            content: { "application/json": { schema: { $ref: "#/components/schemas/DoResponse" } } },
          },
          "202": {
            description: "Capability execution started (asynchronous). Poll GET /v1/transactions/{transaction_id} for result.",
            content: {
              "application/json": {
                schema: {
                  type: "object" as const,
                  properties: {
                    transaction_id: { type: "string" as const, format: "uuid" },
                    status: { type: "string" as const, enum: ["pending"] },
                    capability_used: { type: "string" as const },
                    price_cents: { type: "integer" as const },
                    poll_url: { type: "string" as const },
                  },
                },
              },
            },
          },
          "400": errorResponse("invalid_request", "Missing task or capability_slug."),
          "401": errorResponse("unauthorized", "Authentication required for paid capabilities."),
          "402": errorResponse("insufficient_balance", "Insufficient wallet balance. Top up at the included checkout URL."),
          "404": errorResponse("no_matching_capability", "No capability matches the task within budget."),
          "429": errorResponse("rate_limited", "Rate limit exceeded."),
          "503": errorResponse("capability_unavailable", "Capability SQS below platform floor."),
        },
      },
    },

    // ─── Auth ──────────────────────────────────────────────────────────
    "/v1/auth/register": {
      post: {
        tags: ["auth"],
        summary: "Register a new account",
        description: "Creates a new Strale account with €2.00 trial credits (no card required). Returns the API key — store it securely, it is shown only once.",
        "x-ratelimit": { limit: 3, window: "1m", scope: "per IP" },
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object" as const,
                required: ["email"],
                properties: {
                  email: { type: "string" as const, format: "email", example: "dev@example.com" },
                  name: { type: "string" as const, example: "Jane Developer" },
                },
              },
            },
          },
        },
        responses: {
          "201": {
            description: "Account created",
            content: {
              "application/json": {
                schema: {
                  type: "object" as const,
                  properties: {
                    user_id: { type: "string" as const, format: "uuid" },
                    email: { type: "string" as const },
                    api_key: { type: "string" as const, description: "Shown once. Starts with sk_live_." },
                    wallet_balance_cents: { type: "integer" as const, example: 200 },
                  },
                },
              },
            },
          },
          "400": errorResponse("invalid_request", "Invalid email."),
          "409": errorResponse("invalid_request", "Email already registered."),
        },
      },
    },
    "/v1/auth/api-key": {
      post: {
        tags: ["auth"],
        summary: "Regenerate API key",
        description: "Generates a new API key and invalidates the current one.",
        security: [{ BearerAuth: [] }],
        responses: {
          "200": {
            description: "New API key",
            content: {
              "application/json": {
                schema: {
                  type: "object" as const,
                  properties: {
                    api_key: { type: "string" as const },
                    key_prefix: { type: "string" as const },
                  },
                },
              },
            },
          },
        },
      },
    },

    // ─── Wallet ────────────────────────────────────────────────────────
    "/v1/wallet/balance": {
      get: {
        tags: ["wallet"],
        summary: "Get wallet balance",
        security: [{ BearerAuth: [] }],
        "x-ratelimit": { limit: 5, window: "1s", scope: "per API key" },
        responses: {
          "200": {
            description: "Current balance",
            content: {
              "application/json": {
                schema: {
                  type: "object" as const,
                  properties: {
                    balance_cents: { type: "integer" as const, description: "Balance in EUR cents", example: 1850 },
                    currency: { type: "string" as const, example: "EUR" },
                  },
                },
              },
            },
          },
        },
      },
    },
    "/v1/wallet/topup": {
      post: {
        tags: ["wallet"],
        summary: "Create a top-up checkout session",
        description: "Creates a Stripe Checkout session for wallet top-up. Minimum €10.00.",
        security: [{ BearerAuth: [] }],
        "x-ratelimit": { limit: 5, window: "1s", scope: "per API key" },
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object" as const,
                required: ["amount_cents"],
                properties: {
                  amount_cents: { type: "integer" as const, minimum: 1000, description: "Amount in EUR cents (minimum 1000 = €10.00)", example: 2000 },
                },
              },
            },
          },
        },
        responses: {
          "200": {
            description: "Checkout session created",
            content: {
              "application/json": {
                schema: {
                  type: "object" as const,
                  properties: {
                    checkout_url: { type: "string" as const, format: "uri" },
                    session_id: { type: "string" as const },
                    amount_cents: { type: "integer" as const },
                  },
                },
              },
            },
          },
          "400": errorResponse("invalid_request", "amount_cents must be >= 1000"),
        },
      },
    },
    "/v1/wallet/transactions": {
      get: {
        tags: ["wallet"],
        summary: "List wallet transactions",
        description: "Returns wallet top-up and credit history.",
        security: [{ BearerAuth: [] }],
        "x-ratelimit": { limit: 5, window: "1s", scope: "per API key" },
        responses: {
          "200": {
            description: "Wallet transaction history",
            content: {
              "application/json": {
                schema: {
                  type: "object" as const,
                  properties: {
                    transactions: {
                      type: "array" as const,
                      items: {
                        type: "object" as const,
                        properties: {
                          id: { type: "string" as const, format: "uuid" },
                          amount_cents: { type: "integer" as const },
                          type: { type: "string" as const },
                          description: { type: "string" as const },
                          created_at: { type: "string" as const, format: "date-time" },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },

    // ─── Transactions ──────────────────────────────────────────────────
    "/v1/transactions": {
      get: {
        tags: ["transactions"],
        summary: "List capability transactions",
        description: "Returns history of capability executions for the authenticated user.",
        security: [{ BearerAuth: [] }],
        "x-ratelimit": { limit: 5, window: "1s", scope: "per API key" },
        responses: {
          "200": {
            description: "Transaction history",
            content: {
              "application/json": {
                schema: {
                  type: "object" as const,
                  properties: {
                    transactions: {
                      type: "array" as const,
                      items: {
                        type: "object" as const,
                        properties: {
                          id: { type: "string" as const, format: "uuid" },
                          status: { type: "string" as const, enum: ["completed", "failed", "pending"] },
                          capability_slug: { type: "string" as const },
                          price_cents: { type: "integer" as const },
                          latency_ms: { type: "integer" as const },
                          created_at: { type: "string" as const, format: "date-time" },
                          completed_at: { type: "string" as const, format: "date-time", nullable: true },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    "/v1/transactions/{id}": {
      get: {
        tags: ["transactions"],
        summary: "Get transaction detail",
        description: "Returns full transaction detail including output, provenance, and audit trail. Used for polling async executions.",
        security: [{ BearerAuth: [] }, {}],
        parameters: [{ name: "id", in: "path" as const, required: true, schema: { type: "string" as const, format: "uuid" } }],
        responses: {
          "200": {
            description: "Transaction detail",
            content: {
              "application/json": {
                schema: {
                  type: "object" as const,
                  properties: {
                    id: { type: "string" as const, format: "uuid" },
                    status: { type: "string" as const, enum: ["completed", "failed", "pending"] },
                    capability_slug: { type: "string" as const },
                    output: { type: "object" as const, nullable: true },
                    error: { type: "string" as const, nullable: true },
                    price_cents: { type: "integer" as const },
                    latency_ms: { type: "integer" as const },
                    provenance: { type: "object" as const },
                    transparency_marker: { type: "string" as const },
                    data_jurisdiction: { type: "string" as const },
                    created_at: { type: "string" as const, format: "date-time" },
                    completed_at: { type: "string" as const, format: "date-time", nullable: true },
                  },
                },
              },
            },
          },
          "404": errorResponse("not_found", "Transaction not found."),
        },
      },
    },

    // ─── Verification ─────────────────────────────────────────────────
    "/v1/verify/{transactionId}": {
      get: {
        tags: ["trust"],
        summary: "Verify transaction integrity",
        description: "Verify the integrity of a transaction's audit trail by recomputing its SHA-256 hash and walking the hash chain backward to genesis. Public, no auth required.",
        parameters: [
          { name: "transactionId", in: "path" as const, required: true, schema: { type: "string" as const, format: "uuid" } },
          { name: "depth", in: "query" as const, required: false, schema: { type: "integer" as const, minimum: 1, maximum: 200, default: 50 }, description: "Max chain depth to verify (default 50, max 200)" },
        ],
        responses: {
          "200": {
            description: "Verification result",
            content: {
              "application/json": {
                schema: {
                  type: "object" as const,
                  properties: {
                    transaction_id: { type: "string" as const, format: "uuid" },
                    verified: { type: "boolean" as const, description: "True if hash is valid and chain has no broken links" },
                    hash_valid: { type: "boolean" as const, description: "True if recomputed hash matches stored hash" },
                    chain: {
                      type: "object" as const,
                      properties: {
                        length: { type: "integer" as const },
                        verified_links: { type: "integer" as const },
                        broken_links: { type: "integer" as const },
                        reaches_genesis: { type: "boolean" as const },
                        chain_start_date: { type: "string" as const, format: "date", nullable: true },
                        chain_end_date: { type: "string" as const, format: "date" },
                        max_depth: { type: "integer" as const },
                      },
                    },
                    transaction_metadata: {
                      type: "object" as const,
                      properties: {
                        created_at: { type: "string" as const, format: "date-time" },
                        capability_slug: { type: "string" as const, nullable: true },
                        transparency_marker: { type: "string" as const },
                        data_jurisdiction: { type: "string" as const },
                        status: { type: "string" as const },
                      },
                    },
                    methodology_url: { type: "string" as const, format: "uri" },
                  },
                },
              },
            },
          },
          "404": errorResponse("not_found", "Transaction not found."),
        },
      },
    },

    // ─── Trust / Quality ──────────────────────────────────────────────
    "/v1/quality/{slug}": {
      get: {
        tags: ["trust"],
        summary: "Get capability quality score",
        description: "Returns the dual-profile SQS score for a capability: Quality Profile (code quality) and Reliability Profile (operational health). Public, no auth required. Cached for 5 minutes.",
        parameters: [{ name: "slug", in: "path" as const, required: true, schema: { type: "string" as const }, example: "iban-validate" }],
        responses: {
          "200": {
            description: "Quality score data",
            content: {
              "application/json": {
                schema: {
                  type: "object" as const,
                  properties: {
                    capability: { type: "string" as const },
                    sqs: {
                      type: "object" as const,
                      properties: {
                        score: { type: "number" as const },
                        label: { type: "string" as const },
                        trend: { type: "string" as const },
                      },
                    },
                    quality_profile: {
                      type: "object" as const,
                      properties: {
                        grade: { type: "string" as const },
                        score: { type: "number" as const },
                        factors: { type: "array" as const, items: { type: "object" as const } },
                      },
                    },
                    reliability_profile: {
                      type: "object" as const,
                      properties: {
                        grade: { type: "string" as const },
                        score: { type: "number" as const },
                        capability_type: { type: "string" as const },
                        factors: { type: "array" as const, items: { type: "object" as const } },
                      },
                    },
                    pending: { type: "boolean" as const },
                  },
                },
              },
            },
          },
          "404": errorResponse("not_found", "Capability not found."),
        },
      },
    },

    // ─── Suggest ──────────────────────────────────────────────────────
    "/v1/suggest": {
      post: {
        tags: ["suggest"],
        summary: "AI capability suggestion",
        description: "Uses AI to find the best capability or solution for a natural language query. Returns ranked suggestions with confidence scores.",
        "x-ratelimit": { limit: 20, window: "1s", scope: "per IP" },
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object" as const,
                required: ["query"],
                properties: {
                  query: { type: "string" as const, maxLength: 500, example: "validate a Swedish company's VAT number" },
                  limit: { type: "integer" as const, minimum: 1, maximum: 10, default: 3 },
                },
              },
            },
          },
        },
        responses: {
          "200": {
            description: "Suggestions",
            content: {
              "application/json": {
                schema: {
                  type: "object" as const,
                  properties: {
                    query: { type: "string" as const },
                    suggestions: {
                      type: "array" as const,
                      items: {
                        type: "object" as const,
                        properties: {
                          slug: { type: "string" as const },
                          name: { type: "string" as const },
                          type: { type: "string" as const, enum: ["capability", "solution"] },
                          description: { type: "string" as const },
                          price_cents: { type: "integer" as const, nullable: true },
                          confidence: { type: "number" as const },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          "400": errorResponse("invalid_request", "Missing query."),
        },
      },
    },
    "/v1/suggest/typeahead": {
      get: {
        tags: ["suggest"],
        summary: "Typeahead search",
        description: "Fast keyword-based autocomplete for capability and solution names.",
        "x-ratelimit": { limit: 30, window: "1s", scope: "per IP" },
        parameters: [
          { name: "q", in: "query" as const, required: true, schema: { type: "string" as const, minLength: 2 }, description: "Search query" },
          { name: "limit", in: "query" as const, required: false, schema: { type: "integer" as const, minimum: 1, maximum: 10, default: 6 } },
          { name: "geo", in: "query" as const, required: false, schema: { type: "string" as const }, description: "Geography filter" },
          { name: "type", in: "query" as const, required: false, schema: { type: "string" as const, enum: ["capability", "solution"] } },
        ],
        responses: {
          "200": {
            description: "Typeahead matches",
            content: {
              "application/json": {
                schema: {
                  type: "object" as const,
                  properties: {
                    matches: {
                      type: "array" as const,
                      items: {
                        type: "object" as const,
                        properties: {
                          slug: { type: "string" as const },
                          name: { type: "string" as const },
                          type: { type: "string" as const },
                          price_cents: { type: "integer" as const, nullable: true },
                          category: { type: "string" as const },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },

    // ─── Discovery ────────────────────────────────────────────────────
    "/.well-known/agent-card.json": {
      get: {
        tags: ["discovery"],
        summary: "A2A Agent Card",
        description: "Dynamic Agent Card for the A2A (Agent-to-Agent) protocol. Lists all capabilities as agent skills.",
        responses: { "200": { description: "Agent Card JSON" } },
      },
    },
    "/health": {
      get: {
        tags: ["discovery"],
        summary: "Health check",
        responses: { "200": { description: "Service healthy", content: { "application/json": { schema: { type: "object" as const, properties: { status: { type: "string" as const, example: "ok" } } } } } } },
      },
    },
  },
};
