import { getDb } from "../db/index.js";
import { transactionQuality } from "../db/schema.js";

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
    console.error(
      `[quality-capture] Failed to record quality for txn ${data.transactionId}:`,
      err,
    );
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

  await db.insert(transactionQuality).values({
    transactionId: data.transactionId,
    responseTimeMs: cappedResponseTimeMs,
    upstreamLatencyMs: data.upstreamLatencyMs ?? null,
    schemaConformant,
    fieldsReturned,
    fieldsExpected,
    fieldCompletenessPct: fieldCompletenessPct.toFixed(2),
    errorType,
    qualityFlags: buildFlags(data),
  });
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
function categorizeError(
  error: Error | string | null | undefined,
): string | null {
  if (!error) return null;

  const msg =
    typeof error === "string" ? error.toLowerCase() : error.message.toLowerCase();

  if (msg.includes("timeout") || msg.includes("timed out") || msg.includes("etimedout")) {
    return "upstream_timeout";
  }
  if (msg.includes("rate limit") || msg.includes("429") || msg.includes("too many requests")) {
    return "rate_limited";
  }
  if (
    msg.includes("econnrefused") ||
    msg.includes("enotfound") ||
    msg.includes("502") ||
    msg.includes("503") ||
    msg.includes("504") ||
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
