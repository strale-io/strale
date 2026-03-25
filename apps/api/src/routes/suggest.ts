import { Hono } from "hono";
import { suggest, typeahead } from "../lib/suggest.js";
import { apiError } from "../lib/errors.js";
import { rateLimitByIp } from "../lib/rate-limit.js";
import type { AppEnv } from "../types.js";

export const suggestRoute = new Hono<AppEnv>();

// GET /v1/suggest/typeahead — Public, no auth, fast in-memory matching
suggestRoute.get("/suggest/typeahead", rateLimitByIp(30, 1000), async (c) => {
  const q = c.req.query("q")?.trim();
  if (!q || q.length < 2) {
    return c.json(
      apiError("invalid_request", "'q' parameter is required and must be at least 2 characters."),
      400,
    );
  }

  const limitParam = c.req.query("limit");
  const limit = Math.min(Math.max(limitParam ? parseInt(limitParam, 10) || 6 : 6, 1), 10);
  const geo = c.req.query("geo") || undefined;
  const typeParam = c.req.query("type");
  const typeFilter = typeParam === "solution" || typeParam === "capability" ? typeParam : undefined;

  try {
    const result = await typeahead(q, limit, geo, typeFilter);
    return c.json(result, 200, {
      "Cache-Control": "public, max-age=30",
    });
  } catch (err) {
    console.error("[typeahead] Error:", err instanceof Error ? err.stack : err);
    return c.json(apiError("execution_failed", "Typeahead search temporarily unavailable."), 500);
  }
});

// POST /v1/suggest — Public, no auth required
suggestRoute.post("/suggest", rateLimitByIp(20, 1000), async (c) => {
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
