/**
 * Piggyback monitoring — validates output from real /v1/do traffic
 * and records it as a test data point. Zero cost since we're just
 * validating output we already have from a customer call.
 */

import { eq, and } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { checkGuaranteedFieldsPresent } from "./guaranteed-fields-sentinel.js";
import { sendAlert } from "./alerting.js";
import { isReportOnly } from "./manifest-publication-policy.js";
import { log } from "./log.js";
import { testSuites, testResults, capabilities } from "../db/schema.js";

/**
 * Record a piggyback test result from a real customer execution.
 * Fire-and-forget — never blocks the response.
 */
export async function recordPiggybackResult(
  capabilitySlug: string,
  output: unknown,
  outputSchema: Record<string, unknown>,
  responseTimeMs: number,
): Promise<void> {
  const db = getDb();

  // Get or create the piggyback test suite for this capability
  const suiteId = await getOrCreatePiggybackSuite(capabilitySlug);

  const capability = await getReliability(capabilitySlug);
  const misses = checkGuaranteedFieldsPresent(output, (capability?.reliability ?? {}) as Record<string, string>).missingFields ?? [];
  const schemaValid = validateOutputAgainstSchema(output, outputSchema);

  await db.insert(testResults).values({
    testSuiteId: suiteId,
    capabilitySlug,
    passed: schemaValid,
    actualOutput: output as Record<string, unknown>,
    failureReason: [!schemaValid ? "Output does not match output_schema" : null,
      misses.length ? `Guaranteed fields missing: ${misses.join(", ")}` : null].filter(Boolean).join("; ") || null,
    responseTimeMs: Math.min(responseTimeMs, 30_000),
  });

  await observeGuaranteedFields(capabilitySlug, misses, isReportOnly({}, capability ?? {}));

  // A successful piggyback result resets the test schedule clock —
  // real user traffic is a stronger signal than a scheduled test.
  if (schemaValid) {
    await db
      .update(capabilities)
      .set({ lastTestedAt: new Date() })
      .where(eq(capabilities.slug, capabilitySlug));
  }
}

// ─── Internal helpers ────────────────────────────────────────────────────────

// Reliability is advisory monitoring metadata; refresh every five minutes.
export const RELIABILITY_CACHE_TTL_MS = 5 * 60 * 1000;
type ReliabilityMetadata = Pick<typeof capabilities.$inferSelect, "category" | "gdprArt22Classification"> & { reliability: unknown };
const reliabilityCache = new Map<string, { expires: number; value: Promise<ReliabilityMetadata | undefined> }>();
async function getReliability(slug: string): Promise<ReliabilityMetadata | undefined> {
  const now = Date.now();
  const cached = reliabilityCache.get(slug);
  if (cached && now < cached.expires) return cached.value;
  for (const [key, entry] of reliabilityCache) if (now >= entry.expires) reliabilityCache.delete(key);
  const value = (async () => {
    const [row] = await getDb().select({ reliability: capabilities.outputFieldReliability, category: capabilities.category,
      gdprArt22Classification: capabilities.gdprArt22Classification }).from(capabilities).where(eq(capabilities.slug, slug)).limit(1);
    return row;
  })();
  reliabilityCache.set(slug, { expires: now + RELIABILITY_CACHE_TTL_MS, value });
  try { return await value; }
  catch (err) { reliabilityCache.delete(slug); throw err; }
}

// In-memory cache of piggyback suite IDs
const piggybackSuiteCache = new Map<string, string>();

