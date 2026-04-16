/**
 * Temporary structured-log helper.
 *
 * Phase A (FIX_PHASE_A_verification.md Q4) concluded that no observability
 * sink is integrated and recommended Pino + Better Stack. That migration is
 * deferred to Phase C Fix 5. Until then, every call site that would call the
 * future `fireAndForget`/`logger.error` uses this helper so we have a single
 * place to swap in the real sink later.
 *
 * Output: one JSON object per line to stderr. Railway captures stderr cleanly
 * and downstream log shippers (Logtail, Axiom) can parse JSON lines directly.
 *
 * Do not use this for request-scoped logging on the hot path — it's a plain
 * `console.error(JSON.stringify(...))`, not a performant logger.
 */

export interface LogContext {
  [key: string]: unknown;
}

/**
 * Emit a structured error record. `label` is a stable machine-friendly slug
 * (kebab-case) used for grouping in the log sink; `err` is the underlying
 * Error or unknown; `ctx` is any additional structured fields.
 */
export function logError(label: string, err: unknown, ctx?: LogContext): void {
  const payload = {
    level: "error" as const,
    ts: new Date().toISOString(),
    label,
    message: err instanceof Error ? err.message : String(err),
    stack: err instanceof Error ? err.stack : undefined,
    ...(ctx ?? {}),
  };
  try {
    console.error(JSON.stringify(payload));
  } catch {
    // A field contained a BigInt or a circular reference — fall back to a
    // plain message so we never throw from a logger.
    console.error(`[${label}] ${payload.message}`);
  }
}

/**
 * Emit a structured warning. Same shape as logError, level = "warn".
 * Used for safety events (SSRF blocks, rate-limit denials) that are expected
 * but worth tracking.
 */
export function logWarn(label: string, message: string, ctx?: LogContext): void {
  const payload = {
    level: "warn" as const,
    ts: new Date().toISOString(),
    label,
    message,
    ...(ctx ?? {}),
  };
  try {
    console.warn(JSON.stringify(payload));
  } catch {
    console.warn(`[${label}] ${message}`);
  }
}
