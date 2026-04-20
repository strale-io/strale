import { Hono } from "hono";
import { eq, and, gte, isNull, sql } from "drizzle-orm";
import { getDb } from "../db/index.js";
import {
  wallets,
  walletTransactions,
  transactions,
  failedRequests,
  capabilities,
  users,
} from "../db/schema.js";
import { checkMilestone } from "../lib/milestones.js";
import { optionalAuthMiddleware, getClientIp, hashIp } from "../lib/middleware.js";
import { rateLimitByKey, rateLimitByIp } from "../lib/rate-limit.js";
import { matchCapability } from "../lib/matching.js";
import { getExecutor } from "../capabilities/index.js";
import { apiError } from "../lib/errors.js";
import {
  checkCircuitBreaker,
  recordSuccess,
  recordFailure,
} from "../lib/circuit-breaker.js";
import { recordQuality } from "../lib/quality-capture.js";
import { triggerOnFailure } from "../lib/event-triggers.js";
import { recordPiggybackResult } from "../lib/piggyback-monitor.js";
import { TRANSACTION_RETENTION_DAYS } from "../lib/data-retention.js";
import { computeDualProfileSQS } from "../lib/sqs.js";
import { createHash } from "node:crypto";
import { getShareableUrl } from "../lib/audit-token.js";
import { getAiDescription, getDataSourceUrl } from "../lib/audit-helpers.js";
import { getCapabilityQuality } from "../lib/quality-aggregation.js";
import { sanitizeFailureReason } from "../lib/sanitize.js";
import { logError, logWarn } from "../lib/log.js";
import { fireAndForget } from "../lib/fire-and-forget.js";
import {
  computeFreshnessGrade,
  type FreshnessInfo,
} from "../lib/trust-grade.js";
import { withRetry } from "../lib/retry.js";
import { buildFailureProvenance, getProcessingJurisdictions } from "../lib/provenance-builder.js";
// F-0-009 Stage 2: integrity hashing moved to jobs/integrity-hash-retry.ts.
import {
  isX402Configured,
  build402Response,
  verifyX402PaymentOnly,
  settleX402Payment,
  extractPaymentHeader,
  type X402VerifiedPayment,
} from "../lib/x402-gateway.js";
import { recordUnlock, isUnlocked, getUnlockedSlugs } from "../lib/progressive-unlock.js";
import type { AppEnv } from "../types.js";

// Usage/cost headers for Beacon transactability
function setCreditsHeaders(c: { header: (name: string, value: string) => void }, balanceCents: number, costCents?: number) {
  c.header("X-Credits-Remaining", String(balanceCents));
  c.header("X-Credits-Currency", "EUR");
  if (costCents !== undefined) {
    c.header("X-Cost-Cents", String(costCents));
  }
}

// Dual-profile quality block for /v1/do responses
interface DualProfileQuality {
  sqs: number;
  label: string;
  quality_profile: { grade: string; score: number; label: string };
  reliability_profile: { grade: string; score: number; label: string };
  trend: string;
}

// Compact guidance for /v1/do consumers (agents need usable + strategy + confidence).
// Internal trust detail returns full 10-field config; solution trust returns 4-field subset.
// This variation is intentional: each endpoint serves different consumer needs.
interface DualProfileGuidance {
  usable: boolean;
  strategy: string;
  confidence_after_strategy: number;
}

// ── Contextual upgrade block for free-tier responses ──────────────────────────

const FALLBACK_EXAMPLES: Record<string, Array<{ slug: string; description: string; price: string }>> = {
  "url-to-markdown":  [{ slug: "web-extract", description: "Extract structured data from any web page", price: "€0.05" }, { slug: "meta-extract", description: "Extract Open Graph, title, and structured data", price: "€0.02" }, { slug: "screenshot-url", description: "Take a screenshot of any web page", price: "€0.10" }],
  "email-validate":   [{ slug: "domain-reputation", description: "Assess domain trust and reputation signals", price: "€0.05" }, { slug: "mx-lookup", description: "Mail server lookup for deliverability", price: "€0.02" }, { slug: "pep-check", description: "Screen against politically exposed persons lists", price: "€0.15" }],
  "iban-validate":    [{ slug: "vat-validate", description: "Validate EU VAT numbers via VIES", price: "€0.02" }, { slug: "swift-validate", description: "Validate SWIFT/BIC codes", price: "€0.02" }, { slug: "sanctions-check", description: "Screen against global sanctions lists", price: "€0.02" }],
  "dns-lookup":       [{ slug: "whois-lookup", description: "WHOIS registration data for any domain", price: "€0.05" }, { slug: "ssl-check", description: "SSL certificate validity and details", price: "€0.02" }, { slug: "domain-reputation", description: "Domain trust signals and reputation", price: "€0.05" }],
  "json-repair":      [{ slug: "json-schema-validate", description: "Validate JSON against a schema", price: "€0.02" }, { slug: "xml-to-json", description: "Convert XML to structured JSON", price: "€0.02" }, { slug: "csv-to-json", description: "Parse CSV to JSON array", price: "€0.02" }],
};

const DEFAULT_EXAMPLES = [
  { slug: "sanctions-check", description: "Screen against global sanctions lists", price: "€0.02" },
  { slug: "swedish-company-data", description: "Company data from Bolagsverket", price: "€0.80" },
  { slug: "package-security-audit", description: "CVE + license + scorecard audit for npm/PyPI", price: "€0.15" },
];

/**
 * Contextual nudges — analyze the input to suggest relevant paid capabilities.
 * A user extracting a bank's privacy policy is more likely to want compliance
 * tools than generic web scraping upgrades.
 */
function buildUpgradeBlock(capabilitySlug: string, input?: Record<string, unknown>, output?: Record<string, unknown>) {
  const nudge = inferContextualNudge(capabilitySlug, input, output);
  return {
    message: nudge?.message ?? "You're using a free capability. Sign up for €2 free credits to access 270+ paid capabilities — company data, compliance checks, Web3 security, and more.",
    signup_url: "https://strale.dev/signup",
    self_signup: {
      url: "https://api.strale.io/v1/signup",
      method: "POST",
      body: { email: "your-agent@yourdomain.com" },
      description: "Create an account programmatically and get €2 free credits.",
    },
    paid_examples: nudge?.examples ?? FALLBACK_EXAMPLES[capabilitySlug] ?? DEFAULT_EXAMPLES,
    x402_note: "Or pay per call with USDC on Base — no signup needed. Try: GET https://api.strale.io/x402/catalog",
  };
}

interface Nudge {
  message: string;
  examples: Array<{ slug: string; description: string; price: string }>;
}

function inferContextualNudge(
  slug: string,
  input?: Record<string, unknown>,
  output?: Record<string, unknown>,
): Nudge | null {
  const inputStr = JSON.stringify(input ?? {}).toLowerCase();
  const title = String((output as Record<string, unknown>)?.title ?? "").toLowerCase();
  const url = String(input?.url ?? input?.link ?? "").toLowerCase();
  const domain = String(input?.domain ?? "").toLowerCase();
  const email = String(input?.email ?? "").toLowerCase();
  const iban = String(input?.iban ?? "").toUpperCase();

  // ── url-to-markdown: detect intent from URL/title ─────────────────
  if (slug === "url-to-markdown" || slug === "dns-lookup") {
    const text = `${url} ${domain} ${title} ${inputStr}`;

    // Privacy/compliance/legal content
    if (/privacy.policy|gdpr|cookie.policy|terms.of.service|legal|compliance|data.protection/.test(text)) {
      return {
        message: "Analyzing legal/compliance content? Strale has purpose-built compliance capabilities.",
        examples: [
          { slug: "gdpr-website-check", description: "Automated GDPR compliance audit for any website", price: "€0.15" },
          { slug: "privacy-policy-analyze", description: "AI-powered privacy policy risk analysis", price: "€0.15" },
          { slug: "cookie-scan", description: "Scan a website for tracking cookies and consent issues", price: "€0.15" },
        ],
      };
    }

    // Banking/fintech domains
    if (/bank|fintech|payment|finance|lending|credit|mortgage|insurance/.test(text)) {
      return {
        message: "Researching a financial institution? Get structured compliance data instead of scraping.",
        examples: [
          { slug: "sanctions-check", description: "Screen against global sanctions lists", price: "€0.02" },
          { slug: "lei-lookup", description: "Legal Entity Identifier lookup via GLEIF", price: "€0.05" },
          { slug: "kyb-essentials-uk", description: "Full company verification (UK)", price: "€1.50" },
        ],
      };
    }

    // Company/business research
    if (/company|corporate|about.us|investor|annual.report|business|enterprise/.test(text)) {
      return {
        message: "Researching a company? Get structured company data from official registries.",
        examples: [
          { slug: "uk-company-data", description: "Companies House data for UK entities", price: "€0.05" },
          { slug: "company-enrich", description: "AI-powered company profile enrichment", price: "€0.15" },
          { slug: "beneficial-ownership-lookup", description: "UK beneficial ownership (PSC) lookup", price: "€0.25" },
        ],
      };
    }

    // Crypto/blockchain/web3
    if (/crypto|blockchain|web3|defi|token|nft|dao|wallet|ethereum|bitcoin|solana/.test(text)) {
      return {
        message: "Researching a crypto project? Get structured due diligence data.",
        examples: [
          { slug: "smart-contract-audit-check", description: "Check if a contract has been audited", price: "€0.05" },
          { slug: "token-info", description: "Token metadata and market data", price: "€0.05" },
          { slug: "ens-resolve", description: "Resolve ENS names to addresses", price: "€0.02" },
        ],
      };
    }

    // E-commerce/product research
    if (/product|shop|store|price|review|ecommerce|e-commerce|retail|trustpilot/.test(text)) {
      return {
        message: "Researching a product or store? Get structured e-commerce intelligence.",
        examples: [
          { slug: "trustpilot-score", description: "Trustpilot rating and review summary", price: "€0.15" },
          { slug: "domain-reputation", description: "Domain trust and reputation signals", price: "€0.05" },
          { slug: "whois-lookup", description: "Domain registration and ownership data", price: "€0.05" },
        ],
      };
    }

    // Tech/developer content
    if (/github|npm|pypi|package|library|framework|api|sdk|developer|documentation/.test(text)) {
      return {
        message: "Analyzing a software project? Get structured security and quality data.",
        examples: [
          { slug: "package-security-audit", description: "CVE + supply chain + license audit for npm/PyPI", price: "€0.15" },
          { slug: "license-compatibility-check", description: "Check license compatibility for your stack", price: "€0.05" },
          { slug: "github-repo-compare", description: "Compare GitHub repos by stars, activity, health", price: "€0.02" },
        ],
      };
    }
  }

  // ── email-validate: detect business vs personal ───────────────────
  if (slug === "email-validate" && email) {
    const domain = email.split("@")[1] ?? "";
    if (domain && !["gmail.com", "yahoo.com", "hotmail.com", "outlook.com", "icloud.com", "protonmail.com"].includes(domain)) {
      return {
        message: `Validating a business email? Check the company behind ${domain} with structured registry data.`,
        examples: [
          { slug: "domain-reputation", description: `Check reputation signals for ${domain}`, price: "€0.05" },
          { slug: "whois-lookup", description: `Domain registration data for ${domain}`, price: "€0.05" },
          { slug: "sanctions-check", description: "Screen the company against sanctions lists", price: "€0.02" },
        ],
      };
    }
  }

  // ── iban-validate: detect country and suggest KYB ─────────────────
  if (slug === "iban-validate" && iban.length >= 2) {
    const country = iban.slice(0, 2);
    const countryNames: Record<string, string> = {
      SE: "Sweden", NO: "Norway", DK: "Denmark", FI: "Finland", GB: "UK",
      DE: "Germany", FR: "France", NL: "Netherlands", BE: "Belgium", AT: "Austria",
      IE: "Ireland", ES: "Spain", IT: "Italy", CH: "Switzerland", PL: "Poland",
      PT: "Portugal", US: "US", CA: "Canada", AU: "Australia", SG: "Singapore",
    };
    const name = countryNames[country];
    if (name) {
      const cc = country.toLowerCase();
      return {
        message: `Validating a ${name} IBAN? Run a full counterparty check on the account holder.`,
        examples: [
          { slug: `kyb-essentials-${cc}`, description: `Quick company verification (${name})`, price: "€1.50" },
          { slug: "sanctions-check", description: "Screen the account holder against sanctions lists", price: "€0.02" },
          { slug: "vat-validate", description: "Validate the company's VAT number", price: "€0.02" },
        ],
      };
    }
  }

  return null;
}

