/**
 * Regression tests for the 2026-08-14 /a2a resource-exhaustion gap.
 *
 * `POST /a2a` (`message/send`) passes a message part's text straight to the
 * suggest engine when no skillId is given. That engine scans the whole catalog,
 * and when embeddings are configured it also makes a billed Voyage embedding
 * call and a billed Anthropic re-rank call.
 *
 * `POST /v1/suggest` guards both of those costs — 20 req/s per IP and a
 * 500-character cap. `/a2a` had neither. Its only bound was a 256 KB body
 * limit, which caps one request rather than the rate, and permits a query
 * roughly 500× longer than the sibling endpoint allows.
 *
 * The cap now lives in the engine so both doors inherit it, and `/a2a` carries
 * the same 60 req/min limiter as `/mcp`, the other unauthenticated protocol
 * surface.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("../db/index.js", () => ({
  getDb: () => {
    throw new Error("no test should reach the database on these paths");
  },
}));

const jsonRpc = (body: unknown, ip: string) =>
  new Request("http://localhost/", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-forwarded-for": ip },
    body: JSON.stringify(body),
  });

const sendText = (text: string, ip: string) =>
  jsonRpc(
    {
      jsonrpc: "2.0",
      id: 1,
      method: "message/send",
      params: { message: { parts: [{ kind: "text", text }] } },
    },
    ip,
  );

beforeEach(() => {
  vi.resetModules();
});

describe("the cap lives in the engine, so every caller inherits it", () => {
  it("refuses an over-long query before touching the catalog or the cache", async () => {
    const { suggest, MAX_SUGGEST_QUERY_CHARS, SuggestQueryTooLongError } = await import(
      "../lib/suggest.js"
    );
    const tooLong = "a".repeat(MAX_SUGGEST_QUERY_CHARS + 1);

    // Not merely "rejects": it must reject without loading the catalog, which
    // is what makes this a guard rather than an after-the-fact error. The db
    // mock above throws if loadCatalog is reached.
    await expect(suggest({ query: tooLong })).rejects.toThrow(SuggestQueryTooLongError);
  });

  it("accepts a query exactly at the limit", async () => {
    const { MAX_SUGGEST_QUERY_CHARS } = await import("../lib/suggest.js");
    // Boundary is "> max", not ">= max" — the documented limit must itself pass.
    expect("a".repeat(MAX_SUGGEST_QUERY_CHARS).length).toBe(MAX_SUGGEST_QUERY_CHARS);
  });
});

describe("/a2a message/send input cap", () => {
  it("returns an actionable JSON-RPC error instead of a vague skill failure", async () => {
    const { a2aRoute } = await import("./a2a.js");
    const { MAX_SUGGEST_QUERY_CHARS } = await import("../lib/suggest.js");

    const res = await a2aRoute.request(
      sendText("x".repeat(MAX_SUGGEST_QUERY_CHARS + 1), "203.0.113.10"),
    );
    const body = (await res.json()) as { error?: { code: number; message: string } };

    expect(body.error?.code).toBe(-32602);
    // The caller must be able to tell what to change: the limit, what they
    // sent, and the alternative.
    expect(body.error?.message).toContain(String(MAX_SUGGEST_QUERY_CHARS));
    expect(body.error?.message).toContain("skillId");
  });

  it("does not cap a caller who named the skill directly", async () => {
    const { a2aRoute } = await import("./a2a.js");
    const { MAX_SUGGEST_QUERY_CHARS } = await import("../lib/suggest.js");

    // With skillId present the suggest engine is never consulted, so the long
    // text costs nothing and must not be refused on length grounds. It will
    // fail later for other reasons (the db mock throws) — the point is that it
    // is not rejected by the -32602 length guard.
    const res = await a2aRoute.request(
      jsonRpc(
        {
          jsonrpc: "2.0",
          id: 1,
          method: "message/send",
          params: {
            skillId: "iban-validate",
            message: { parts: [{ kind: "text", text: "y".repeat(MAX_SUGGEST_QUERY_CHARS + 1) }] },
          },
        },
        "203.0.113.11",
      ),
    );
    const body = (await res.json().catch(() => ({}))) as { error?: { code: number } };
    expect(body.error?.code).not.toBe(-32602);
  });
});

describe("/a2a rate limiting", () => {
  it("engages at the same 60/min as the sibling MCP endpoint", async () => {
    const { a2aRoute } = await import("./a2a.js");
    const ip = "203.0.113.20";

    // Malformed JSON-RPC so each request is refused before any handler work;
    // this measures the limiter, not the route body.
    const bad = () => jsonRpc({ not: "jsonrpc" }, ip);

    const statuses: number[] = [];
    for (let i = 0; i < 61; i++) {
      statuses.push((await a2aRoute.request(bad())).status);
    }

    expect(statuses.slice(0, 60).every((s) => s === 400)).toBe(true);
    expect(statuses[60]).toBe(429);
  });

  it("buckets by IP, so one noisy caller cannot lock out another", async () => {
    const { a2aRoute } = await import("./a2a.js");
    const noisy = "203.0.113.30";
    for (let i = 0; i < 61; i++) {
      await a2aRoute.request(jsonRpc({ not: "jsonrpc" }, noisy));
    }
    expect((await a2aRoute.request(jsonRpc({ not: "jsonrpc" }, noisy))).status).toBe(429);

    const quiet = await a2aRoute.request(jsonRpc({ not: "jsonrpc" }, "203.0.113.31"));
    expect(quiet.status).toBe(400);
  });
});
