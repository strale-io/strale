import { sql } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { logError } from "./log.js";
import { isCapabilityRefusal } from "./capability-refusal.js";

/**
 * Quality signal data collected during capability execution.
 */
export interface QualityData {
  transactionId: string;
  responseTimeMs: number;
  upstreamLatencyMs?: number;
  output: unknown;
  outputSchema: Record<string, unknown>;
  error?: Error | string | null;
}

/**
 * Record quality signals for a transaction.
 * Fire-and-forget — errors are logged but never propagated.
 */
export function recordQuality(data: QualityData): void {
  captureQuality(data).catch((err) => {
    logError("quality-capture-failed", err, { transaction_id: data.transactionId });
  });
}

async function captureQuality(data: QualityData): Promise<void> {
  const db = getDb();

  const { fieldsReturned, fieldsExpected, fieldCompletenessPct } =
    countFields(data.output, data.outputSchema);

  const schemaConformant = validateSchema(data.output, data.outputSchema);
  const errorType = categorizeError(data.error);

  // Cap at timeout threshold to prevent outliers from skewing quality aggregation (DEC-20260304-C)
  const cappedResponseTimeMs = Math.min(data.responseTimeMs, 30_000);

  // Atomic insert: skip if the parent transaction has been soft-deleted
  // since the capture was scheduled. Closes the read-then-insert race
  // against user DELETE (SA.2a.3a Sub-report D).
  await db.execute(sql`
    INSERT INTO transaction_quality (
      transaction_id, response_time_ms, upstream_latency_ms,
      schema_conformant, fields_returned, fields_expected,
      field_completeness_pct, error_type, quality_flags
    )
    SELECT ${data.transactionId}::uuid, ${cappedResponseTimeMs}, ${data.upstreamLatencyMs ?? null},
           ${schemaConformant}, ${fieldsReturned}, ${fieldsExpected},
           ${fieldCompletenessPct.toFixed(2)}, ${errorType}, ${JSON.stringify(buildFlags(data))}::jsonb
    WHERE EXISTS (
      SELECT 1 FROM transactions
      WHERE id = ${data.transactionId}::uuid AND deleted_at IS NULL
    )
  `);
}

/**
 * Count non-null fields in the output vs fields defined in the output schema.
 */
function countFields(
  output: unknown,
  outputSchema: Record<string, unknown>,
): {
  fieldsReturned: number;
  fieldsExpected: number;
  fieldCompletenessPct: number;
} {
  // Extract expected field names from JSON Schema properties
  const properties =
    (outputSchema as { properties?: Record<string, unknown> }).properties ?? {};
  const fieldsExpected = Object.keys(properties).length;

  if (fieldsExpected === 0) {
    return { fieldsReturned: 0, fieldsExpected: 0, fieldCompletenessPct: 100 };
  }

  // Count non-null fields in the output that match schema properties
  let fieldsReturned = 0;
  if (output && typeof output === "object" && !Array.isArray(output)) {
    const outputObj = output as Record<string, unknown>;
    for (const key of Object.keys(properties)) {
      if (key in outputObj && outputObj[key] != null) {
        fieldsReturned++;
      }
    }
  }

  const fieldCompletenessPct = (fieldsReturned / fieldsExpected) * 100;
  return { fieldsReturned, fieldsExpected, fieldCompletenessPct };
}

/**
 * Basic schema conformance check: verify all required fields are present
 * and top-level properties have the expected types.
 */
function validateSchema(
  output: unknown,
  outputSchema: Record<string, unknown>,
): boolean {
  if (!output || typeof output !== "object" || Array.isArray(output)) {
    // If schema expects an object and we didn't get one, not conformant
    return outputSchema.type !== "object";
  }

  const outputObj = output as Record<string, unknown>;
  const required = (outputSchema as { required?: string[] }).required ?? [];

  // Check required fields are present and non-null
  for (const field of required) {
    if (!(field in outputObj) || outputObj[field] == null) {
      return false;
    }
  }

  return true;
}

/**
 * Categorize an error into a standard error_type bucket.
 */
/** Exported for testing — the refusal branch is the one worth pinning down,
 *  since misclassifying it feeds the quarantine/deactivation floor. */
export function categorizeError(
  error: Error | string | null | undefined,
): string | null {
  if (!error) return null;

  const msg =
    typeof error === "string" ? error.toLowerCase() : error.message.toLowerCase();

  // Checked before the fault buckets: a refusal often mentions the entity the
  // caller asked about, and an unlucky company name would otherwise land in
  // one of them ("Timeout Ltd" is a real kind of name).
  if (isCapabilityRefusal(error)) {
    return "capability_refusal";
  }

  if (msg.includes("timeout") || msg.includes("timed out") || msg.includes("etimedout")) {
    return "upstream_timeout";
  }
  if (msg.includes("rate limit") || msg.includes("429") || msg.includes("too many requests")) {
    return "rate_limited";
  }
  // #436 round 3: this listed 502/503/504 and not 500, so a plain vendor 500
  // — "PageSpeed Insights returned HTTP 500" — fell through to
  // `internal_error` and was counted against us on the trust surfaces, while
  // transaction-failure-taxonomy.ts classified the very same string
  // `upstream`. 34 real production failures over 90 days on that one
  // capability alone. The whole 5xx range is the upstream's, so match it the
  // way the taxonomy does (UPSTREAM_RE's `HTTP 5\d\d`) rather than by
  // enumerating three of the six codes.
  //
  // Anchored to the "http 5xx" phrasing rather than a bare three-digit match,
  // which would also claim "responded in 1500ms".
  if (
    msg.includes("econnrefused") ||
    msg.includes("enotfound") ||
    /\bhttp[ _-]?5\d\d\b/.test(msg) ||
    /\b5\d\d\b.*\b(?:server error|bad gateway|unavailable|gateway timeout)\b/.test(msg) ||
    msg.includes("upstream") ||
    msg.includes("fetch failed")
  ) {
    return "upstream_error";
  }
  if (msg.includes("schema") || msg.includes("validation")) {
    return "schema_mismatch";
  }
  return "internal_error";
}

/**
 * Build extensible quality flags bag.
 */
function buildFlags(data: QualityData): Record<string, unknown> {
  const flags: Record<string, unknown> = {};

  if (data.responseTimeMs > 10_000) {
    flags.slow_response = true;
  }

  if (data.error) {
    flags.had_error = true;
  }

  return flags;
}
