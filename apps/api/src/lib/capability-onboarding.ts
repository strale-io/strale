/**
 * Automated capability onboarding hook.
 * When a new capability is inserted, auto-generates test suites
 * and detects the transparency tag.
 */

import { eq, and } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { capabilities, testSuites } from "../db/schema.js";
import { generateTestInput } from "./test-input-generator.js";

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

  // 3. Validate metadata completeness (warnings only — does not block creation)
  const metadataWarnings = validateMetadataCompleteness(cap);
  if (metadataWarnings.length > 0) {
    console.log(`[onboarding] Metadata warnings for ${capabilitySlug}:`);
    for (const w of metadataWarnings) {
      const icon = w.severity === "warning" ? "⚠️" : "ℹ️";
      console.log(`  ${icon} ${w.field}: ${w.message}`);
    }
  }
}

// ─── Metadata completeness validation ────────────────────────────────────────

export interface MetadataWarning {
  field: string;
  severity: "warning" | "info";
  message: string;
}

export function validateMetadataCompleteness(
  cap: typeof capabilities.$inferSelect,
): MetadataWarning[] {
  const warnings: MetadataWarning[] = [];

  // 1. Name quality — becomes the <title> tag on strale.dev
  if (!cap.name || cap.name.trim().length === 0) {
    warnings.push({ field: "name", severity: "warning", message: "Missing name — required for SEO page title" });
  } else if (cap.name.length < 5) {
    warnings.push({ field: "name", severity: "warning", message: `Name too short (${cap.name.length} chars) — weak SEO signal` });
  }

  // 2. Description quality — becomes <meta description>
  if (!cap.description || cap.description.trim().length === 0) {
    warnings.push({ field: "description", severity: "warning", message: "Missing description — required for SEO meta description and agent tool selection" });
  } else if (cap.description.length < 50) {
    warnings.push({ field: "description", severity: "warning", message: `Description too short (${cap.description.length} chars) — aim for 50-160 chars for SEO` });
  } else if (cap.description.length > 300) {
    warnings.push({ field: "description", severity: "info", message: `Description long (${cap.description.length} chars) — will be truncated to 155 chars in meta description` });
  }

  // 3. Category — needed for filtering and search
  if (!cap.category || cap.category.trim().length === 0) {
    warnings.push({ field: "category", severity: "warning", message: "Missing category" });
  }

  // 4. Input schema parameter descriptions — affects MCP Scoreboard Schema Completeness score
  const inputSchema = cap.inputSchema as Record<string, any> | null;
  if (inputSchema?.properties) {
    const props = inputSchema.properties as Record<string, any>;
    const propsWithoutDesc = Object.entries(props)
      .filter(([_, prop]) => !prop.description || prop.description.trim().length === 0)
      .map(([key]) => key);
    if (propsWithoutDesc.length > 0) {
      warnings.push({
        field: "inputSchema",
        severity: "warning",
        message: `${propsWithoutDesc.length} parameter(s) missing descriptions: ${propsWithoutDesc.join(", ")} — hurts MCP Scoreboard schema score and agent tool selection`,
      });
    }
  } else {
    warnings.push({ field: "inputSchema", severity: "warning", message: "Missing inputSchema — agents cannot discover parameters" });
  }

  // 5. Output schema — helps agents understand what they'll get back
  const outputSchema = cap.outputSchema as Record<string, any> | null;
  if (!outputSchema?.properties || Object.keys(outputSchema.properties).length === 0) {
    warnings.push({ field: "outputSchema", severity: "info", message: "Missing or empty outputSchema — agents cannot validate responses" });
  }

  // 6. Price — needed for agent cost awareness
  if (cap.priceCents === null || cap.priceCents === undefined) {
    warnings.push({ field: "priceCents", severity: "warning", message: "Missing price" });
  }

  return warnings;
}

// ─── Input generation (shared with generate-tests.ts) ────────────────────────

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