// Dual-profile response helpers
type DualProfileSQSResult = Awaited<ReturnType<typeof computeDualProfileSQS>>;

function buildDualProfileResponse(dual: DualProfileSQSResult | null, sqs: { score: number; label: string; trend: string; pending: boolean }, lifecycleState?: string) {
  const warning = lifecycleState === "degraded"
    ? { quality_warning: "This capability is currently degraded. Results may be unreliable." }
    : {};
  if (!dual) {
    return {
      quality: {
        sqs: sqs.score, label: sqs.label,
        quality_profile: { grade: "pending", score: 0, label: "Pending" },
        reliability_profile: { grade: "pending", score: 0, label: "Pending" },
        trend: sqs.trend,
      },
      execution_guidance: { usable: true, strategy: "direct" as const, confidence_after_strategy: 100 },
      ...warning,
    };
  }
  return {
    quality: {
      sqs: dual.matrix.score,
      label: dual.matrix.label,
      quality_profile: { grade: dual.qp.grade, score: dual.qp.score, label: dual.qp.label },
      reliability_profile: { grade: dual.rp.grade, score: dual.rp.score, label: dual.rp.label },
      trend: dual.rp.trend,
    },
    execution_guidance: {
      usable: dual.matrix.score >= 25 && dual.qp.grade !== "F",
      strategy: dual.rp.grade === "A" || dual.rp.grade === "B" ? "direct" as const
        : dual.rp.grade === "C" ? "retry_with_backoff" as const
          : dual.rp.grade === "D" && dual.rp.trend === "improving" ? "queue_for_later" as const
            : dual.matrix.score < 25 ? "unavailable" as const : "direct" as const,
      confidence_after_strategy: dual.rp.grade === "A" ? 100 : Math.min(99, Math.round(dual.rp.score)),
    },
    ...warning,
  };
}

// Shared capability type for execution functions
type CapabilityInfo = {
  id: string;
  slug: string;
  name: string;
  priceCents: number;
  lifecycleState: string;
  capabilityType: string;
  transparencyTag: string | null;
  dataSource: string | null;
  dataClassification: string | null;
  freshnessCategory: string | null;
  dataUpdateCycleDays: number | null;
  datasetLastUpdated: Date | null;
  // SA.2b (F-A-003, F-A-009): manifest-declared PII classification.
  // SA.2b.d: NOT NULL post migration 0050.
  processesPersonalData: boolean;
  personalDataCategories: string[] | null;
};

/** Execute with retry for non-deterministic capabilities. */
function executeWithRetry(
  executor: (input: Record<string, unknown>) => Promise<any>,
  input: Record<string, unknown>,
  capability: CapabilityInfo,
): Promise<any> {
  if (capability.capabilityType === "deterministic") {
    return executor(input);
  }
  return withRetry(() => executor(input), {
    maxRetries: 1,
    baseDelayMs: 1000,
    slug: capability.slug,
  });
}

// ─── MCP client detection from User-Agent ────────────────────────────────────

function parseMcpClient(ua: string | null): string | null {
  if (!ua) return null;
  const lower = ua.toLowerCase();
  if (lower.includes("claude") || lower.includes("claude-desktop")) return "claude-desktop";
  if (lower.includes("cursor")) return "cursor";
  if (lower.includes("windsurf")) return "windsurf";
  if (lower.includes("copilot")) return "copilot";
  if (lower.includes("straleio") || lower.includes("strale-mcp")) return "strale-sdk";
  if (lower.includes("python-httpx") || lower.includes("python-requests")) return "python-sdk";
  if (lower.includes("node-fetch") || lower.includes("undici")) return "node-sdk";
  if (lower.includes("axios")) return "axios";
  return null;
}

const MAX_TIMEOUT_SECONDS = 60;
const DEFAULT_TIMEOUT_SECONDS = 30;
const MAX_PRICE_CAP_CENTS = 2000; // €20 absolute cap per request

// DEC-22: Capabilities with avg latency above this threshold execute async
const ASYNC_THRESHOLD_MS = 10_000;

export const doRoute = new Hono<AppEnv>();

