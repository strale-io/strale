import { STATIC_FACTS } from "./lib/platform-facts.js";
import { additionalPublicPaths } from "./openapi-public-paths.js";
/**
 * OpenAPI 3.1.0 specification for the Strale API.
 *
 * Serves at GET /openapi.json. Covers all public and authenticated endpoints.
 * Internal admin, test management, and onboarding endpoints are excluded.
 */

const errorSchema = {
  type: "object" as const,
  properties: {
    error_code: { type: "string" as const, enum: ["insufficient_balance", "no_matching_capability", "capability_unavailable", "execution_failed", "timeout_exceeded", "invalid_request", "rate_limited", "spend_cap_exceeded", "key_hourly_cap_exceeded", "key_total_cap_exceeded", "primary_key_required", "active_key_limit_exceeded", "unauthorized", "not_found", "capability_degraded", "below_quality_threshold", "freshness_check_failed", "latency_threshold_exceeded", "budget_exceeded", "locked", "token_expired", "legacy_token_sunset", "transaction_finalization_failed", "idempotency_key_reused", "request_in_progress", "migration_failed"] },
    message: { type: "string" as const },
    details: {
      type: "object" as const,
      description: "Additive recovery guidance; stable error_code and HTTP status are unchanged. Caller-fixable errors include fix. Service failures include retryable and next_step. Key caps are not automatically retryable.",
      additionalProperties: true,
      properties: {
        fix: { type: "string", minLength: 1, description: "One imperative sentence naming the field, limit or next step to correct before retrying." },
        field: { type: "string", description: "Input field to correct, when known." },
        retryable: { type: "boolean", description: "Whether retrying unchanged input after backoff can help; false means an explicit change is needed." },
        next_step: { type: "string", description: "Safe next step for a failure outside the caller's control." },
        retry_after_seconds: { type: "integer", minimum: 0 },
        required_fields: { type: "array", items: { type: "string" }, description: "Only fields actually required by the failed constraint; optional fields are not inferred as required." },
        any_of: { type: "array", items: { type: "object", additionalProperties: true }, description: "Alternative input-schema groups; at least one must match." },
        one_of: { type: "array", items: { type: "object", additionalProperties: true }, description: "Alternative input-schema groups; exactly one must match." },
        min_topup_cents: { type: "integer", minimum: 0 },
        docs_url: { type: "string", format: "uri" },
        spent_cents: { type: "integer" }, requested_cents: { type: "integer" }, limit_cents: { type: "integer" },
      },
    },
  },
  required: ["error_code", "message"],
};

const errorResponse = (code: string, message: string) => ({
  description: message,
  content: { "application/json": { schema: errorSchema, example: { error_code: code, message } } },
});

const suggestRecommendationSchema = {
  type: "object" as const,
  required: ["type", "slug", "name", "description", "match_reason", "price_cents"],
  properties: {
    type: { type: "string" as const, enum: ["capability", "solution"] },
    slug: { type: "string" as const },
    name: { type: "string" as const },
    description: { type: "string" as const },
    match_reason: { type: "string" as const, maxLength: 240 },
    price_cents: { type: "integer" as const },
    category: { type: "string" as const },
    geography: { type: "string" as const },
    badge: { type: "string" as const },
    step_count: { type: "integer" as const },
    steps: { type: "array" as const, items: {
      type: "object" as const,
      properties: {
        name: { type: "string" as const },
        capability_slug: { type: "string" as const },
        parallel_group: { type: "integer" as const, nullable: true },
      },
    } },
    part_of_solution: { type: "object" as const, nullable: true, properties: {
      slug: { type: "string" as const }, name: { type: "string" as const },
      price_cents: { type: "integer" as const }, extra_description: { type: "string" as const },
    } },
    trust: { type: "object" as const, properties: {
      badge: { type: "string" as const }, badge_label: { type: "string" as const },
      avg_response_time_ms: { type: "number" as const, nullable: true },
      tests_passing: { type: "integer" as const }, tests_total: { type: "integer" as const },
      last_tested_at: { type: "string" as const, format: "date-time", nullable: true },
      data_source: { type: "string" as const, enum: ["internal_testing", "blended", "customer_transactions"] },
    } },
  },
};

