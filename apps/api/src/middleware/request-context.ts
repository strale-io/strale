/**
 * Request-scoped logging context (F-0-014).
 *
 * Two middlewares:
 *
 *   requestContext() — mounts first, creates the request child logger with
 *     request_id, method, path. Reads/echoes `x-request-id` (validated).
 *
 *   logUserContext() — optional; re-childs `c.get("log")` with user_id once
 *     `c.get("user")` is populated. authMiddleware/optionalAuthMiddleware
 *     already inline this enrichment right after setting the user, so this
 *     helper is for auth paths that don't go through those middlewares
 *     (e.g. future A2A bearer, x402 signature auth). It no-ops when there
 *     is no user on the context.
 *
 * Design: request-level fields (request_id, method, path) and user-level
 * fields (user_id) are attached by middleware — handlers never re-attach
 * them. Handlers attach operation-level fields only (capability_slug,
 * transaction_id, etc.).
 */

import { randomUUID } from "node:crypto";
import type { MiddlewareHandler } from "hono";
import { log } from "../lib/log.js";
import type { AppEnv } from "../types.js";

const REQUEST_ID_RE = /^[A-Za-z0-9_-]{1,128}$/;

export const requestContext = (): MiddlewareHandler<AppEnv> => async (c, next) => {
  const clientId = c.req.header("x-request-id");
  const requestId = clientId && REQUEST_ID_RE.test(clientId) ? clientId : randomUUID();
  const reqLog = log.child({
    request_id: requestId,
    method: c.req.method,
    path: c.req.path,
  });
  c.set("log", reqLog);
  c.header("x-request-id", requestId);

  // Replaces hono/logger's colorized text request line (F-0-018) with a
  // structured JSON record. Inherits request_id/method/path/user_id from
  // the child logger; adds status_code and duration_ms at completion.
  const start = Date.now();
  await next();
  const duration_ms = Date.now() - start;
  c.get("log").info(
    { label: "request-complete", status_code: c.res.status, duration_ms },
    "request-complete",
  );
};

export const logUserContext = (): MiddlewareHandler<AppEnv> => async (c, next) => {
  const user = c.get("user");
  if (user) {
    const current = c.get("log");
    c.set("log", current.child({ user_id: user.id }));
  }
  await next();
};
