/**
 * GET /v1/ops-read/:check — fixed, read-only production checks for operator
 * sessions (lib/ops-read.ts says what may and may not be returned).
 *
 * Without a valid `STRALE_OPS_READ_TOKEN` bearer, or when the token is unset
 * or too short, every path here answers exactly like an unknown route (404,
 * same body as app.notFound), so the surface is not discoverable. It is not
 * in the OpenAPI document, the sitemap or llms.txt. Rate limited after the
 * token check (see below).
 */
import { Hono, type Context } from "hono";
import { sql } from "drizzle-orm";
import { getDb } from "../db/index.js";
import {
  OpsReadInputError,
  OPS_READ_CHECKS,
  assertSafeOutput,
  isOpsReadCheck,
  isValidOpsReadAuth,
  type ReadExecutor,
} from "../lib/ops-read.js";
import { log, logError } from "../lib/log.js";
import { rateLimitByIp } from "../lib/rate-limit.js";

/** Identical to app.notFound, so an unauthenticated caller learns nothing. */
function notFound(c: Context) {
  return c.json(
    { error_code: "not_found" as const, message: `No route matches ${c.req.method} ${c.req.path}` },
    404,
  );
}

// Bounded: a check that runs long is a bug, not a reason to hold a pool slot.
const sqlStatementTimeout = sql`SET LOCAL statement_timeout = '5s'`;

export const opsReadRoute = new Hono();

opsReadRoute.use("*", async (c, next) => {
  if (!isValidOpsReadAuth(c.req.header("Authorization"), process.env.STRALE_OPS_READ_TOKEN)) {
    return notFound(c);
  }
  return next();
});

// After the token check, so an unauthenticated response carries no
// X-RateLimit-* headers and never answers 429: both would mark this prefix
// as different from an unknown route. A 32+ character random token makes
// brute force moot; the limit protects the database from a token holder.
opsReadRoute.use("*", rateLimitByIp(30, 60_000, "ops-read"));

opsReadRoute.get("/:check", async (c) => {
  const name = c.req.param("check");
  if (!isOpsReadCheck(name)) return notFound(c);
  const def = OPS_READ_CHECKS[name];
  let params: unknown;
  try {
    // Before any database work: a bad range costs no pool connection.
    params = def.prepare({ from: c.req.query("from"), to: c.req.query("to") });
  } catch (err) {
    if (err instanceof OpsReadInputError) {
      return c.json({ error_code: "invalid_request" as const, message: err.message }, 400);
    }
    throw err;
  }
  try {
    const result = await getDb().transaction(
      async (tx) => {
        await tx.execute(sqlStatementTimeout);
        return def.run(tx as unknown as ReadExecutor, params);
      },
      { accessMode: "read only" },
    );
    const body = assertSafeOutput({ check: name, result });
    log.info({ label: "ops-read-check", check: name }, "ops-read-check");
    return c.json(body as Record<string, unknown>);
  } catch (err) {
    logError("ops-read-check-failed", err, { check: name });
    return c.json({ error_code: "internal_error" as const, message: "The check failed." }, 500);
  }
});
