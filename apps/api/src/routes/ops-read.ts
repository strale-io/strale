/**
 * GET /v1/ops-read/:check — fixed, read-only production checks for operator
 * sessions (lib/ops-read.ts says what may and may not be returned).
 *
 * Without a valid `STRALE_OPS_READ_TOKEN` bearer, or when the token is unset
 * or too short, every path here answers exactly like an unknown route (404,
 * same body as app.notFound), so the surface is not discoverable. It is not
 * in the OpenAPI document, the sitemap or llms.txt. Rate limited at the mount
 * in app.ts.
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

opsReadRoute.get("/:check", async (c) => {
  const name = c.req.param("check");
  if (!isOpsReadCheck(name)) return notFound(c);
  const query = { from: c.req.query("from"), to: c.req.query("to") };
  try {
    const result = await getDb().transaction(
      async (tx) => {
        await tx.execute(sqlStatementTimeout);
        return OPS_READ_CHECKS[name](tx as unknown as ReadExecutor, query);
      },
      { accessMode: "read only" },
    );
    const body = assertSafeOutput({ check: name, result });
    log.info({ label: "ops-read-check", check: name }, "ops-read-check");
    return c.json(body as Record<string, unknown>);
  } catch (err) {
    if (err instanceof OpsReadInputError) {
      return c.json({ error_code: "invalid_request" as const, message: err.message }, 400);
    }
    logError("ops-read-check-failed", err, { check: name });
    return c.json({ error_code: "internal_error" as const, message: "The check failed." }, 500);
  }
});
