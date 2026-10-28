/**
 * Structured logger (F-0-014, supports F-0-009's fireAndForget).
 *
 * Pino writes one JSON object per line to stdout. When BETTER_STACK_SOURCE_TOKEN
 * is set (Railway prod), @logtail/pino ships logs to Better Stack (EU region
 * per Phase A Q4). When it isn't set (local dev, CI), Pino writes plain
 * structured JSON to stdout — Railway's log stream picks that up too.
 *
 * This module is the single swap point: every `logError`/`logWarn` call site
 * in the codebase routes through here, so future changes (different sink,
 * sampling, redaction) live in one file.
 */

import pino from "pino";

const transport = process.env.BETTER_STACK_SOURCE_TOKEN
  ? pino.transport({
      target: "@logtail/pino",
      options: { sourceToken: process.env.BETTER_STACK_SOURCE_TOKEN },
    })
  : undefined;

/** Shared by stdout and the optional transport: redact before either receives data. */
const sensitiveFields = ["authorization", "Authorization", "api_key", "apiKey", "token", "tokens", "api_token", "accessToken", "refreshToken", "idToken", "access_token", "refresh_token", "id_token", "password", "x-payment", "X-Payment", "payment-signature", "PAYMENT-SIGNATURE", "paymentSignature", "payment_signature", "signature", "email", "to", "user_email", "recipient", "email_to"];
const secretKeys = new Set(sensitiveFields.map(key => key.toLowerCase()));
function redactNested(value: unknown, seen = new WeakSet<object>()): unknown {
  if (!value || typeof value !== "object") return value;
  // Preserve native serialization (Buffer.toJSON is pino's responsibility).
  if (ArrayBuffer.isView(value) || value instanceof ArrayBuffer || value instanceof Date || value instanceof URL) return value;
  if (seen.has(value)) return "[Circular]";
  seen.add(value);
  const serializable = value as { toJSON?: () => unknown };
  if (typeof serializable.toJSON === "function") {
    const serialized = serializable.toJSON();
    if (serialized !== value) {
      const result = redactNested(serialized, seen);
      seen.delete(value);
      return result;
    }
  }
  const record = value instanceof Error ? pino.stdSerializers.err(value) : value;
  const result = Array.isArray(record)
    ? record.map(item => redactNested(item, seen))
    : Object.fromEntries(Object.entries(record).map(([key, item]) => [key,
        secretKeys.has(key.toLowerCase()) ? "[Redacted]" : redactNested(item, seen)]));
  seen.delete(value);
  return result;
}
export const logOptions: pino.LoggerOptions = {
  level: process.env.LOG_LEVEL ?? "info",
  base: { env: process.env.NODE_ENV ?? "development" },
  redact: {
    paths: sensitiveFields.map(key => `["${key}"]`),
    censor: "[Redacted]",
  },
  // Recursion covers nesting and casing. Avoid wildcard traversal of native
  // objects: cloning a URL prototype in pino redaction breaks its private slots.
  formatters: { log: object => redactNested(object) as Record<string, unknown> },
};
export const log = transport ? pino(logOptions, transport) : pino(logOptions);

export type LogContext = Record<string, unknown>;

/**
 * Emit a structured error. `label` is a kebab-case slug used for grouping
 * in the sink; `err` is the underlying Error or unknown; `ctx` is any
 * additional structured fields. The message that appears at the log line's
 * surface is the label itself — searchability wins over prose.
 */
export function logError(label: string, err: unknown, ctx?: LogContext): void {
  log.error(
    {
      label,
      err: err instanceof Error ? { message: err.message, stack: err.stack, name: err.name } : err,
      ...(ctx ?? {}),
    },
    label,
  );
}

/**
 * Emit a structured warning. Used for expected-but-worth-tracking events
 * (SSRF blocks, rate-limit denials, free-tier cap hits).
 */
export function logWarn(label: string, message: string, ctx?: LogContext): void {
  log.warn({ label, ...(ctx ?? {}) }, message);
}
