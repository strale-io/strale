/**
 * Automated capability onboarding hook.
 * When a new capability is inserted, auto-generates test suites
 * and detects the transparency tag.
 */

import { eq, and } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { capabilities, testSuites } from "../db/schema.js";

/**
 * Call after a capability is inserted or updated in the database.
 * Idempotent — safe to call multiple times for the same slug.
 */
export async function onCapabilityCreated(capabilitySlug: string): Promise<void> {
  const db = getDb();

  const [cap] = await db
    .select()
    .from(capabilities)
    .where(eq(capabilities.slug, capabilitySlug))
    .limit(1);

  if (!cap) return;

  // 1. Generate test suites if none exist
  const existingSuites = await db
    .select({ id: testSuites.id })
    .from(testSuites)
    .where(eq(testSuites.capabilitySlug, capabilitySlug))
    .limit(1);

  if (existingSuites.length === 0) {
    const inputSchema = (cap.inputSchema ?? {}) as Record<string, unknown>;
    const outputSchema = (cap.outputSchema ?? {}) as Record<string, unknown>;
    const testInput = generateTestInput(inputSchema);
    const outputChecks = getOutputChecks(outputSchema);

    // Schema check test (dry_run — FREE)
    await db.insert(testSuites).values({
      capabilitySlug,
      testName: `${cap.name} — schema check`,
      testType: "schema_check",
      input: testInput,
      validationRules: outputChecks,
      scheduleTier: "B",
      estimatedCostCents: 0, // dry-run, no external calls
    });

    // Error handling test (negative — fails fast, near-free)
    await db.insert(testSuites).values({
      capabilitySlug,
      testName: `${cap.name} — empty input`,
      testType: "negative",
      input: {},
      validationRules: { checks: [] },
      scheduleTier: "B",
      estimatedCostCents: 0,
    });

    console.log(`[onboarding] Created test suites for ${capabilitySlug}`);
  }

  // 2. Auto-detect transparency tag if not set
  if (!cap.transparencyTag) {
    const tag = detectTransparencyTag(capabilitySlug);
    if (tag) {
      await db
        .update(capabilities)
        .set({ transparencyTag: tag, updatedAt: new Date() })
        .where(eq(capabilities.id, cap.id));
      console.log(`[onboarding] Set transparency tag for ${capabilitySlug}: ${tag}`);
    }
  }
}

// ─── Input generation (shared with generate-tests.ts) ────────────────────────

function generateTestInput(
  inputSchema: Record<string, unknown>,
): Record<string, unknown> {
  const input: Record<string, unknown> = {};
  const props = (inputSchema as { properties?: Record<string, any> }).properties;
  if (!props) return input;

  const required = new Set(
    (inputSchema as { required?: string[] }).required ?? [],
  );

  for (const [key, prop] of Object.entries(props)) {
    const name = key.toLowerCase();

    if (prop.example !== undefined) { input[key] = prop.example; continue; }
    if (prop.default !== undefined) { input[key] = prop.default; continue; }

    // Field name heuristics (condensed from generate-tests.ts)
    if (name.includes("url") || name.includes("website")) { input[key] = "https://example.com"; continue; }
    if (name === "domain" || name === "hostname" || name === "host") { input[key] = "google.com"; continue; }
    if (name.includes("email")) { input[key] = "test@google.com"; continue; }
    if (name.includes("iban")) { input[key] = "DE89370400440532013000"; continue; }
    if (name === "bic" || name.includes("swift")) { input[key] = "COBADEFFXXX"; continue; }
    if (name.includes("vat") && name.includes("number")) { input[key] = "SE556703748501"; continue; }
    if (["org_number", "organization_number", "registration_number", "company_number", "cvr_number", "business_id", "registry_code"].includes(name)) { input[key] = "556703-7485"; continue; }
    if (name === "company" || name === "company_name" || name === "name") { input[key] = "Google"; continue; }
    if (name === "country_code" || name === "country") { input[key] = "SE"; continue; }
    if (name === "currency" || name === "currency_code") { input[key] = "EUR"; continue; }
    if (name === "amount") { input[key] = 100; continue; }
    if (name === "ip" || name === "ip_address") { input[key] = "8.8.8.8"; continue; }
    if (name.includes("text") || name.includes("content") || name.includes("description") || name.includes("body") || name.includes("message")) { input[key] = "Test input for automated capability testing."; continue; }
    if (name.includes("search") || name.includes("keyword") || name === "query") { input[key] = "artificial intelligence"; continue; }

    // Type-based fallbacks for required fields
    if (!required.has(key)) continue;
    if (prop.type === "string") input[key] = "test_value";
    else if (prop.type === "number" || prop.type === "integer") input[key] = 1;
    else if (prop.type === "boolean") input[key] = true;
    else if (prop.type === "array") input[key] = ["test_item"];
    else if (prop.type === "object") input[key] = { key: "value" };
  }

  return input;
}

function getOutputChecks(
  outputSchema: Record<string, unknown>,
): { checks: Array<{ field: string; operator: string }> } {
  const props = (outputSchema as { properties?: Record<string, any> }).properties;
  if (!props) return { checks: [] };
  const keys = Object.keys(props).slice(0, 3);
  return { checks: keys.map((k) => ({ field: k, operator: "not_null" })) };
}

// ─── Transparency tag detection ──────────────────────────────────────────────

// Known algorithmic capabilities (no AI/LLM involved)
const KNOWN_ALGORITHMIC_PATTERNS = [
  "validate", "lookup", "check", "parse", "convert", "calculate",
  "generate-reference", "detect", "explain", "format", "decode",
  "estimate", "classify",
];

const KNOWN_AI_PATTERNS = [
  "extract", "enrich", "analyze", "summarize", "redact", "translate",
  "search", // some search capabilities use Claude
];

function detectTransparencyTag(slug: string): string | null {
  const lower = slug.toLowerCase();

  // Check for AI patterns first (these override algorithmic)
  for (const pattern of KNOWN_AI_PATTERNS) {
    if (lower.includes(pattern)) return "ai_generated";
  }

  for (const pattern of KNOWN_ALGORITHMIC_PATTERNS) {
    if (lower.includes(pattern)) return "algorithmic";
  }

  // Default to algorithmic — safer assumption
  return "algorithmic";
}