// POST /v1/do — Core endpoint: execute a capability
// DEC-21: 10 req/sec per API key (authenticated), 10/day per IP (free-tier)
doRoute.post(
  "/do",
  rateLimitByIp(60, 60_000),         // IP rate limit BEFORE auth — catches invalid Bearer token bypass (S-5)
  optionalAuthMiddleware,
  rateLimitByKey(10, 1000),         // applies only if user is set
  // Free-tier daily cap (10/day) enforced in-handler via DB counter — restart-safe
  async (c) => {
  const user = c.get("user") as any | undefined;
  const db = getDb();

  // Capture request context for attribution tracking (stored in audit trail)
  const userAgent = c.req.header("user-agent") ?? null;
  const requestContext = {
    referer: c.req.header("referer") ?? c.req.header("referrer") ?? null,
    origin: c.req.header("origin") ?? null,
    userAgent,
    // Hash IP for aggregate pattern analysis (never store raw IPs)
    ipHash: (() => {
      const ip = c.req.header("x-forwarded-for")?.split(",")[0]?.trim()
        ?? c.req.header("cf-connecting-ip")
        ?? c.req.header("x-real-ip")
        ?? null;
      return ip ? createHash("sha256").update(ip).digest("hex").slice(0, 16) : null;
    })(),
    acceptLanguage: c.req.header("accept-language")?.split(",")[0]?.trim() ?? null,
    // Fingerprint fallback for rate limiting when IP is undetectable.
    // Hash of UA + Accept-Language + Origin/Referer — not unique but
    // stable enough for conservative rate limiting (3/day cap).
    fingerprintHash: (() => {
      const ua = c.req.header("user-agent") ?? "";
      const lang = c.req.header("accept-language") ?? "";
      const origin = c.req.header("origin") ?? c.req.header("referer") ?? "";
      const raw = `${ua}|${lang}|${origin}`;
      // Only generate a fingerprint if we have at least some signal
      return raw.length > 4 ? createHash("sha256").update(raw).digest("hex").slice(0, 16) : null;
    })(),
    // Parse known MCP/SDK clients from User-Agent
    mcpClient: parseMcpClient(userAgent),
  };
  c.set("requestContext" as any, requestContext);

  // ── 1. Parse and validate request ──────────────────────────────────────
  const body = await c.req.json().catch(() => null);
  if (!body) {
    return c.json(
      apiError("invalid_request", "Request body is required."),
      400,
    );
  }

  const task: string | undefined = body.task;
  const capabilitySlug: string | undefined = body.capability_slug;
  const inputs: Record<string, unknown> | undefined = body.inputs;
  const maxPriceCents: number | undefined = body.max_price_cents;
  const timeoutSeconds: number = Math.min(
    body.timeout_seconds ?? DEFAULT_TIMEOUT_SECONDS,
    MAX_TIMEOUT_SECONDS,
  );
  const dryRun: boolean = body.dry_run === true;
  const minSqs: number | undefined =
    typeof body.min_sqs === "number" && body.min_sqs >= 0 && body.min_sqs <= 100
      ? Math.round(body.min_sqs)
      : undefined;
  const requireFresh: boolean = body.require_fresh === true;
  const maxLatencyMs: number | undefined =
    typeof body.max_latency_ms === "number" && body.max_latency_ms > 0
      ? Math.round(body.max_latency_ms)
      : undefined;

  if (!task && !capabilitySlug) {
    return c.json(
      apiError(
        "invalid_request",
        "Either 'task' or 'capability_slug' is required.",
      ),
      400,
    );
  }

  // max_price_cents: required for authenticated users, optional for free-tier
  if (user) {
    if (
      maxPriceCents == null ||
      typeof maxPriceCents !== "number" ||
      maxPriceCents <= 0
    ) {
      return c.json(
        apiError(
          "invalid_request",
          "'max_price_cents' is required and must be a positive integer.",
        ),
        400,
      );
    }

    if (maxPriceCents > MAX_PRICE_CAP_CENTS) {
      return c.json(
        apiError(
          "invalid_request",
          `'max_price_cents' cannot exceed ${MAX_PRICE_CAP_CENTS} (€${MAX_PRICE_CAP_CENTS / 100}).`,
          { max_allowed: MAX_PRICE_CAP_CENTS },
        ),
        400,
      );
    }
  }

  // For unauthenticated requests, default to 0 (free-tier only).
  // If the capability is progressively unlocked for this IP, allow its price through.
  const preAuthIpHash = (c.get("requestContext" as any) as { ipHash?: string | null } | undefined)?.ipHash;
  const isPreUnlocked = !user && capabilitySlug && preAuthIpHash && isUnlocked(preAuthIpHash, capabilitySlug);
  const effectiveMaxPrice = maxPriceCents ?? (isPreUnlocked ? 10000 : 0);

  // ── 2. Idempotency check (authenticated only) ─────────────────────────
  const idempotencyKey = c.req.header("Idempotency-Key") || null;

  if (idempotencyKey && user) {
    const [existing] = await db
      .select()
      .from(transactions)
      .where(and(eq(transactions.idempotencyKey, idempotencyKey), eq(transactions.userId, user.id), isNull(transactions.deletedAt)))
      .limit(1);

    if (existing) {
      const [wallet] = await db
        .select({ balanceCents: wallets.balanceCents })
        .from(wallets)
        .where(eq(wallets.userId, user.id))
        .limit(1);

      return c.json({
        transaction_id: existing.id,
        status: existing.status,
        capability_used: capabilitySlug ?? null,
        price_cents: existing.priceCents,
        latency_ms: existing.latencyMs,
        wallet_balance_cents: wallet?.balanceCents ?? 0,
        output: existing.output,
        provenance: existing.provenance,
      });
    }
  }

  // ── 3. Early auth gate for unauthenticated requests ───────────────────
  // Check BEFORE matching so non-free capabilities return a clear response:
  //   - x402 configured + payment header → verify and continue
  //   - x402 configured + no payment → return 402 with price
  //   - x402 not configured → return 401 with signup prompt
  if (!user && capabilitySlug) {
    const [lookedUp] = await db
      .select({
        isFreeTier: capabilities.isFreeTier,
        isActive: capabilities.isActive,
        priceCents: capabilities.priceCents,
        name: capabilities.name,
        matrixSqs: capabilities.matrixSqs,
      })
      .from(capabilities)
      .where(eq(capabilities.slug, capabilitySlug))
      .limit(1);

    if (lookedUp && lookedUp.isActive && !lookedUp.isFreeTier) {
      // Check progressive unlock before rejecting (DEC-20260410-A)
      const reqIpHash = (c.get("requestContext" as any) as { ipHash?: string | null } | undefined)?.ipHash;
      if (reqIpHash && isUnlocked(reqIpHash, capabilitySlug)) {
        // Treat as free-tier — fall through to matching + execution
      } else {
      // Check for x402 payment header
      const paymentHeader = extractPaymentHeader(c.req.raw.headers);

      if (paymentHeader && isX402Configured()) {
        // Verify x402 payment WITHOUT broadcasting settlement — the settle
        // step runs only after the capability has produced output (DEC-14).
        const verification = await verifyX402PaymentOnly(paymentHeader, lookedUp.priceCents);
        if (!verification.valid || !verification.verified) {
          return c.json({
            error_code: "payment_failed",
            message: verification.error ?? "x402 payment verification failed",
          }, 402);
        }
        // Stash the verified handle for executeFreeTier to settle post-success.
        c.set("x402_verified" as any, verification.verified);
        c.set("x402_paid" as any, true);
        // Fall through to normal execution — the capability will execute
        // and the transaction will be logged with payment_method: "x402"
      } else if (isX402Configured()) {
        // No payment header, x402 configured → return 402 with price
        const resp = build402Response({
          slug: capabilitySlug,
          name: lookedUp.name,
          priceCents: lookedUp.priceCents,
          matrixSqs: lookedUp.matrixSqs,
        });
        return c.json(resp.body, 402);
      } else {
        // x402 not configured → return 401 with signup prompt
        const freeSlugs = await getFreeTierSlugs(db);
        return c.json({
          error_code: "unauthorized",
          message: "This capability requires an API key. Sign up at strale.dev/signup for full access with €2 free credits.",
          free_capabilities: freeSlugs,
          hint: `These ${freeSlugs.length} capabilities are free with no signup — try them without an API key.`,
          self_signup: {
            url: "https://api.strale.io/v1/signup",
            method: "POST",
            body: { email: "your-agent@yourdomain.com" },
            description: "Create an account programmatically and get €2 free credits. Requires at least one prior free-tier call from this IP.",
          },
        }, 401);
      }
      } // close progressive unlock else
    }
  }

  // ── 3a. Match capability ─────────────────────────────────────────────
  const match = await matchCapability({
    task,
    capabilitySlug,
    category: body.category,
    maxPriceCents: effectiveMaxPrice,
  });

  if (!match || match.budgetExceeded) {
    // Budget exceeded: capability exists but costs more than max_price_cents
    if (match?.budgetExceeded) {
      return c.json(
        apiError(
          "budget_exceeded",
          `Capability '${match.capability.slug}' costs €${(match.capability.priceCents / 100).toFixed(2)} (${match.capability.priceCents} cents) which exceeds your max_price_cents of ${effectiveMaxPrice}.`,
          {
            capability_slug: match.capability.slug,
            actual_price_cents: match.capability.priceCents,
            max_price_cents: effectiveMaxPrice,
          },
        ),
        402,
      );
    }

    // Log the failed request for demand analysis (DEC-20260225-P-c5d6)
    // Now captures both authenticated and unauthenticated failures
    const clientIp = getClientIp(c);
    fireAndForget(
      () =>
        db.insert(failedRequests).values({
          userId: user?.id ?? null,
          ipHash: clientIp !== "unknown" ? hashIp(clientIp) : null,
          task: task ?? capabilitySlug ?? "",
          category: body.category ?? null,
          maxPriceCents: effectiveMaxPrice ?? null,
          failureType: "no_match",
          userAgent: (c.req.header("user-agent") ?? "").slice(0, 255) || null,
        }),
      { label: "failed-request-log", context: { failureType: "no_match", userId: user?.id ?? null } },
    );

    // Unauthenticated task-based requests that found no free-tier match
    if (!user) {
      const freeSlugs = await getFreeTierSlugs(db);
      return c.json({
        error_code: "unauthorized",
        message: "No free capability matched your request. Sign up at strale.dev/signup for full access with €2 free credits.",
        free_capabilities: freeSlugs,
        hint: `These ${freeSlugs.length} capabilities are free with no signup — try them without an API key.`,
      }, 401);
    }

    return c.json(
      apiError(
        "no_matching_capability",
        "No capability found matching your request within budget.",
        {
          task,
          capability_slug: capabilitySlug,
          max_price_cents: effectiveMaxPrice,
        },
      ),
      404,
    );
  }

  const capability = match.capability;
  const isFreeTier = capability.isFreeTier;

  // ── 3a. Platform SQS quality floor — don't serve from known-broken capabilities
  const PLATFORM_SQS_FLOOR = 15;
  const capSqs = capability.matrixSqs != null ? parseFloat(String(capability.matrixSqs)) : null;
  if (capSqs !== null && capSqs < PLATFORM_SQS_FLOOR && capability.lifecycleState !== "probation") {
    return c.json(
      apiError(
        "capability_unavailable",
        `Capability '${capability.slug}' is temporarily below the platform quality threshold (SQS ${capSqs}). It may recover after the next test cycle.`,
        { sqs: capSqs, threshold: PLATFORM_SQS_FLOOR },
      ),
      503,
    );
  }

  // ── 3b. Hourly spend cap check (DEC-21) — authenticated only ────────────
  if (user && user.maxSpendPerHourCents) {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const [spendRow] = await db
      .select({ total: sql<string>`COALESCE(SUM(price_cents), 0)::text` })
      .from(transactions)
      .where(
        and(
          eq(transactions.userId, user.id),
          eq(transactions.status, "completed"),
          gte(transactions.createdAt, oneHourAgo),
        ),
      );

    const spent = Number(spendRow?.total ?? 0);
    if (spent + capability.priceCents > user.maxSpendPerHourCents) {
      return c.json(
        apiError(
          "spend_cap_exceeded",
          `Hourly spend limit (€${(user.maxSpendPerHourCents / 100).toFixed(2)}) would be exceeded. Spent: €${(spent / 100).toFixed(2)}, requested: €${(capability.priceCents / 100).toFixed(2)}.`,
          {
            spent_cents: spent,
            requested_cents: capability.priceCents,
            limit_cents: user.maxSpendPerHourCents,
          },
        ),
        429,
      );
    }
  }

  // ── 4. Dry run — return what would execute without charging ────────────
  if (dryRun) {
    if (user) {
      const [wallet] = await db
        .select({ balanceCents: wallets.balanceCents })
        .from(wallets)
        .where(eq(wallets.userId, user.id))
        .limit(1);

      const balance = wallet?.balanceCents ?? 0;
      return c.json({
        dry_run: true,
        would_execute: capability.slug,
        price_cents: capability.priceCents,
        wallet_balance_cents: balance,
        wallet_sufficient: balance >= capability.priceCents,
      });
    }
    // Unauthenticated dry run (free-tier only)
    return c.json({
      dry_run: true,
      would_execute: capability.slug,
      price_cents: 0,
    });
  }

  // ── 5. Get the executor function ───────────────────────────────────────
  const executor = getExecutor(capability.slug);
  if (!executor) {
    return c.json(
      apiError(
        "capability_unavailable",
        `Capability '${capability.slug}' is registered but has no executor.`,
      ),
      503,
    );
  }

  // ── 5b. Circuit breaker check ──────────────────────────────────────────
  const circuitCheck = await checkCircuitBreaker(capability.slug);
  if (!circuitCheck.allowed) {
    return c.json(
      apiError(
        "capability_unavailable",
        circuitCheck.reason ?? `Capability '${capability.slug}' is temporarily suspended.`,
        {
          circuit_state: circuitCheck.state,
          next_retry_at: circuitCheck.next_retry_at ?? null,
        },
      ),
      503,
    );
  }

  // ── 5c. SQS quality gate (uses dual-profile matrix score) ───────────
  const PLATFORM_FLOOR_SQS = 25;
  const dual = await computeDualProfileSQS(capability.slug).catch((err) => {
    logWarn("do-dual-profile-sqs-failed", "dual-profile SQS computation failed", {
      capability_slug: capability.slug,
      err: err instanceof Error ? err.message : String(err),
    });
    return null;
  });
  // If dual-profile fails, treat as pending so the gate is skipped (fail open)
  const sqs = dual
    ? { score: dual.score, label: dual.label, pending: dual.matrix.pending, trend: dual.rp.trend }
    : { score: 0, label: "Pending", pending: true, trend: "stable" as const };

  if (!sqs.pending && sqs.score < PLATFORM_FLOOR_SQS) {
    return c.json(
      apiError(
        "capability_degraded",
        `Capability '${capability.slug}' is currently degraded (SQS ${sqs.score}/100). Execution refused.`,
        { sqs: sqs.score, sqs_label: sqs.label },
      ),
      503,
    );
  }

  if (minSqs !== undefined && !sqs.pending && sqs.score < minSqs) {
    return c.json(
      apiError(
        "below_quality_threshold",
        `Capability '${capability.slug}' SQS (${sqs.score}) is below your threshold (${minSqs}).`,
        { sqs: sqs.score, sqs_label: sqs.label, min_sqs: minSqs },
      ),
      422,
    );
  }

  // ── 5d. Freshness + latency pre-execution checks ──────────────────────
  const freshness = computeFreshnessGrade({
    freshnessCategory: capability.freshnessCategory,
    dataUpdateCycleDays: capability.dataUpdateCycleDays,
    datasetLastUpdated: capability.datasetLastUpdated,
  });

  // require_fresh: reject reference-data capabilities with stale data (grade C)
  if (requireFresh && freshness && freshness.category === "reference-data" && freshness.grade === "C") {
    return c.json(
      apiError(
        "freshness_check_failed",
        `Capability '${capability.slug}' has stale reference data. ${freshness.label}`,
        {
          freshness: {
            category: freshness.category,
            label: freshness.label,
            data_update_cycle_days: freshness.data_update_cycle_days ?? null,
            dataset_last_updated: freshness.dataset_last_updated ?? null,
          },
        },
      ),
      422,
    );
  }

  // max_latency_ms: check p95 latency against agent's threshold
  let qualityMetrics: Awaited<ReturnType<typeof getCapabilityQuality>> | null = null;
  if (maxLatencyMs !== undefined) {
    qualityMetrics = await getCapabilityQuality(capability.slug);
    if (qualityMetrics.p95ResponseTimeMs && qualityMetrics.p95ResponseTimeMs > maxLatencyMs) {
      return c.json(
        apiError(
          "latency_threshold_exceeded",
          `Capability '${capability.slug}' p95 latency (${qualityMetrics.p95ResponseTimeMs}ms) exceeds your threshold (${maxLatencyMs}ms).`,
          {
            p95_ms: qualityMetrics.p95ResponseTimeMs,
            max_latency_ms: maxLatencyMs,
          },
        ),
        422,
      );
    }
  }

  // ── 6. Decide execution path ─────────────────────────────────────────
  const executionInput = inputs ?? {};
  const outputSchema = (match.capability.outputSchema ?? {}) as Record<string, unknown>;

  // S-8: Validate inputs against capability's input_schema (required fields check)
  const inputSchema = (match.capability as any).inputSchema as { required?: string[]; properties?: Record<string, unknown> } | null;
  // Detect common mistake: passing the /v1/do body shape as "inputs"
  // e.g., {"capability_slug": "email-validate", "inputs": {"task": "email-validate"}}
  const DO_BODY_KEYS = new Set(["task", "capability_slug", "inputs", "max_price_cents", "dry_run", "min_sqs"]);
  const confusedKeys = Object.keys(executionInput).filter((k) => DO_BODY_KEYS.has(k));
  if (confusedKeys.length > 0 && inputSchema?.properties) {
    const expectedFields = Object.keys(inputSchema.properties);
    const cIp = getClientIp(c);
    fireAndForget(
      () =>
        db.insert(failedRequests).values({
          userId: user?.id ?? null,
          ipHash: cIp !== "unknown" ? hashIp(cIp) : null,
          task: capabilitySlug ?? task ?? "",
          failureType: "input_confusion",
          errorDetail: `Confused keys: ${confusedKeys.join(", ")}. Expected: ${expectedFields.join(", ")}`,
          userAgent: (c.req.header("user-agent") ?? "").slice(0, 255) || null,
        }),
      { label: "failed-request-log", context: { failureType: "input_confusion", userId: user?.id ?? null } },
    );
    return c.json(
      apiError(
        "invalid_request",
        `It looks like you passed the /v1/do request body as "inputs". The "inputs" field should contain the capability's parameters: { ${expectedFields.map((f) => `"${f}": ...`).join(", ")} }`,
        {
          confused_keys: confusedKeys,
          expected_fields: expectedFields,
          example: expectedFields.length > 0
            ? { [expectedFields[0]]: "your_value_here" }
            : undefined,
        },
      ),
      400,
    );
  }

  if (inputSchema?.required && inputSchema?.properties) {
    const missingFields = inputSchema.required.filter(
      (field) => !(field in executionInput) || executionInput[field] === undefined,
    );
    if (missingFields.length > 0) {
      // Detect common mistake: input fields placed at top level instead of inside "inputs"
      const topLevelMatches = missingFields.filter((f) => f in body);
      const hint = topLevelMatches.length > 0
        ? ` It looks like you placed ${topLevelMatches.map((f) => `'${f}'`).join(", ")} at the top level — wrap them inside "inputs": { ${topLevelMatches.map((f) => `"${f}": ...`).join(", ")} }.`
        : undefined;
      const fType = topLevelMatches.length > 0 ? "input_misplaced" : "missing_fields";
      const mIp = getClientIp(c);
      fireAndForget(
        () =>
          db.insert(failedRequests).values({
            userId: user?.id ?? null,
            ipHash: mIp !== "unknown" ? hashIp(mIp) : null,
            task: capabilitySlug ?? task ?? "",
            failureType: fType,
            errorDetail: `Missing: ${missingFields.join(", ")}`,
            userAgent: (c.req.header("user-agent") ?? "").slice(0, 255) || null,
          }),
        { label: "failed-request-log", context: { failureType: fType, userId: user?.id ?? null } },
      );
      return c.json(
        apiError(
          "invalid_request",
          `Missing required input fields: ${missingFields.join(", ")}`,
          {
            missing_fields: missingFields,
            expected_fields: Object.keys(inputSchema.properties),
            ...(hint ? { hint } : {}),
          },
        ),
        400,
      );
    }
  }

  // x402 paid: on-chain settlement already verified — execute like free-tier (no wallet debit)
  if (!user && (c.get("x402_paid" as any))) {
    return executeFreeTier(c, db, capability, executor, executionInput, outputSchema, sqs, freshness, dual);
  }

  // Free-tier or progressively unlocked: enforce daily cap (DB-based, restart-safe)
  const reqCtxForUnlock = c.get("requestContext" as any) as { ipHash?: string | null } | undefined;
  const isUnlockedForIp = !user && !isFreeTier && reqCtxForUnlock?.ipHash
    ? isUnlocked(reqCtxForUnlock.ipHash, capability.slug)
    : false;

  if (!user && (isFreeTier || isUnlockedForIp)) {
    const reqCtx = c.get("requestContext" as any) as { ipHash?: string | null; fingerprintHash?: string | null } | undefined;
    const ipHash = reqCtx?.ipHash ?? null;
    const fpHash = reqCtx?.fingerprintHash ?? null;
    // F-0-020: getFreeTierUsageToday used to catch DB errors and return
    // count=0 — silently disabling the cap on any hiccup. It now throws
    // FreeTierCheckUnavailable; we translate that into 503 so the request
    // is refused, not allowed.
    let callsToday: number;
    let identifiedBy: "ip" | "fingerprint" | "none";
    try {
      const usage = await getFreeTierUsageToday(db, ipHash, fpHash);
      callsToday = usage.count;
      identifiedBy = usage.identifiedBy;
    } catch (err) {
      if (err instanceof FreeTierCheckUnavailable) {
        c.header("Retry-After", "30");
        return c.json(
          apiError(
            "rate_limited",
            "Free-tier usage counter is temporarily unavailable. Retry in a few seconds, or sign up for an API key to bypass.",
            { retry_after_seconds: 30 },
          ),
          503,
        );
      }
      throw err;
    }
    const cap = identifiedBy === "fingerprint" ? FREE_TIER_FINGERPRINT_LIMIT : FREE_TIER_DAILY_LIMIT;

    if (callsToday >= cap) {
      const nextMidnight = new Date();
      nextMidnight.setUTCHours(24, 0, 0, 0);
      const retryAfterSeconds = Math.ceil((nextMidnight.getTime() - Date.now()) / 1000);
      c.header("X-RateLimit-Limit", String(cap));
      c.header("X-RateLimit-Remaining", "0");
      c.header("X-RateLimit-Reset", String(Math.ceil(nextMidnight.getTime() / 1000)));
      c.header("Retry-After", String(retryAfterSeconds));
      return c.json(
        apiError("rate_limited",
          `Free-tier daily limit reached (${cap} calls/day). Sign up at strale.dev/signup for unlimited access.`,
          { retry_after_seconds: retryAfterSeconds, limit: cap },
        ),
        429,
      );
    }

    return executeFreeTier(c, db, capability, executor, executionInput, outputSchema, sqs, freshness, dual);
  }

  // Free-tier with auth: skip wallet operations but still record transaction
  if (user && isFreeTier) {
    return executeFreeTierAuthenticated(c, db, user, capability, executor, executionInput, idempotencyKey, outputSchema, sqs, freshness, dual);
  }

  // Paid execution: sync or async (DEC-22)
  const isAsync = (capability.avgLatencyMs ?? 0) > ASYNC_THRESHOLD_MS;
  if (isAsync) {
    return executeAsync(c, db, user, capability, executor, executionInput, idempotencyKey, outputSchema, sqs, freshness, dual);
  } else {
    return executeSync(c, db, user, capability, executor, executionInput, idempotencyKey, outputSchema, sqs, freshness, dual);
  }
});

