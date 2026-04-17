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

export const log = transport
  ? pino(
      {
        level: process.env.LOG_LEVEL ?? "info",
        base: { env: process.env.NODE_ENV ?? "development" },
      },
      transport,
    )
  : pino({
      level: process.env.LOG_LEVEL ?? "info",
      base: { env: process.env.NODE_ENV ?? "development" },
    });

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
