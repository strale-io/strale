import { unwrapDbError, pgErrorCode, wasWrapped } from "./db-error.js";

/**
 * Database errors: never serialize drizzle's message/stack, both can contain
 * bind values. Every other fatal error (a TypeError, an import failure) keeps
 * its stack and cause chain, which is exactly what debugging needs.
 */
export function startupErrorDetails(err: unknown): {
  block?: string; sqlstate?: string; message: string; cause_message?: string; sql?: string; stack?: string;
} {
  const block = typeof err === "object" && err !== null && "startupBlock" in err
    && typeof (err as { startupBlock?: unknown }).startupBlock === "string"
    ? (err as { startupBlock: string }).startupBlock : undefined;
  if (!wasWrapped(err)) {
    const message = err instanceof Error ? err.message : String(err);
    const cause = err instanceof Error && err.cause instanceof Error ? err.cause.message : undefined;
    return {
      block, sqlstate: pgErrorCode(err), message, cause_message: cause,
      stack: err instanceof Error ? err.stack : undefined,
    };
  }
  const underlying = unwrapDbError(err);
  const message = underlying instanceof Error ? underlying.message : String(underlying);
  const innerCause = underlying instanceof Error && underlying.cause instanceof Error ? underlying.cause.message : undefined;
  const query = typeof err === "object" && err !== null && "query" in err
    ? (err as { query?: unknown }).query : undefined;
  return {
    block, sqlstate: pgErrorCode(err), message, cause_message: innerCause,
    sql: typeof query === "string" ? query : undefined,
  };
}

export function formatStartupError(err: unknown): string {
  const details = startupErrorDetails(err);
  return (details.block ? `Block: ${details.block}\n` : "") +
    `SQLSTATE: ${details.sqlstate ?? "unavailable"}\n` +
    `Message: ${details.message}\n` +
    (details.cause_message ? `Cause: ${details.cause_message}\n` : "") +
    (details.sql ? `SQL: ${details.sql}\n` : "") +
    (details.stack ? `Stack:\n${details.stack}` : "");
}