// ─── Free-tier daily limit (DB-based, restart-safe) ───────────────────────────
// Single source of truth for the daily cap. The DB counter survives Railway
// redeploys — no in-memory state to lose.

const FREE_TIER_DAILY_LIMIT = 10;       // 10 calls/day per identified IP
const FREE_TIER_FINGERPRINT_LIMIT = 3;  // 3 calls/day per fingerprint (conservative — may collide)

interface FreeTierUsage {
  count: number;
  identifiedBy: "ip" | "fingerprint" | "none";
}

/**
 * F-0-020: thrown when the counter query fails. The caller must translate
 * this into 503 (fail closed). Returning `count: 0` here would silently
 * disable the free-tier cap — exactly the bypass the finding flagged.
 */
export class FreeTierCheckUnavailable extends Error {
  constructor(cause?: unknown) {
    super("Free-tier usage counter is temporarily unavailable");
    this.name = "FreeTierCheckUnavailable";
    if (cause !== undefined) (this as { cause?: unknown }).cause = cause;
  }
}

async function getFreeTierUsageToday(
  db: ReturnType<typeof getDb>,
  ipHash: string | null,
  fingerprintHash: string | null,
): Promise<FreeTierUsage> {
  // Prefer IP identification; fall back to fingerprint.
  // F-0-020: any DB error now throws FreeTierCheckUnavailable — fail CLOSED.
  if (ipHash) {
    try {
      const [row] = await db.execute(sql`
        SELECT COUNT(*)::int AS cnt FROM transactions
        WHERE created_at >= CURRENT_DATE
          AND user_id IS NULL
          AND is_free_tier = true
          AND audit_trail->'request_context'->>'ipHash' = ${ipHash}
      `);
      return { count: (row as any)?.cnt ?? 0, identifiedBy: "ip" };
    } catch (err) {
      logError("free-tier-counter-read-failed", err, { identifiedBy: "ip" });
      throw new FreeTierCheckUnavailable(err);
    }
  }
  if (fingerprintHash) {
    try {
      const [row] = await db.execute(sql`
        SELECT COUNT(*)::int AS cnt FROM transactions
        WHERE created_at >= CURRENT_DATE
          AND user_id IS NULL
          AND is_free_tier = true
          AND audit_trail->'request_context'->>'fingerprintHash' = ${fingerprintHash}
      `);
      return { count: (row as any)?.cnt ?? 0, identifiedBy: "fingerprint" };
    } catch (err) {
      logError("free-tier-counter-read-failed", err, { identifiedBy: "fingerprint" });
      throw new FreeTierCheckUnavailable(err);
    }
  }
  return { count: 0, identifiedBy: "none" };
}