async function getOrCreatePiggybackSuite(capabilitySlug: string): Promise<string> {
  const cached = piggybackSuiteCache.get(capabilitySlug);
  if (cached) return cached;

  const db = getDb();

  // Look for existing piggyback suite
  const [existing] = await db
    .select({ id: testSuites.id })
    .from(testSuites)
    .where(
      and(
        eq(testSuites.capabilitySlug, capabilitySlug),
        eq(testSuites.testType, "piggyback"),
      ),
    )
    .limit(1);

  if (existing) {
    piggybackSuiteCache.set(capabilitySlug, existing.id);
    return existing.id;
  }

  // Create new piggyback suite
  const [created] = await db
    .insert(testSuites)
    .values({
      capabilitySlug,
      testName: `${capabilitySlug} — piggyback monitor`,
      testType: "piggyback",
      input: {},
      validationRules: { checks: [] },
      scheduleTier: "A", // irrelevant — runs on customer traffic, not schedule
      estimatedCostCents: 0,
    })
    .returning({ id: testSuites.id });

  piggybackSuiteCache.set(capabilitySlug, created.id);
  return created.id;
}

function validateOutputAgainstSchema(
  output: unknown,
  schema: Record<string, unknown>,
): boolean {
  if (!output || typeof output !== "object" || Array.isArray(output)) {
    return schema.type !== "object";
  }

  const outputObj = output as Record<string, unknown>;
  const required = (schema as { required?: string[] }).required ?? [];

  for (const field of required) {
    if (!(field in outputObj) || outputObj[field] == null) {
      return false;
    }
  }

  return true;
}

// One-hour process-local tumbling windows. Misses also persist per result above,
// so restart/replica boundaries never erase the underlying evidence. No outputs
// or input values enter alert bodies. No claim is ever changed by this monitor.
export const GUARANTEED_WINDOW_MS = 60 * 60 * 1000;
export const GUARANTEED_MIN_CALLS = 20;
export const GUARANTEED_MISS_THRESHOLD = 0.10;
export class GuaranteedFieldWindow {
  private tools = new Map<string, { start: number; calls: number; misses: Map<string, number>; alerted: boolean; attempts: number; retryAt: number }>();
  observe(slug: string, missing: string[], now = Date.now()) {
    for (const [key, value] of this.tools) if (now - value.start >= GUARANTEED_WINDOW_MS) this.tools.delete(key);
    let entry = this.tools.get(slug);
    if (!entry) { entry = { start: now, calls: 0, misses: new Map(), alerted: false, attempts: 0, retryAt: 0 }; this.tools.set(slug, entry); }
    entry.calls++;
    for (const field of new Set(missing)) entry.misses.set(field, (entry.misses.get(field) ?? 0) + 1);
    const fields = [...entry.misses].filter(([, count]) => count / entry.calls > GUARANTEED_MISS_THRESHOLD);
    if (entry.calls < GUARANTEED_MIN_CALLS || entry.alerted || entry.attempts >= 3 || now < entry.retryAt || fields.length === 0) return null;
    entry.alerted = true;
    entry.attempts++;
    return { calls: entry.calls, fields: Object.fromEntries(fields), window_ms: GUARANTEED_WINDOW_MS };
  }
  deliveryFailed(slug: string, now = Date.now()) {
    const entry = this.tools.get(slug);
    if (entry) { entry.alerted = false; entry.retryAt = now + 60_000; }
  }
}
const guaranteedWindow = new GuaranteedFieldWindow();
async function observeGuaranteedFields(slug: string, misses: string[], reportOnly: boolean) {
  const breach = guaranteedWindow.observe(slug, misses);
  if (!breach) return;
  log.warn({ label: "guaranteed-fields-missing", slug, ...breach }, "Guaranteed output fields missing on real traffic");
  const delivered = await sendAlert({ severity: "warning", subject: `Guaranteed output fields missing: ${slug}`,
    body: `${slug}: ${JSON.stringify(breach)}. Per-field miss rate exceeds 10% after at least 20 calls in a process-local hour. ` +
      (reportOnly ? "Compliance/methodology: Petter decides any public claim change." : "Proposal: investigate the executor and consider narrowing reliability only after review.") });
  if (!delivered) guaranteedWindow.deliveryFailed(slug);
}