const keyCapSchema = { type: ["integer", "null"], minimum: 0, maximum: 2147483647 };
const keyInputSchema = {
  type: "object", additionalProperties: false,
  properties: { label: { type: "string", minLength: 1, maxLength: 64, pattern: "^[^\\u0000-\\u001f\\u007f-\\u009f]*$", description: "Trimmed; 1–64 characters after trimming; control characters rejected before trimming." }, max_spend_per_hour_cents: keyCapSchema, max_spend_total_cents: keyCapSchema },
};
const keyMetadataSchema = {
  type: "object", required: ["id", "key_prefix", "label", "max_spend_per_hour_cents", "max_spend_total_cents", "created_at", "revoked_at", "last_used_at"],
  properties: {
    id: { type: "string", format: "uuid" }, key_prefix: { type: "string" }, label: { type: "string" },
    max_spend_per_hour_cents: keyCapSchema, max_spend_total_cents: keyCapSchema,
    created_at: { type: "string", format: "date-time" },
    revoked_at: { type: ["string", "null"], format: "date-time" }, last_used_at: { type: ["string", "null"], format: "date-time" },
  },
};
const keyResponse = (description: string, schema: object) => ({ description, content: { "application/json": { schema } } });
const primaryKeyError = { "403": errorResponse("primary_key_required", "Use the account's primary key for this action") };
const keyErrors = {
  ...primaryKeyError,
  "400": errorResponse("invalid_request", "Supply a valid label and non-negative integer caps in cents, or null to remove a cap."),
  "401": errorResponse("unauthorized", "Invalid API key."),
  "429": errorResponse("rate_limited", "Key management is limited to 5 requests per second per account."),
};