// Build usage summary for conversion emails (DEC-20260410-A)
async function buildUsageSummaryForUser(db: ReturnType<typeof getDb>, userId: string) {
  const [userRow] = await db
    .select({ createdAt: users.createdAt })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  const daysSinceSignup = userRow
    ? Math.max(1, Math.ceil((Date.now() - new Date(userRow.createdAt).getTime()) / 86_400_000))
    : 1;

  const rows = await db.execute(
    sql`SELECT capability_slug, COUNT(*)::int AS count
        FROM transactions
        WHERE user_id = ${userId} AND status = 'completed'
        GROUP BY capability_slug
        ORDER BY count DESC
        LIMIT 10`,
  );
  const capRows = Array.isArray(rows) ? rows : (rows as any)?.rows ?? [];

  const totalCalls = capRows.reduce((sum: number, r: any) => sum + (r.count ?? 0), 0);
  const [spentRow] = await db
    .select({ total: sql<number>`COALESCE(SUM(${transactions.priceCents}), 0)::int` })
    .from(transactions)
    .where(and(eq(transactions.userId, userId), eq(transactions.status, "completed")));

  return {
    totalCalls,
    daysSinceSignup,
    topCapabilities: capRows.map((r: any) => ({ slug: r.capability_slug, count: r.count })),
    totalSpentCents: spentRow?.total ?? 0,
  };
}

function buildUsageBlock(callsToday: number, cap: number): Record<string, unknown> {
  const nextMidnight = new Date();
  nextMidnight.setUTCHours(24, 0, 0, 0);

  const exceeded = callsToday >= cap;
  return {
    calls_today: callsToday,
    daily_limit: cap,
    resets_at: nextMidnight.toISOString(),
    ...(exceeded ? {
      limit_exceeded: true,
      message: "You've exceeded today's free limit. Sign up for €2 free credits to continue without interruption.",
    } : {}),
  };
}

// ─── Free-tier execution: unauthenticated, no wallet, persisted for audit ───

async function executeFreeTier(
  c: any,
  db: ReturnType<typeof getDb>,
  capability: CapabilityInfo,
  executor: (input: Record<string, unknown>) => Promise<any>,
  executionInput: Record<string, unknown>,
  outputSchema: Record<string, unknown>,
  sqs: { score: number; label: string; trend: string; pending: boolean },
  freshness: FreshnessInfo | null,
  dual: DualProfileSQSResult | null,
) {
  const startTime = Date.now();
  const marker = getTransparencyMarker(capability.transparencyTag);

  // Create a persisted transaction record so the audit trail is verifiable
  const [txnRecord] = await db
    .insert(transactions)
    .values({
      userId: null,
      capabilityId: capability.id,
      status: "executing",
      input: executionInput,
      priceCents: 0,
      transparencyMarker: marker,
      dataJurisdiction: getProcessingJurisdictions(capability.capabilityType, capability.transparencyTag).join(","),
      isFreeTier: true,
    })
    .returning({ id: transactions.id });

  try {
    const capResult = await executeWithRetry(executor, executionInput, capability);
    const latencyMs = Date.now() - startTime;

    const audit = buildFullAudit({
      transactionId: txnRecord.id,
      startTime,
      capability,
      marker,
      executionMode: "sync",
      latencyMs,
      executionInput,
      output: capResult.output,
      provenance: capResult.provenance,
      sqs,
      requestContext: c.get("requestContext" as any),
    });

    // If this call was x402-paid, settle NOW (after success). If settle
    // fails — rare, since verify already passed — mark the transaction
    // failed and surface a 402 so the caller knows the payment didn't land.
    const x402Verified = c.get("x402_verified" as any) as X402VerifiedPayment | undefined;
    let x402SettlementId: string | null = null;
    if (x402Verified) {
      const settled = await settleX402Payment(x402Verified);
      if (!settled.valid) {
        await db
          .update(transactions)
          .set({
            status: "failed",
            error: `Payment settlement failed: ${settled.error ?? "unknown"}`,
            latencyMs,
            completedAt: new Date(),
          })
          .where(eq(transactions.id, txnRecord.id));
        return c.json(
          {
            error_code: "payment_failed",
            message: "x402 settlement failed after successful execution.",
            detail: settled.error,
          },
          402,
        );
      }
      x402SettlementId = settled.settlementId ?? null;
    }

    await db
      .update(transactions)
      .set({
        status: "completed",
        output: capResult.output,
        provenance: capResult.provenance,
        auditTrail: audit,
        latencyMs,
        completedAt: new Date(),
        ...(x402SettlementId
          ? { paymentMethod: "x402", x402SettlementId, isFreeTier: false }
          : {}),
      })
      .where(eq(transactions.id, txnRecord.id));

    // Record circuit breaker + quality (fire-and-forget)
    fireAndForget(() => recordSuccess(capability.slug), { label: "circuit-breaker-record-success", context: { slug: capability.slug } });
    recordQuality({
      transactionId: txnRecord.id,
      responseTimeMs: latencyMs,
      output: capResult.output,
      outputSchema,
    });
    if (capResult.output) {
      fireAndForget(
        () => recordPiggybackResult(capability.slug, capResult.output, outputSchema, latencyMs),
        { label: "piggyback-record", context: { slug: capability.slug } },
      );
    }
    // F-0-009 Stage 2: the row lands with compliance_hash_state = 'pending'
    // by column default; jobs/integrity-hash-retry.ts will fill it in.

    const dualProfile = buildDualProfileResponse(dual, sqs, capability.lifecycleState);

    // Usage counter for free-tier calls (informational block in response).
    // F-0-020: enforcement above is fail-closed. This call site only builds
    // the informational `usage` block shown in a successful response, so a
    // counter read error here should NOT 500 the already-successful
    // execution — fall back to reporting the cap with count=0.
    const reqCtx = c.get("requestContext" as any) as { ipHash?: string | null; fingerprintHash?: string | null } | undefined;
    let callsToday = 0;
    let identifiedBy: "ip" | "fingerprint" | "none" = reqCtx?.ipHash ? "ip" : reqCtx?.fingerprintHash ? "fingerprint" : "none";
    try {
      const usage = await getFreeTierUsageToday(db, reqCtx?.ipHash ?? null, reqCtx?.fingerprintHash ?? null);
      callsToday = usage.count;
      identifiedBy = usage.identifiedBy;
    } catch (err) {
      if (!(err instanceof FreeTierCheckUnavailable)) throw err;
      // already logged inside getFreeTierUsageToday; carry the identifiedBy default
    }
    const usageCap = identifiedBy === "fingerprint" ? FREE_TIER_FINGERPRINT_LIMIT : FREE_TIER_DAILY_LIMIT;

    // Progressive unlock: record + include in response (DEC-20260410-A)
    const ipHashForUnlock = reqCtx?.ipHash ?? null;
    const newlyUnlocked = ipHashForUnlock ? recordUnlock(ipHashForUnlock, capability.slug) : [];
    const allUnlocked = ipHashForUnlock ? getUnlockedSlugs(ipHashForUnlock) : [];

    return c.json({
      result: {
        transaction_id: txnRecord.id,
        status: "completed",
        capability_used: capability.slug,
        price_cents: 0,
        latency_ms: latencyMs,
        output: capResult.output,
        provenance: capResult.provenance,
      },
      meta: {
        ...dualProfile,
        audit,
      },
      free_tier: true,
      usage: buildUsageBlock(callsToday, usageCap),
      ...(allUnlocked.length > 0 ? {
        unlocked: {
          capabilities: allUnlocked,
          message: `${newlyUnlocked.length > 0 ? newlyUnlocked.length + " new capabilities unlocked. " : ""}These capabilities are free for you for 24 hours — no signup needed.`,
          ttl_hours: 24,
        },
      } : {}),
      upgrade: buildUpgradeBlock(capability.slug, executionInput, capResult.output as Record<string, unknown>),
    });
  } catch (err) {
    const latencyMs = Date.now() - startTime;
    const errorMessage = err instanceof Error ? err.message : String(err);

    const failAudit = buildFailureAudit({
      transactionId: txnRecord.id, startTime, capability, executionInput,
      errorMessage, executionMode: "sync",
      requestContext: c.get("requestContext" as any),
    });
    const failProvenance = buildFailureProvenance(
      capability.dataSource, capability.capabilityType, capability.transparencyTag, "execution_error",
    );

    await db
      .update(transactions)
      .set({
        status: "failed", error: errorMessage, latencyMs, completedAt: new Date(),
        auditTrail: failAudit, provenance: failProvenance,
      })
      .where(eq(transactions.id, txnRecord.id));

    // F-0-009 Stage 2: the row lands with compliance_hash_state = 'pending'
    // by column default; jobs/integrity-hash-retry.ts will fill it in.
    fireAndForget(() => recordFailure(capability.slug, errorMessage), { label: "circuit-breaker-record-failure", context: { slug: capability.slug } });
    fireAndForget(() => triggerOnFailure(capability.slug), { label: "trigger-on-failure", context: { slug: capability.slug } });
    recordQuality({
      transactionId: txnRecord.id,
      responseTimeMs: latencyMs,
      output: null,
      outputSchema,
      error: errorMessage,
    });

    return c.json({
      ...apiError(
        "execution_failed",
        "The capability failed to execute.",
        { error: sanitizeFailureReason(errorMessage) },
      ),
      free_tier: true,
      upgrade: buildUpgradeBlock(capability.slug, executionInput),
    }, 500);
  }
}

// ─── Free-tier execution: authenticated, no wallet debit ────────────────────

