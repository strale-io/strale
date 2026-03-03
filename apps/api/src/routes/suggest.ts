import { Hono } from "hono";
import { suggest } from "../lib/suggest.js";
import { apiError } from "../lib/errors.js";
import { rateLimitByIp } from "../lib/rate-limit.js";
import type { AppEnv } from "../types.js";

export const suggestRoute = new Hono<AppEnv>();

// 20 requests per second per IP
suggestRoute.use("*", rateLimitByIp(20, 1000));

// POST /v1/suggest — Public, no auth required
suggestRoute.post("/suggest", async (c) => {
  const body = await c.req.json().catch(() => null);
  if (!body || !body.query || typeof body.query !== "string") {
    return c.json(
      apiError("invalid_request", "'query' is required and must be a string."),
      400,
    );
  }

  const query = body.query.trim();
  if (query.length === 0) {
    return c.json(
      apiError("invalid_request", "'query' must not be empty."),
      400,
    );
  }

  if (query.length > 500) {
    return c.json(
      apiError("invalid_request", "'query' must be under 500 characters."),
      400,
    );
  }

  const limit = Math.min(Math.max(body.limit ?? 3, 1), 10);

  try {
    const result = await suggest({ query, limit });

    return c.json(result, 200, {
      "Cache-Control": "public, max-age=60",
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    if (
      message.includes("VOYAGE_API_KEY") ||
      message.includes("ANTHROPIC_API_KEY") ||
      message.includes("voyageai") ||
      message.includes("anthropic")
    ) {
      console.error("[suggest] Service error:", message);
      return c.json(
        apiError(
          "capability_unavailable",
          "Recommendation engine is temporarily unavailable.",
        ),
        503,
      );
    }
    throw err;
  }
});
