/**
 * Async-job surfaces that are not the poll itself (portfolio plan 2.11).
 *
 *   GET /v1/files/:id?expires=&sig=   download a job's output file. The signed
 *     URL is the credential (minted by GET /v1/transactions/:id, valid for an
 *     hour), so no API key is needed — the link can be handed to a tool that
 *     has none. 403 for a bad signature, 410 for an expired link, 404 once the
 *     file is gone (redacted, deleted, or past the content window).
 *   GET /v1/jobs/webhook-secret       the caller's callback signing secret.
 */
import { Hono } from "hono";

import { getDb } from "../db/index.js";
import { apiError } from "../lib/errors.js";
import { readServableFile, verifyFileUrl } from "../lib/jobs/files.js";
import { signCallback, webhookSecretFor } from "../lib/jobs/callbacks.js";
import { authMiddleware, requirePrimaryKey } from "../lib/middleware.js";
import { rateLimitByIp, rateLimitByKey } from "../lib/rate-limit.js";
import type { AppEnv } from "../types.js";

export const jobsRoute = new Hono<AppEnv>();

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

jobsRoute.get("/files/:id", rateLimitByIp(30, 60_000), async (c) => {
  const id = c.req.param("id") ?? "";
  if (!UUID.test(id)) return c.json(apiError("not_found", "File not found."), 404);

  const check = verifyFileUrl(id, c.req.query("expires"), c.req.query("sig"));
  if (check === "invalid") {
    return c.json(apiError("unauthorized", "This file link is not valid.", {
      fix: "Get a fresh link from GET /v1/transactions/{id}.",
    }), 403);
  }
  if (check === "expired") {
    return c.json(apiError("token_expired", "This file link has expired.", {
      fix: "Get a fresh link from GET /v1/transactions/{id}; links last one hour.",
    }), 410);
  }

  const file = await readServableFile(getDb(), id);
  if (!file) return c.json(apiError("not_found", "File not found. It may have been deleted under the retention policy."), 404);

  return new Response(new Uint8Array(file.data), {
    status: 200,
    headers: {
      "Content-Type": file.contentType,
      "Content-Length": String(file.data.length),
      "Content-Disposition": `attachment; filename="${file.name}"`,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-store",
      "Digest": `sha-256=${Buffer.from(file.sha256, "hex").toString("base64")}`,
    },
  });
});

jobsRoute.get("/jobs/webhook-secret", authMiddleware, requirePrimaryKey, rateLimitByKey(5, 1000), (c) => {
  const user = c.get("user") as { id: string };
  const secret = webhookSecretFor(user.id);
  return c.json({
    secret,
    signature_header: "Strale-Signature",
    signature_format: "t=<unix seconds>,v1=<hex HMAC-SHA256 of '<t>.<raw body>' keyed by secret>",
    event_id_header: "Strale-Event-Id",
    example: { body: "{}", t: 0, signature: signCallback(secret, 0, "{}") },
  });
});