async function executeFreeTierAuthenticated(
  c: any,
  db: ReturnType<typeof getDb>,
  user: { id: string },
  capability: CapabilityInfo,
  executor: (input: Record<string, unknown>) => Promise<any>,
  executionInput: Record<string, unknown>,
  idempotencyKey: string | null,
  outputSchema: Record<string, unknown>,
  sqs: { score: number; label: string; trend: string; pending: boolean },
  freshness: FreshnessInfo | null,
  dual: DualProfileSQSResult | null,
) {
  const startTime = Date.now();
  const marker = getTransparencyMarker(capability.transparencyTag);

  // Create transaction record (for usage history), but no wallet lock/debit
  const [txnRecord] = await db
    .insert(transactions)
    .values({
      userId: user.id,
      capabilityId: capability.id,
      idempotencyKey,
      status: "executing",
      input: executionInput,
      priceCents: 0,
      transparencyMarker: marker,
      dataJurisdiction: getProcessingJurisdictions(capability.capabilityType, capability.transparencyTag).join(","),
    })
    .returning({ id: transactions.id });

  try {
    const capResult = await executeWithRetry(executor, executionInput, capability);
    const latencyMs = Date.now() - startTime;

    const audit = buildFullAudit({
      transactionId: txnRecord.id,
      startTime,
      capability,
      marker,
      executionMode: "sync",
      latencyMs,
      executionInput,
      output: capResult.output,
      provenance: capResult.provenance,
      sqs,
      requestContext: c.get("requestContext" as any),
    });

    await db
      .update(transactions)
      .set({
        status: "completed",
        output: capResult.output,
        provenance: capResult.provenance,
        auditTrail: audit,
        latencyMs,
        completedAt: new Date(),
      })
      .where(eq(transactions.id, txnRecord.id));

    // Record circuit breaker + quality (fire-and-forget)
    fireAndForget(() => recordSuccess(capability.slug), { label: "circuit-breaker-record-success", context: { slug: capability.slug } });
    recordQuality({
      transactionId: txnRecord.id,
      responseTimeMs: latencyMs,
      output: capResult.output,
      outputSchema,
    });
    if (capResult.output) {
      fireAndForget(
        () => recordPiggybackResult(capability.slug, capResult.output, outputSchema, latencyMs),
        { label: "piggyback-record", context: { slug: capability.slug } },
      );
    }
    // F-0-009 Stage 2: the row lands with compliance_hash_state = 'pending'
    // by column default; jobs/integrity-hash-retry.ts will fill it in.
    // Activation hook: detect first successful call
    if (user) {
      fireAndForget(
        async () => {
          const { onFirstTransaction } = await import("../lib/activation-hook.js");
          return onFirstTransaction(user.id, capability.slug);
        },
        { label: "activation-hook", context: { userId: user.id, slug: capability.slug } },
      );
    }

    // Get wallet balance for response
    const [wallet] = await db
      .select({ balanceCents: wallets.balanceCents })
      .from(wallets)
      .where(eq(wallets.userId, user.id))
      .limit(1);

    const dualProfile = buildDualProfileResponse(dual, sqs, capability.lifecycleState);
    setCreditsHeaders(c, wallet?.balanceCents ?? 0, 0);
    return c.json({
      result: {
        transaction_id: txnRecord.id,
        status: "completed",
        capability_used: capability.slug,
        price_cents: 0,
        latency_ms: latencyMs,
        wallet_balance_cents: wallet?.balanceCents ?? 0,
        output: capResult.output,
        provenance: capResult.provenance,
      },
      meta: {
        ...dualProfile,
        audit,
      },
    });
  } catch (err) {
    const latencyMs = Date.now() - startTime;
    const errorMessage = err instanceof Error ? err.message : String(err);

    const failAudit = buildFailureAudit({
      transactionId: txnRecord.id, startTime, capability, executionInput,
      errorMessage, executionMode: "sync",
    });
    const failProvenance = buildFailureProvenance(
      capability.dataSource, capability.capabilityType, capability.transparencyTag, "execution_error",
    );

    await db
      .update(transactions)
      .set({
        status: "failed",
        error: errorMessage,
        latencyMs,
        completedAt: new Date(),
        auditTrail: failAudit,
        provenance: failProvenance,
      })
      .where(eq(transactions.id, txnRecord.id));

    // F-0-009 Stage 2: the row lands with compliance_hash_state = 'pending'
    // by column default; jobs/integrity-hash-retry.ts will fill it in.
    fireAndForget(() => recordFailure(capability.slug, errorMessage), { label: "circuit-breaker-record-failure", context: { slug: capability.slug } });
    fireAndForget(() => triggerOnFailure(capability.slug), { label: "trigger-on-failure", context: { slug: capability.slug } });
    recordQuality({
      transactionId: txnRecord.id,
      responseTimeMs: latencyMs,
      output: null,
      outputSchema,
      error: errorMessage,
    });

    const [wallet] = await db
      .select({ balanceCents: wallets.balanceCents })
      .from(wallets)
      .where(eq(wallets.userId, user.id))
      .limit(1);

    return c.json(
      apiError(
        "execution_failed",
        "The capability failed to execute. You were not charged.",
        {
          transaction_id: txnRecord.id,
          error: sanitizeFailureReason(errorMessage),
          wallet_balance_cents: wallet?.balanceCents ?? 0,
        },
      ),
      500,
    );
  }
}

// ─── Sync execution: lock → execute → debit on success (DEC-14) ────────────

async function executeSync(
  c: any,
  db: ReturnType<typeof getDb>,
  user: { id: string },
  capability: CapabilityInfo,
  executor: (input: Record<string, unknown>) => Promise<any>,
  executionInput: Record<string, unknown>,
  idempotencyKey: string | null,
  outputSchema: Record<string, unknown>,
  sqs: { score: number; label: string; trend: string; pending: boolean },
  freshness: FreshnessInfo | null,
  dual: DualProfileSQSResult | null,
) {
  const startTime = Date.now();

  type TxResult =
    | {
        ok: true;
        transactionId: string;
        output: unknown;
        provenance: unknown;
        latencyMs: number;
        balanceAfter: number;
      }
    | {
        ok: false;
        errorCode: "insufficient_balance";
        balance: number;
        required: number;
      }
    | {
        ok: false;
        errorCode: "execution_failed";
        error: string;
        transactionId: string;
        balanceAfter: number;
      };

  const result: TxResult = await db.transaction(async (tx) => {
    // Lock wallet row
    const [wallet] = await tx
      .select()
      .from(wallets)
      .where(eq(wallets.userId, user.id))
      .for("update");

    if (!wallet || wallet.balanceCents < capability.priceCents) {
      return {
        ok: false as const,
        errorCode: "insufficient_balance" as const,
        balance: wallet?.balanceCents ?? 0,
        required: capability.priceCents,
      };
    }

    // Determine transparency marker based on capability type
    const marker = getTransparencyMarker(capability.transparencyTag);

    // Create transaction record as "executing"
    const [txnRecord] = await tx
      .insert(transactions)
      .values({
        userId: user.id,
        capabilityId: capability.id,
        idempotencyKey,
        status: "executing",
        input: executionInput,
        priceCents: capability.priceCents,
        transparencyMarker: marker,
        dataJurisdiction: getProcessingJurisdictions(capability.capabilityType, capability.transparencyTag).join(","),
      })
      .returning({ id: transactions.id });

    // Execute the capability
    try {
      const capResult = await executeWithRetry(executor, executionInput, capability);
      const latencyMs = Date.now() - startTime;

      // Deduct from wallet
      const newBalance = wallet.balanceCents - capability.priceCents;
      await tx
        .update(wallets)
        .set({ balanceCents: newBalance, updatedAt: new Date() })
        .where(eq(wallets.id, wallet.id));

      // Log wallet transaction
      await tx.insert(walletTransactions).values({
        walletId: wallet.id,
        amountCents: -capability.priceCents,
        type: "purchase",
        referenceId: txnRecord.id,
        description: `Capability: ${capability.slug}`,
      });

      // Mark transaction completed with audit trail
      // Note: full audit object built after tx commits (needs quality data)
      await tx
        .update(transactions)
        .set({
          status: "completed",
          output: capResult.output,
          provenance: capResult.provenance,
          latencyMs,
          completedAt: new Date(),
        })
        .where(eq(transactions.id, txnRecord.id));

      return {
        ok: true as const,
        transactionId: txnRecord.id,
        output: capResult.output,
        provenance: capResult.provenance,
        latencyMs,
        balanceAfter: newBalance,
      };
    } catch (err) {
      const latencyMs = Date.now() - startTime;
      const errorMessage =
        err instanceof Error
          ? err.message
          : typeof err === "object" && err !== null && "message" in err
            ? String((err as { message: unknown }).message)
            : String(err);

      // Mark transaction failed — no charge (wallet not debited)
      const failAudit = buildFailureAudit({
        transactionId: txnRecord.id, startTime, capability, executionInput,
        errorMessage, executionMode: "sync",
      });
      const failProvenance = buildFailureProvenance(
        capability.dataSource, capability.capabilityType, capability.transparencyTag, "execution_error",
      );

      await tx
        .update(transactions)
        .set({
          status: "failed",
          error: errorMessage,
          latencyMs,
          completedAt: new Date(),
          auditTrail: failAudit,
          provenance: failProvenance,
        })
        .where(eq(transactions.id, txnRecord.id));

      return {
        ok: false as const,
        errorCode: "execution_failed" as const,
        error: errorMessage,
        transactionId: txnRecord.id,
        balanceAfter: wallet.balanceCents,
      };
    }
  });

  // ── Record circuit breaker + quality + piggyback (fire-and-forget) ───
  if (result.ok) {
    fireAndForget(() => recordSuccess(capability.slug), { label: "circuit-breaker-record-success", context: { slug: capability.slug } });
    recordQuality({
      transactionId: result.transactionId,
      responseTimeMs: result.latencyMs,
      output: result.output,
      outputSchema,
    });
    // Piggyback monitoring: validate output and record as test data point
    if (result.output) {
      fireAndForget(
        () => recordPiggybackResult(capability.slug, result.output, outputSchema, result.latencyMs),
        { label: "piggyback-record", context: { slug: capability.slug } },
      );
    }
    // Check transaction milestones (fire-and-forget)
    fireAndForget(
      async () => {
        const res: any = await db.execute(
          sql`SELECT COUNT(*)::text AS count FROM transactions WHERE status = 'completed' AND created_at >= DATE_TRUNC('day', NOW() AT TIME ZONE 'UTC')`,
        );
        const rows = Array.isArray(res) ? res : res?.rows ?? [];
        checkMilestone(Number(rows[0]?.count ?? 0));
      },
      { label: "milestone-check" },
    );
    // Activation hook: detect first successful call (sync paid)
    fireAndForget(
      async () => {
        const { onFirstTransaction } = await import("../lib/activation-hook.js");
        return onFirstTransaction(user.id, capability.slug);
      },
      { label: "activation-hook", context: { userId: user.id, slug: capability.slug } },
    );
  } else if (result.errorCode === "execution_failed") {
    fireAndForget(() => recordFailure(capability.slug, result.error), { label: "circuit-breaker-record-failure", context: { slug: capability.slug } });
    fireAndForget(() => triggerOnFailure(capability.slug), { label: "trigger-on-failure", context: { slug: capability.slug } });
    recordQuality({
      transactionId: result.transactionId,
      responseTimeMs: Date.now() - startTime,
      output: null,
      outputSchema,
      error: result.error,
    });
  }

  // ── Return response ───────────────────────────────────────────────────
  if (!result.ok && result.errorCode === "insufficient_balance") {
    return c.json(
      apiError(
        "insufficient_balance",
        `Your wallet has €${(result.balance / 100).toFixed(2)} but this capability costs €${(result.required / 100).toFixed(2)}.`,
        {
          wallet_balance_cents: result.balance,
          required_cents: result.required,
          topup_url: "/v1/wallet/topup",
          x402_fallback: `This capability is also available via x402 pay-per-call (USDC on Base). GET https://api.strale.io/x402/${capability.slug}`,
        },
      ),
      402,
    );
  }

  if (!result.ok && result.errorCode === "execution_failed") {
    return c.json(
      apiError(
        "execution_failed",
        "The capability failed to execute. You were not charged.",
        {
          transaction_id: result.transactionId,
          error: sanitizeFailureReason(result.error),
          wallet_balance_cents: result.balanceAfter,
        },
      ),
      500,
    );
  }

  // Derive pass_rate from already-loaded dual profile (avoids expensive DB query)
  const qualityPassRate = dual && !dual.qp.pending
    ? dual.qp.factors.correctness.rate
    : null;

  // Success — build full audit object
  const marker = getTransparencyMarker(capability.transparencyTag);
  const audit = buildFullAudit({
    transactionId: result.transactionId,
    startTime,
    capability,
    marker,
    executionMode: "sync",
    latencyMs: result.latencyMs,
    executionInput,
    output: result.output,
    provenance: result.provenance,
    sqs: { score: sqs.score, label: sqs.label, trend: sqs.trend ?? "stable", pending: sqs.pending },
    qualityPassRate,
    requestContext: c.get("requestContext" as any),
  });

  // Store full audit in DB (fire-and-forget, non-blocking). The retry
  // worker (jobs/integrity-hash-retry.ts) picks up the row once the
  // audit trail is persisted — by the time the worker's GRACE_MS window
  // elapses, this UPDATE will have committed.
  fireAndForget(
    () =>
      db
        .update(transactions)
        .set({ auditTrail: audit })
        .where(eq(transactions.id, result.transactionId)),
    { label: "audit-trail-store", context: { transactionId: result.transactionId, slug: capability.slug } },
  );

  const dualProfile = buildDualProfileResponse(dual, sqs, capability.lifecycleState);

  // Low-balance / zero-balance conversion emails (DEC-20260410-A, fire-and-forget)
  const LOW_BALANCE_THRESHOLD = 50; // €0.50
  const balanceBefore = result.balanceAfter + capability.priceCents;
  const userEmail = (user as any).email as string | undefined;
  if (userEmail && result.balanceAfter <= 0 && balanceBefore > 0) {
    // Just crossed zero
    fireAndForget(
      async () => {
        const { sendZeroBalanceEmail } = await import("../lib/conversion-emails.js");
        const usage = await buildUsageSummaryForUser(db, user.id);
        return sendZeroBalanceEmail(userEmail, usage);
      },
      { label: "conversion-email-zero-balance", context: { userId: user.id } },
    );
  } else if (userEmail && result.balanceAfter <= LOW_BALANCE_THRESHOLD && balanceBefore > LOW_BALANCE_THRESHOLD) {
    // Just crossed low-balance threshold
    fireAndForget(
      async () => {
        const { sendLowBalanceEmail } = await import("../lib/conversion-emails.js");
        const usage = await buildUsageSummaryForUser(db, user.id);
        return sendLowBalanceEmail(userEmail, result.balanceAfter, usage);
      },
      { label: "conversion-email-low-balance", context: { userId: user.id } },
    );
  }

  setCreditsHeaders(c, result.balanceAfter, capability.priceCents);
  return c.json({
    result: {
      transaction_id: result.transactionId,
      status: "completed",
      capability_used: capability.slug,
      price_cents: capability.priceCents,
      latency_ms: result.latencyMs,
      wallet_balance_cents: result.balanceAfter,
      output: result.output,
      provenance: result.provenance,
    },
    meta: {
      ...dualProfile,
      audit,
    },
  });
}

