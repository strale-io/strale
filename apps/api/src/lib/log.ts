/**
 * Structured logger (F-0-014, supports F-0-009's fireAndForget).
 *
 * Pino writes one JSON object per line to stdout, which Railway captures. When
 * BETTERSTACK_SOURCE_TOKEN and BETTERSTACK_INGEST_HOST are both set (Railway
 * prod, DEC-20261029-A: Better Stack, EU region), the same redacted lines are
 * also shipped by log-sink.ts. Unset, shipping is a no-op announced once at boot.
 *
 * This module is the single swap point: every `logError`/`logWarn` call site
 * in the codebase routes through here, so future changes (different sink,
 * sampling, redaction) live in one file. `console.*` does not pass through
 * here and never reaches the sink.
 */

import pino from "pino";
import { createBetterStackSink, resolveSinkConfig, type LogSink } from "./log-sink.js";

/** Shared by stdout and the optional sink: redact before either receives data. */
const sensitiveFields = ["authorization", "Authorization", "api_key", "apiKey", "token", "tokens", "api_token", "accessToken", "refreshToken", "idToken", "access_token", "refresh_token", "id_token", "password", "x-payment", "X-Payment", "payment-signature", "PAYMENT-SIGNATURE", "paymentSignature", "payment_signature", "signature", "email", "to", "user_email", "recipient", "email_to",
  // H8 additions: more auth-header and secret shapes, customer inputs and bodies, payment payloads.
  "cookie", "set-cookie", "x-api-key", "proxy-authorization", "secret", "client_secret", "private_key",
  "input", "inputs", "user_input", "capability_input", "body", "request_body", "payload", "payment_payload", "paymentPayload",
  "card", "card_number"];
/**
 * Values, not keys: a secret or an address inside a message or an error string.
 * Keys catch the structured case; these catch `Error("bad key sk_live_...")`.
 */
// Every repeat is bounded: these run synchronously in each log call, and an
// unbounded `[...]+@` retried from every position is quadratic on a long
// caller-supplied string (100k chars took ~12 s before the bounds).
const sensitiveValues: Array<[RegExp, string]> = [
  [/\bBearer\s+[A-Za-z0-9._~+/=-]{1,4096}/gi, "Bearer [Redacted]"],
  [/\b(?:sk|rk|whsec)_(?:live|test)_[A-Za-z0-9]{1,256}/g, "[Redacted key]"],
  [/\beyJ[A-Za-z0-9_-]{1,4096}\.[A-Za-z0-9_-]{1,8192}\.[A-Za-z0-9_-]{1,4096}/g, "[Redacted jwt]"],
  [/([?&](?:api_key|apikey|key|token|access_token|password|secret|signature|email)=)[^&\s#"']{1,4096}/gi, "$1[Redacted]"],
  [/[A-Za-z0-9._%+-]{1,64}(?:@|%40)[A-Za-z0-9.-]{1,253}\.[A-Za-z]{2,24}/gi, "[Redacted email]"],
];
/** Longer strings are cut before scrubbing so one log call stays cheap. */
const MAX_LOGGED_STRING = 16_384;
export function scrubString(text: string): string {
  const bounded = text.length > MAX_LOGGED_STRING
    ? `${text.slice(0, MAX_LOGGED_STRING)}…[truncated ${text.length - MAX_LOGGED_STRING} chars]`
    : text;
  return sensitiveValues.reduce((out, [pattern, replacement]) => out.replace(pattern, replacement), bounded);
}
const secretKeys = new Set(sensitiveFields.map(key => key.toLowerCase()));
function redactNested(value: unknown, seen = new WeakSet<object>()): unknown {
  if (typeof value === "string") return scrubString(value);
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
  // The message and printf arguments never reach `formatters.log`. An Error
  // passed alone becomes the message after this hook, so give it a scrubbed one.
  hooks: {
    logMethod(args, method) {
      const scrubbed = args.map(arg => (typeof arg === "string" ? scrubString(arg) : arg));
      if (scrubbed[0] instanceof Error && typeof scrubbed[1] !== "string") scrubbed.splice(1, 0, scrubString(scrubbed[0].message));
      method.apply(this, scrubbed as Parameters<typeof method>);
    },
  },
};

const sinkConfig = resolveSinkConfig();
let sink: LogSink | null = null;
if (sinkConfig.state === "enabled") sink = createBetterStackSink({ token: sinkConfig.token, host: sinkConfig.host });

export const log = sink
  ? pino(logOptions, pino.multistream([
      { level: logOptions.level as pino.Level, stream: pino.destination(1) },
      { level: logOptions.level as pino.Level, stream: sink },
    ]))
  : pino(logOptions);

/** Send what the sink still holds. Registered with shutdown in index.ts; a no-op when unset. */
export function closeLogSink(): Promise<void> {
  return sink ? sink.close() : Promise.resolve();
}

// Once at boot, never an error: an unset sink is a supported state.
if (sinkConfig.state === "enabled") {
  log.info({ label: "log-sink.enabled", host: sinkConfig.host, eu_region: /(^|[.-])eu-/.test(sinkConfig.host) }, "log-sink.enabled");
} else if (sinkConfig.state === "misconfigured") {
  log.warn({ label: "log-sink.misconfigured", reason: sinkConfig.reason }, "log-sink.misconfigured");
} else if (sinkConfig.reason !== "test runner") {
  log.info({ label: "log-sink.disabled", reason: sinkConfig.reason }, "log-sink.disabled");
}

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