export const openApiSpec = {
  openapi: "3.1.0",
  info: {
    title: "Strale API",
    "x-guidance": "Browse x402 endpoints below and send the required input; payment is requested per call.",
    version: "1.0.0",
    description:
      "Give your agent a new tool without opening another provider account. Search and read the web, read documents, check details and look up companies through one connection. Pay per call with an API key or, on eligible tools, an x402 wallet. Browse /v1/platform/facts for live coverage.",
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
    { name: "trust", description: "Tool sources, limitations and test history" },
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
          freshness_level: { type: "string" as const, description: "Test data freshness", enum: ["fresh", "aging", "stale", "expired", "unverified"] },
          last_tested_at: { type: "string" as const, format: "date-time", nullable: true, description: "When this capability was last tested" },
          cost_class: {
            type: "string" as const,
            nullable: true,
            enum: ["free_unlimited", "free_quota", "paid_with_free_tier", "paid_prepaid", "paid_subscription"],
            description: "Per-capability cost classification (Phase A0b, DEC-20260512-A). NULL means the capability has not yet been classified.",
          },
          last_customer_call_at: {
            type: "string" as const,
            format: "date-time",
            nullable: true,
            description: "Timestamp of the most recent customer-initiated completed invocation. Excludes internal test runs. Used by clients to distinguish 'paid capability awaiting first customer call' from 'capability with genuine quality issues.'",
          },
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
          freshness_level: { type: "string" as const, description: "Worst step freshness", enum: ["fresh", "aging", "stale", "expired", "unverified"] },
          last_tested_at: { type: "string" as const, format: "date-time", nullable: true, description: "Oldest step last-tested timestamp" },
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
          timeout_seconds: { type: "integer" as const, description: "Execution budget for synchronous paid wallet calls, in seconds (default 30; effective minimum 5 and maximum 60). Positive values below 5, including fractional values from existing clients, are clamped to 5; values above 60 are clamped to 60. Starts immediately before execution, including retries, and also bounds Anthropic SDK calls. On expiry: HTTP 503 timeout_exceeded, no wallet charge, reservation released. Late executor completion cannot charge. Does not change free-tier, async or solution execution. An executing Idempotency-Key returns HTTP 409 request_in_progress with details.retryable=true and details.retry_after_seconds=2; a completed key replays HTTP 200 with meta.idempotency_replay=true; use a new key to attempt execution again." },
          dry_run: { type: "boolean" as const, description: "If true, returns matched capability without executing.", default: false },
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
            description: "Per-call audit trail.",
            properties: {
              audit: { type: "object" as const, description: "EU AI Act compliant audit trail." },
            },
          },
          free_tier: { type: "boolean" as const, description: `True for unauthenticated free-tier calls. Anonymous allowance: ${STATIC_FACTS.free_tier_monthly_limit} calls per calendar month (UTC) per IP, with an hourly anti-abuse guard. Authenticated free tools have no wallet debit and retain normal rate limits. Monthly usage is returned as calls_this_month, monthly_limit and resets_at; X-RateLimit-Limit/Remaining/Reset describe the allowance (Reset is Unix seconds).` },
          usage: { type: "object" as const, description: "Free-tier usage counter (unauthenticated only)." },
          upgrade: { type: "object" as const, description: "Upgrade prompt with paid capability examples (free-tier only)." },
        },
      },
    },
  },
  paths: {
    ...additionalPublicPaths,
    "/v1/api-keys": {
      post: {
        tags: ["auth"], summary: "Create an additional API key",
        description: "The primary key remains unchanged. api_key is returned once; store it securely. Null/omitted caps are unlimited; zero blocks paid calls. Primary key required. Additional keys may spend and read, but cannot manage the account. At most 25 active additional keys per account.",
        security: [{ BearerAuth: [] }],
        requestBody: { required: true, content: { "application/json": { schema: { ...keyInputSchema, required: ["label"] } } } },
        responses: { ...keyErrors, "409": errorResponse("active_key_limit_exceeded", "At most 25 active additional keys are allowed. Revoke an unused key first"), "201": keyResponse("Key created; response has Cache-Control: no-store", { ...keyMetadataSchema, required: [...keyMetadataSchema.required, "api_key"], properties: { ...keyMetadataSchema.properties, api_key: { type: "string", description: "Shown once" } } }), "404": errorResponse("not_found", "Wallet not found.") },
      },
      get: {
        tags: ["auth"], summary: "List additional keys and their spending",
        description: "Primary key required. Bounded at 25 active (non-revoked) keys; revoked keys are excluded. Never includes plaintext keys or hashes. Spending is net ledger purchases, including open reservations, less refunds linked to the original purchase; the rolling hour uses purchase time. Last-used writes occur at most once per minute per key.",
        security: [{ BearerAuth: [] }],
        responses: { ...keyErrors, "200": keyResponse("Additional keys", { type: "object", required: ["keys"], properties: { keys: { type: "array", maxItems: 25, items: { ...keyMetadataSchema, required: [...keyMetadataSchema.required, "spent_hour_cents", "spent_total_cents"], properties: { ...keyMetadataSchema.properties, spent_hour_cents: { type: "integer" }, spent_total_cents: { type: "integer" } } } } } }) },
      },
    },
    "/v1/api-keys/{id}": {
      patch: {
        tags: ["auth"], summary: "Update additional key label or caps",
      parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }],

        description: "Primary key required. Omitted fields stay unchanged; null removes a cap. Lowering below existing spending blocks subsequent paid calls. Revoked keys stay revoked.",
        security: [{ BearerAuth: [] }],
        requestBody: { required: true, content: { "application/json": { schema: { ...keyInputSchema, minProperties: 1 } } } },
        responses: { ...keyErrors, "200": keyResponse("Updated key metadata", keyMetadataSchema), "404": errorResponse("not_found", "Key not found.") },
      },
      delete: {
        tags: ["auth"], summary: "Revoke an additional key",
      parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }],

        description: "Primary key required. Idempotent. The primary key cannot be revoked through this API and remains usable/recoverable. A call already holding the wallet lock may finish first. Revoked keys return the same 401 as unknown keys.",
        security: [{ BearerAuth: [] }],
        responses: { ...keyErrors, "200": keyResponse("Revoked key metadata", keyMetadataSchema), "404": errorResponse("not_found", "Key not found.") },
      },
    },
    // ─── Capabilities ──────────────────────────────────────────────────
    "/v1/capabilities": {
      get: {
        tags: ["capabilities"],
        summary: "List all capabilities",
        description: "Returns the full catalog of active capabilities with their pricing and input schemas. No authentication required.",
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
        description: "Returns all active bundled solutions with pricing and step counts.",
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
          "409": {
            description: "The original request is still running, or the key identifies different work.",
            content: { "application/json": { schema: errorSchema, examples: {
              in_progress: { value: { error_code: "request_in_progress", message: "The original request is still running.",
                details: { retryable: true, retry_after_seconds: 2, fix: "The original request is still running; retry with the same Idempotency-Key after 2 seconds." } } },
              different_request: { value: { error_code: "idempotency_key_reused", message: "This Idempotency-Key was already used for a different request.",
                details: { fix: "Send a new Idempotency-Key for different inputs or a different capability." } } },
            } } },
          },
          "429": errorResponse("rate_limited", "Rate limit exceeded."),
          "503": errorResponse("capability_unavailable", "Capability is temporarily unavailable (circuit breaker open)."),
        },
      },
    },

    // ─── Web3 Assurance ────────────────────────────────────────────────
    "/v1/web3-assurance": {
      post: {
        tags: ["web3-assurance"],
        summary: "Decision-ready answer about an on-chain counterparty",
        description:
          "Sister product to Payee Assurance for on-chain targets (wallet, contract, token, DeFi protocol, bridge). Returns a verdict (proceed/review/block/insufficient_evidence), reason_codes (UPPERCASE_SNAKE_CASE), critical_flags, suggested_action, evidence map, and a sidecar audit_url. " +
          "Two modes: `outbound` (agent vetting recipient pre-payment, full evaluator set, 8s budget — default) and `reverse-call` (x402 service publisher gating an inbound buyer in real-time, critical evaluators only, sub-second SLA).",
        security: [{ BearerAuth: [] }, {}],
        "x-ratelimit": { limit: 10, window: "1s", scope: "per API key" },
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object" as const,
                required: ["target"],
                properties: {
                  target: { type: "string" as const, description: "Wallet address (0x... or Solana), contract, token, protocol slug, or domain.", example: "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045" },
                  target_type: { type: "string" as const, enum: ["wallet", "contract", "token", "protocol", "bridge", "domain"] },
                  chain: { type: "string" as const, example: "ethereum" },
                  action: { type: "string" as const, enum: ["send_payment", "swap", "stake", "mint", "interact", "bridge"] },
                  amount_usd: { type: "number" as const },
                  mode: { type: "string" as const, enum: ["outbound", "reverse-call"], default: "outbound" },
                  agent_id: { type: "string" as const, description: "Optional ERC-8004 agent identifier." },
                  caller_jurisdiction: { type: "string" as const, description: "Optional ISO country code (US, EU, UK, etc.). Adds a jurisdiction-specific note to mixer findings; it does not change the verdict." },
                },
              },
            },
          },
        },
        responses: {
          "200": {
            description: "Decision-ready answer.",
            content: {
              "application/json": {
                schema: {
                  type: "object" as const,
                  properties: {
                    target: { type: "string" as const },
                    target_type: { type: "string" as const },
                    chain: { type: "string" as const },
                    mode: { type: "string" as const, enum: ["outbound", "reverse-call"] },
                    verdict: { type: "string" as const, enum: ["proceed", "review", "block", "insufficient_evidence"] },
                    reason_codes: { type: "array" as const, items: { type: "string" as const, example: "MIXER_DELISTED_ELEVATED" } },
                    confidence: { type: "number" as const, minimum: 0, maximum: 1 },
                    evidence_completeness: { type: "string" as const, enum: ["complete", "partial", "minimal"] },
                    evidence_status: { type: "string" as const, enum: ["corroborated", "partial", "contradictory", "single_source", "minimal"] },
                    critical_flags: { type: "array" as const, items: { type: "string" as const } },
                    suggested_action: { type: "string" as const },
                    expires_at: { type: "string" as const, format: "date-time" },
                    evidence: { type: "object" as const, additionalProperties: true },
                    source_quality: { type: "array" as const, items: { type: "object" as const, properties: { source: { type: "string" as const }, ms: { type: "integer" as const }, ok: { type: "boolean" as const } } } },
                    audit_url: { type: "string" as const, format: "uri" },
                    sla: { type: "object" as const, properties: { mode: { type: "string" as const }, p99_ms: { type: "integer" as const }, p50_ms: { type: "integer" as const } } },
                    meta: { type: "object" as const, properties: { api_version: { type: "string" as const }, fetched_at: { type: "string" as const, format: "date-time" }, response_ms: { type: "integer" as const } } },
                  },
                },
              },
            },
          },
          "400": errorResponse("invalid_request", "Missing or invalid target / mode."),
          "401": errorResponse("unauthorized", "Authentication required."),
          "429": errorResponse("rate_limited", "Rate limit exceeded."),
        },
      },
    },

    // ─── Auth ──────────────────────────────────────────────────────────
    "/v1/auth/register": {
      post: {
        tags: ["auth"],
        summary: "Register a new account",
        description: "Creates a new Strale account and returns the API key — store it securely, it is shown only once. Trial credits (€2.00, no card required) are granted once per email address; when they are withheld the account is still created and `wallet_balance_cents` is 0 with a `trial_credits` object explaining why. Read the granted amount from the response rather than assuming the default.",
        "x-ratelimit": { limit: 3, window: "1m", scope: "per IP" },
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object" as const,
                required: ["email"],
                properties: {
                  email: { type: "string" as const, format: "email", example: "dev@yourcompany.com" },
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
                    wallet_balance_cents: {
                      type: "integer" as const,
                      example: 200,
                      description: "What the wallet was actually opened with. 0 when trial credits were withheld.",
                    },
                    trial_credits: {
                      type: "object" as const,
                      description: "Present only when no trial credit was granted. The account is still usable; top up to make paid calls.",
                      properties: {
                        granted: { type: "boolean" as const, example: false },
                        reason: {
                          type: "string" as const,
                          enum: ["trial_not_available"],
                          description:
                            "Deliberately undifferentiated. Registration does not verify the mailbox, so a more specific reason would tell anyone who registers an address whether it had previously held an account.",
                        },
                        message: { type: "string" as const },
                      },
                    },
                  },
                },
              },
            },
          },
          "400": errorResponse(
            "invalid_request",
            "Invalid email, a disposable-mail domain, or a domain with no mail exchanger. `details.reason` carries disposable_domain or no_mail_exchanger.",
          ),
          "409": errorResponse("invalid_request", "Email already registered."),
        },
      },
    },
    "/v1/auth/recover": {
      post: {
        tags: ["auth"],
        summary: "Request an API key recovery code",
        description:
          "Sends a single-use recovery code to the account's email address. Your current API key keeps working — nothing is rotated until the code is redeemed at /v1/auth/recover/confirm. The response body and status are identical whether or not an account exists. Response TIMING is not equalised, so this is not a constant-time oracle.",
        "x-ratelimit": { limit: 2, window: "5m", scope: "per IP" },
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object" as const,
                required: ["email"],
                properties: {
                  email: { type: "string" as const, format: "email" },
                },
              },
            },
          },
        },
        responses: {
          "200": {
            description: "Accepted (whether or not an account exists)",
            content: {
              "application/json": {
                schema: {
                  type: "object" as const,
                  properties: {
                    message: { type: "string" as const },
                    expires_in_minutes: { type: "integer" as const, example: 30 },
                  },
                },
              },
            },
          },
          "400": errorResponse("invalid_request", "A valid email address is required."),
        },
      },
    },
    "/v1/auth/recover/confirm": {
      post: {
        tags: ["auth"],
        summary: "Redeem a recovery code and rotate the API key",
        description:
          "Redeems the single-use code sent by /v1/auth/recover. Only the primary key rotates; additional keys survive and can still spend up to their caps. Use the new primary key to review GET /v1/api-keys and revoke unused or unrecognized keys with DELETE /v1/api-keys/{id}. The previous primary key stops working the moment this returns 200. Codes expire 30 minutes after issue. Requesting another does NOT invalidate an outstanding one — several can be live at once, each single-use — because an unauthenticated endpoint that invalidates a code on request lets anyone who knows the address keep cancelling a recovery in progress.",
        "x-ratelimit": { limit: 10, window: "5m", scope: "per IP" },
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object" as const,
                required: ["email", "token"],
                properties: {
                  email: { type: "string" as const, format: "email" },
                  token: { type: "string" as const, description: "The code from the recovery email." },
                },
              },
            },
          },
        },
        responses: {
          "200": {
            description: "Key rotated",
            content: {
              "application/json": {
                schema: {
                  type: "object" as const,
                  properties: {
                    api_key: { type: "string" as const, description: "Shown once. The previous key is now invalid." },
                    key_prefix: { type: "string" as const },
                    message: { type: "string" as const },
                  },
                },
              },
            },
          },
          "400": errorResponse("invalid_request", "Both 'email' and 'token' are required."),
          "401": errorResponse("unauthorized", "The code is invalid, expired, or already used."),
        },
      },
    },
    "/v1/auth/me": {
      delete: {
        tags: ["auth"], summary: "Close and redact your account",
        description: "Primary key required. Irreversible: revokes all keys, clears customer content except legal holds, and forfeits the wallet balance. Processing records and integrity hashes are retained.",
        security: [{ BearerAuth: [] }],
        responses: { ...primaryKeyError, "200": keyResponse("Account redacted", {type: "object"}), "401": errorResponse("unauthorized", "Invalid API key.") },
      },
    },
    "/v1/auth/api-key": {
      post: {
        tags: ["auth"],
        summary: "Regenerate API key",
        description: "Primary key required. Generates a new primary key and invalidates the current primary key. Additional keys survive rotation; review and revoke unused or unrecognized keys.",
        security: [{ BearerAuth: [] }],
        responses: {
          ...primaryKeyError,
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
        description: "Primary key required. Creates a Stripe Checkout session for wallet top-up. Minimum €10.00.",
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
          ...primaryKeyError,
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
    "/v1/transactions/{id}/dispute": {
      get: {
        summary: "Read a transaction dispute",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: { "200": { description: "Current dispute status" } },
      },
      post: {
        tags: ["transactions"], summary: "Submit a dispute for human review",
        description: "Account-holder submissions require the primary key. Anonymous data subjects may instead use a signed audit token with expires_at and a contact email; that path does not require an account key.",
        parameters: [
          { name: "id", in: "path", required: true, schema: {type: "string", format: "uuid"} },
          { name: "token", in: "query", required: false, schema: {type: "string"} },
          { name: "expires_at", in: "query", required: false, schema: {type: "integer"} },
        ],
        requestBody: {required: true, content: {"application/json": {schema: {type: "object", required: ["reason"], properties: {reason: {type: "string"}, affected_field: {type: "string"}, contact_email: {type: "string", format: "email"}}}}}},
        responses: { ...primaryKeyError, "202": keyResponse("Dispute received", {type: "object"}), "400": errorResponse("invalid_request", "Supply a reason and contact email for token-only submissions."), "401": errorResponse("unauthorized", "Authorization or signed audit token required."), "404": errorResponse("not_found", "Transaction not found.") },
      },
    },
    "/v1/transactions/{id}/audit-token": {
      post: {
        tags: ["transactions"],
        summary: "Re-issue audit token",
        description:
          "Primary key required. Issue a new HMAC-signed audit URL for a transaction you own. " +
          "Replaces the previous token for the caller's convenience; previous tokens remain valid until their own expires_at (stateless). " +
          "Default TTL 90 days (F-A-006). Caller must own the transaction (same 404 for unknown / cross-user / deleted).",
        security: [{ BearerAuth: [] }],
        parameters: [{ name: "id", in: "path" as const, required: true, schema: { type: "string" as const, format: "uuid" } }],
        requestBody: {
          required: false,
          content: {
            "application/json": {
              schema: {
                type: "object" as const,
                properties: {
                  expires_in_days: {
                    type: "integer" as const,
                    minimum: 1,
                    maximum: 365,
                    default: 90,
                    description: "TTL for the new token in days. Integer 1-365. Default 90.",
                  },
                },
              },
            },
          },
        },
        responses: {
          ...primaryKeyError,
          "200": {
            description: "Audit token re-issued.",
            content: {
              "application/json": {
                schema: {
                  type: "object" as const,
                  properties: {
                    transaction_id: { type: "string" as const, format: "uuid" },
                    token: { type: "string" as const, description: "32-char HMAC-SHA256 substring." },
                    expires_at: { type: "integer" as const, description: "Unix seconds." },
                    expires_at_iso: { type: "string" as const, format: "date-time" },
                    audit_url: { type: "string" as const, description: "Full shareable URL with token + expires_at query params." },
                  },
                },
              },
            },
          },
          "400": errorResponse("invalid_request", "expires_in_days must be an integer between 1 and 365."),
          "401": errorResponse("unauthorized", "Missing or invalid API key."),
          "404": errorResponse("not_found", "Transaction not found."),
        },
      },
    },
    "/v1/transactions/{id}": {
      delete: {
        tags: ["transactions"], summary: "Redact a transaction",
        description: "Primary key required. Clears customer content and hides the transaction; integrity hashes remain. Legal holds prevent deletion.",
        security: [{ BearerAuth: [] }],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
        responses: { ...primaryKeyError, "200": keyResponse("Transaction redacted", {type: "object"}), "401": errorResponse("unauthorized", "Invalid API key."), "404": errorResponse("not_found", "Transaction not found."), "423": errorResponse("locked", "Transaction under legal hold.") },
      },
      get: {
        tags: ["transactions"],
        summary: "Get transaction detail",
        description:
          "Returns transaction detail. Authenticated callers receive the full body (output, provenance, audit trail). " +
          "Unauthenticated callers looking up a free-tier transaction by UUID receive a redacted envelope with " +
          "`body_redacted: true` and the body fields (input/output/error/provenance/audit_trail) absent. " +
          "See F-A-005.",
        security: [{ BearerAuth: [] }, {}],
        parameters: [{ name: "id", in: "path" as const, required: true, schema: { type: "string" as const, format: "uuid" } }],
        responses: {
          "200": {
            description: "Transaction detail (full body if authenticated, redacted envelope if unauthenticated free-tier lookup).",
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
                    provenance: { type: "object" as const, nullable: true },
                    transparency_marker: { type: "string" as const },
                    data_jurisdiction: { type: "string" as const },
                    created_at: { type: "string" as const, format: "date-time" },
                    completed_at: { type: "string" as const, format: "date-time", nullable: true },
                    body_redacted: { type: "boolean" as const, description: "Present and true on unauth free-tier lookups; indicates body fields are redacted." },
                    body_redacted_reason: { type: "string" as const, description: "Human-readable explanation of why the body is redacted." },
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
        description: "Recompute a transaction's SHA-256 content hash and walk the recorded chain backward from it, up to a bounded depth. Public, no auth required.",
        parameters: [
          { name: "transactionId", in: "path" as const, required: true, schema: { type: "string" as const, format: "uuid" } },
          { name: "depth", in: "query" as const, required: false, schema: { type: "integer" as const, minimum: 1, maximum: 50, default: 20 }, description: "Max chain depth to verify (default 20, max 50). F-A-012: values >50 are clamped to 50." },
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
                        truncated: { type: "boolean" as const, description: "F-A-012: true when the chain walk stopped at max_depth before reaching genesis. False when the walk completed (reached genesis, hit a missing link, or the chain was shorter than max_depth)." },
                        truncated_reason: { type: "string" as const, nullable: true, description: "Human-readable reason string (e.g. 'max_depth_reached (N=50)') when truncated=true, otherwise null." },
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
          "429": errorResponse("rate_limited", "Rate limit exceeded (F-A-012: 10 req/min per IP). Retry after the window resets."),
        },
      },
    },

    // ─── Suggest ──────────────────────────────────────────────────────
    "/v1/suggest": {
      post: {
        tags: ["suggest"],
        summary: "AI capability suggestion",
        description: "Uses AI to find the best capability or solution for a natural language query. Returns a recommendation, alternatives, a match count and a query interpretation. Uses keyword fallback when model ranking is unavailable.",
        "x-ratelimit": { limit: 20, window: "1s", scope: "per IP" },
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object" as const,
                required: ["query"],
                properties: {
                  query: { type: "string" as const, minLength: 2, maxLength: 500, example: "validate a Swedish company's VAT number" },
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
                    recommendation: { ...suggestRecommendationSchema, nullable: true },
                    alternatives: { type: "array" as const, items: suggestRecommendationSchema },
                    total_matches: { type: "integer" as const },
                    query_understood_as: { type: "string" as const, maxLength: 120 },
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
        description: "Fast keyword-based autocomplete for capability and solution names. Queries are truncated to the first 200 characters before matching.",
        "x-ratelimit": { limit: 30, window: "1s", scope: "per IP" },
        parameters: [
          { name: "q", in: "query" as const, required: true, schema: { type: "string" as const, minLength: 2 }, description: "Search query; only the first 200 characters are considered." },
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