// TODO: Partial results for multi-step solution execution
// When solutions execute as a pipeline (e.g., company-due-diligence = 5 capability calls),
// each step should record its output independently so that:
// 1. GET /v1/transactions/:id can return partial_output with completed steps
// 2. If step 3/5 fails, steps 1-2 results are still available to the caller
// 3. The caller is charged only for steps that succeeded (pro-rata pricing)
// 4. The response includes a `steps` array with per-step status, output, and latency
// This requires: solution-aware execution in /v1/do (currently solutions are
// client-orchestrated as separate /v1/do calls per step).

// ─── Async execution: debit upfront → 202 → background → refund on failure ──

async function executeAsync(
  c: any,
  db: ReturnType<typeof getDb>,
  user: { id: string },
  capability: CapabilityInfo,
  executor: (input: Record<string, unknown>) => Promise<any>,
  executionInput: Record<string, unknown>,
  idempotencyKey: string | null,
  outputSchema: Record<string, unknown>,
  sqs: { score: number; label: string; trend: string; pending: boolean },
  freshness: FreshnessInfo | null,
  dual: DualProfileSQSResult | null,
) {
  // Short DB tx: lock wallet → check balance → debit → create record → commit
  type SetupResult =
    | {
        ok: true;
        transactionId: string;
        walletId: string;
        balanceAfter: number;
      }
    | {
        ok: false;
        errorCode: "insufficient_balance";
        balance: number;
        required: number;
      };

  const setupResult: SetupResult = await db.transaction(async (tx) => {
    const [wallet] = await tx
      .select()
      .from(wallets)
      .where(eq(wallets.userId, user.id))
      .for("update");

    if (!wallet || wallet.balanceCents < capability.priceCents) {
      return {
        ok: false as const,
        errorCode: "insufficient_balance" as const,
        balance: wallet?.balanceCents ?? 0,
        required: capability.priceCents,
      };
    }

    // Optimistic debit — refunded if execution fails
    const newBalance = wallet.balanceCents - capability.priceCents;
    await tx
      .update(wallets)
      .set({ balanceCents: newBalance, updatedAt: new Date() })
      .where(eq(wallets.id, wallet.id));

    // Create transaction record
    const marker = getTransparencyMarker(capability.transparencyTag);
    const [txnRecord] = await tx
      .insert(transactions)
      .values({
        userId: user.id,
        capabilityId: capability.id,
        idempotencyKey,
        status: "executing",
        input: executionInput,
        priceCents: capability.priceCents,
        transparencyMarker: marker,
        dataJurisdiction: getProcessingJurisdictions(capability.capabilityType, capability.transparencyTag).join(","),
      })
      .returning({ id: transactions.id });

    // Log wallet transaction (purchase)
    await tx.insert(walletTransactions).values({
      walletId: wallet.id,
      amountCents: -capability.priceCents,
      type: "purchase",
      referenceId: txnRecord.id,
      description: `Capability: ${capability.slug}`,
    });

    return {
      ok: true as const,
      transactionId: txnRecord.id,
      walletId: wallet.id,
      balanceAfter: newBalance,
    };
  });

  if (!setupResult.ok) {
    return c.json(
      apiError(
        "insufficient_balance",
        `Your wallet has €${(setupResult.balance / 100).toFixed(2)} but this capability costs €${(setupResult.required / 100).toFixed(2)}.`,
        {
          wallet_balance_cents: setupResult.balance,
          required_cents: setupResult.required,
          topup_url: "/v1/wallet/topup",
        },
      ),
      402,
    );
  }

  const { transactionId, walletId, balanceAfter } = setupResult;
  const startTime = Date.now();

  // Fire-and-forget: execute in background, update DB when done
  executeInBackground(
    db,
    executor,
    executionInput,
    transactionId,
    walletId,
    capability,
    startTime,
    outputSchema,
  ).catch((err) => {
    // Last-resort error logging — should not normally reach here
    logError("async-exec-unhandled", err, { transaction_id: transactionId });
  });

  // Return 202 immediately — client polls GET /v1/transactions/:id
  const dualProfile = buildDualProfileResponse(dual, sqs, capability.lifecycleState);
  return c.json(
    {
      result: {
        transaction_id: transactionId,
        status: "executing",
        capability_used: capability.slug,
        price_cents: capability.priceCents,
        wallet_balance_cents: balanceAfter,
      },
      meta: {
        ...dualProfile,
      },
    },
    202,
  );
}

async function executeInBackground(
  db: ReturnType<typeof getDb>,
  executor: (input: Record<string, unknown>) => Promise<any>,
  executionInput: Record<string, unknown>,
  transactionId: string,
  walletId: string,
  capability: CapabilityInfo,
  startTime: number,
  outputSchema: Record<string, unknown>,
) {
  try {
    const capResult = await executeWithRetry(executor, executionInput, capability);
    const latencyMs = Date.now() - startTime;

    // Success: update transaction record with full audit trail
    const marker = getTransparencyMarker(capability.transparencyTag);
    const audit = buildFullAudit({
      transactionId,
      startTime,
      capability,
      marker,
      executionMode: "async",
      latencyMs,
      executionInput,
      output: capResult.output,
      provenance: capResult.provenance,
      sqs: { score: 0, label: "unknown", trend: "stable", pending: true },
      requestContext: undefined, // background execution — no request context available
    });

    await db
      .update(transactions)
      .set({
        status: "completed",
        output: capResult.output,
        provenance: capResult.provenance,
        auditTrail: audit,
        latencyMs,
        completedAt: new Date(),
      })
      .where(eq(transactions.id, transactionId));

    // Record success for circuit breaker + quality + piggyback
    fireAndForget(() => recordSuccess(capability.slug), { label: "circuit-breaker-record-success", context: { slug: capability.slug } });
    recordQuality({
      transactionId,
      responseTimeMs: latencyMs,
      output: capResult.output,
      outputSchema,
    });
    // Piggyback monitoring
    if (capResult.output) {
      fireAndForget(
        () => recordPiggybackResult(capability.slug, capResult.output, outputSchema, latencyMs),
        { label: "piggyback-record", context: { slug: capability.slug } },
      );
    }
    // F-0-009 Stage 2: row already has compliance_hash_state = 'pending'
    // by column default; retry worker fills it in.

    // Check transaction milestones (fire-and-forget)
    fireAndForget(
      async () => {
        const res: any = await db.execute(
          sql`SELECT COUNT(*)::text AS count FROM transactions WHERE status = 'completed' AND created_at >= DATE_TRUNC('day', NOW() AT TIME ZONE 'UTC')`,
        );
        const rows = Array.isArray(res) ? res : res?.rows ?? [];
        checkMilestone(Number(rows[0]?.count ?? 0));
      },
      { label: "milestone-check" },
    );
  } catch (err) {
    const latencyMs = Date.now() - startTime;
    const errorMessage =
      err instanceof Error
        ? err.message
        : typeof err === "object" && err !== null && "message" in err
          ? String((err as { message: unknown }).message)
          : String(err);

    // Failure: refund wallet + update transaction in a single tx
    await db.transaction(async (tx) => {
      // Refund the optimistic debit — SELECT FOR UPDATE to prevent race conditions (DEC-8)
      const [walletRow] = await tx
        .select({ b: wallets.balanceCents })
        .from(wallets)
        .where(eq(wallets.id, walletId))
        .for("update");
      await tx
        .update(wallets)
        .set({
          balanceCents: walletRow.b + capability.priceCents,
          updatedAt: new Date(),
        })
        .where(eq(wallets.id, walletId));

      // Log refund
      await tx.insert(walletTransactions).values({
        walletId,
        amountCents: capability.priceCents,
        type: "refund",
        referenceId: transactionId,
        description: `Refund: ${capability.slug} execution failed`,
      });

      // Mark transaction failed with audit trail
      const failAudit = buildFailureAudit({
        transactionId, startTime, capability, executionInput,
        errorMessage, executionMode: "async",
      });
      const failProvenance = buildFailureProvenance(
        capability.dataSource, capability.capabilityType, capability.transparencyTag, "execution_error",
      );

      await tx
        .update(transactions)
        .set({
          status: "failed",
          error: errorMessage,
          latencyMs,
          completedAt: new Date(),
          auditTrail: failAudit,
          provenance: failProvenance,
        })
        .where(eq(transactions.id, transactionId));
    });

    // F-0-009 Stage 2: row already has compliance_hash_state = 'pending'
    // by column default; retry worker fills it in.
    // Record failure for circuit breaker + quality
    fireAndForget(() => recordFailure(capability.slug, errorMessage), { label: "circuit-breaker-record-failure", context: { slug: capability.slug } });
    fireAndForget(() => triggerOnFailure(capability.slug), { label: "trigger-on-failure", context: { slug: capability.slug } });
    recordQuality({
      transactionId,
      responseTimeMs: latencyMs,
      output: null,
      outputSchema,
      error: errorMessage,
    });
  }
}

// ─── Free-tier slug cache (refreshed every 5 minutes) ───────────────────────

let _freeTierCache: { slugs: string[]; expiresAt: number } | null = null;

async function getFreeTierSlugs(db: ReturnType<typeof getDb>): Promise<string[]> {
  if (_freeTierCache && Date.now() < _freeTierCache.expiresAt) {
    return _freeTierCache.slugs;
  }
  const rows = await db
    .select({ slug: capabilities.slug })
    .from(capabilities)
    .where(and(eq(capabilities.isFreeTier, true), eq(capabilities.isActive, true), eq(capabilities.lifecycleState, "active")));
  const slugs = rows.map((r) => r.slug);
  _freeTierCache = { slugs, expiresAt: Date.now() + 5 * 60 * 1000 };
  return slugs;
}

// ─── Audit trail helpers ──────────────────────────────────────────────────────

function hashInput(input: Record<string, unknown>): string {
  return `sha256:${createHash("sha256").update(JSON.stringify(input)).digest("hex")}`;
}

function buildFreeTierAudit(capability: CapabilityInfo, latencyMs: number) {
  const marker = getTransparencyMarker(capability.transparencyTag);
  return {
    timestamp: new Date().toISOString(),
    capability: capability.slug,
    data_source: capability.dataSource ?? capability.name,
    data_classification: capability.dataClassification ?? "unknown",
    transparency_marker: marker,
    ai_description: getAiDescription(capability.slug, marker),
    data_jurisdiction: "EU",
    processing_location: "eu-west (Railway EU)",
    execution_mode: "sync",
    latency_ms: latencyMs,
    schema_validated: true,
    compliance: {
      ai_involvement: getAiDescription(capability.slug, marker),
      // F-A-003 + SA.2b.d: manifest-declared classification is authoritative.
      // Heuristic fallback was deleted after migration 0050 made the column
      // NOT NULL across all 307 capabilities.
      personal_data_processed: capability.processesPersonalData,
      personal_data_categories: capability.personalDataCategories ?? [],
      applicable_regulations: ["EU AI Act (Articles 12, 13, 50)"],
      notes: "Free-tier call — no transaction record stored. Upgrade for full audit trail with shareable compliance URLs.",
    },
  };
}

function buildFullAudit(params: {
  transactionId: string;
  startTime: number;
  capability: CapabilityInfo;
  marker: string;
  executionMode: "sync" | "async";
  latencyMs: number;
  executionInput: Record<string, unknown>;
  output: unknown;
  provenance?: unknown;
  sqs: { score: number; label: string; trend: string; pending: boolean };
  qualityPassRate?: number | null;
  requestContext?: {
    referer: string | null;
    origin: string | null;
    userAgent: string | null;
    ipHash?: string | null;
    acceptLanguage?: string | null;
    mcpClient?: string | null;
  };
}) {
  const {
    transactionId, startTime, capability, marker, executionMode,
    latencyMs, executionInput, output, provenance, sqs, qualityPassRate,
    requestContext,
  } = params;

  // F-A-003 + F-A-009 + SA.2b.d: manifest-declared classification is
  // the authoritative source. Heuristic fallback was deleted after
  // migration 0050 made processes_personal_data NOT NULL.
  const personalDataDetected = capability.processesPersonalData;
  const personalDataCategories = capability.personalDataCategories ?? [];

  // F-A-006: issue shareable URL + expiry once so both fields reference
  // the same token (two calls would produce two tokens with drifting
  // expires_at values — same-second or off-by-one).
  const shareable = getShareableUrl(transactionId);

  return {
    transaction_id: transactionId,
    timestamp: new Date(startTime).toISOString(),
    completed_at: new Date().toISOString(),
    capability: capability.slug,
    data_source: capability.dataSource ?? capability.name,
    data_source_url: getDataSourceUrl(capability.slug),
    data_classification: capability.dataClassification ?? "unknown",
    transparency_marker: marker,
    ai_description: getAiDescription(capability.slug, marker),
    data_jurisdiction: "EU",
    processing_location: "eu-west (Railway EU)",
    execution_mode: executionMode,
    latency_ms: latencyMs,
    input_hash: hashInput(executionInput),
    request_context: requestContext ?? null,
    schema_validated: true,
    quality: {
      sqs: sqs.pending ? null : sqs.score,
      label: sqs.label,
      pass_rate: qualityPassRate ?? null,
    },
    provenance: provenance ?? null,
    compliance: {
      ai_involvement: getAiDescription(capability.slug, marker),
      personal_data_processed: personalDataDetected,
      personal_data_categories: personalDataCategories,
      human_oversight: "autonomous",
      human_oversight_description: "Automated execution with schema validation. No human review required for this capability.",
      data_retention_days: TRANSACTION_RETENTION_DAYS,
      deletion_endpoint: `DELETE /v1/transactions/${transactionId}`,
      access_endpoint: `GET /v1/transactions/${transactionId}`,
      shareable_url: shareable.url,
      shareable_url_expires_at: shareable.expiresAt,
      regulations_addressed: {
        eu_ai_act: {
          article_12: "Full execution logging with timestamps, data sources, and latency",
          article_13: "Transparency markers indicating AI vs algorithmic processing",
          article_14: "Human oversight classification documented",
          article_50: "AI-generated content marked via transparency_marker field",
        },
        gdpr: {
          article_30: "Complete processing record with data sources, classifications, and jurisdiction",
          article_15: `Transaction data accessible via GET /v1/transactions/${transactionId}`,
          article_17: `Transaction data deletable via DELETE /v1/transactions/${transactionId}`,
        },
        notes: personalDataDetected
          ? "Personal data detected in this transaction. DPIA may be required."
          : "No personal data detected. No DPIA required.",
      },
    },
  };
}

// ─── Failure audit trail (EU AI Act Art. 12 — log ALL executions) ─────────────

function buildFailureAudit(params: {
  transactionId: string;
  startTime: number;
  capability: CapabilityInfo;
  executionInput: Record<string, unknown>;
  errorMessage: string;
  executionMode: "sync" | "async";
  requestContext?: {
    referer: string | null;
    origin: string | null;
    userAgent: string | null;
    ipHash?: string | null;
    fingerprintHash?: string | null;
    acceptLanguage?: string | null;
    mcpClient?: string | null;
  };
}) {
  const { transactionId, startTime, capability, executionInput, errorMessage, executionMode, requestContext } = params;
  const marker = getTransparencyMarker(capability.transparencyTag);
  return {
    transaction_id: transactionId,
    status: "failed",
    started_at: new Date(startTime).toISOString(),
    failed_at: new Date().toISOString(),
    capability: capability.slug,
    data_source: capability.dataSource ?? capability.name,
    transparency_marker: marker,
    data_jurisdiction: getProcessingJurisdictions(capability.capabilityType, capability.transparencyTag).join(","),
    processing_location: "eu-west (Railway EU)",
    execution_mode: executionMode,
    latency_ms: Date.now() - startTime,
    input_hash: hashInput(executionInput),
    request_context: requestContext ?? null,
    error_message: errorMessage.substring(0, 500),
    compliance: {
      ai_involvement: getAiDescription(capability.slug, marker),
      regulations_addressed: {
        eu_ai_act: { article_12: "Failure logging — execution attempted and error captured" },
      },
    },
  };
}

// F-0-009 Stage 2: the former `storeIntegrityHash` helper that lived
// here has moved to jobs/integrity-hash-retry.ts. Transactions are
// inserted with compliance_hash_state = 'pending' via the column
// default; the worker fills in the hash.

// ─── EU AI Act transparency markers (DEC-20260226-P-s3t4) ─────────────────────
// Derived from the capabilities table's transparency_tag column.
// 'algorithmic' = pure logic/API, 'hybrid' = mixed LLM+algo, 'ai_generated' = uses LLM
function getTransparencyMarker(transparencyTag: string | null): string {
  if (transparencyTag === "algorithmic") return "algorithmic";
  if (transparencyTag === "mixed") return "hybrid";
  return "ai_generated";
}
