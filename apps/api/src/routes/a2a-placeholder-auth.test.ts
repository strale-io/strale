/**
 * /a2a reads an unexpanded placeholder bearer (`Bearer ${STRALE_API_KEY}`) as
 * no key: message/send forwards no Authorization to /v1/do, and tasks/get
 * answers it as a missing header without a key lookup.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../db/index.js", () => ({
  getDb: () => {
    throw new Error("no test should reach the database on these paths");
  },
}));

const { a2aRoute } = await import("./a2a.js");

const rpc = (body: unknown, auth?: string) =>
  a2aRoute.request(new Request("http://localhost/", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-forwarded-for": "203.0.113.40", ...(auth ? { Authorization: auth } : {}) },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, ...(body as object) }),
  }));

const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; });

describe("/a2a with a placeholder Authorization header", () => {
  it.each([
    ["Bearer ${STRALE_API_KEY}", null],
    ["Bearer <your-key>", null],
    ["Bearer sk_live_real", "Bearer sk_live_real"],
  ])("message/send with %j forwards Authorization %j to /v1/do", async (header, forwarded) => {
    const sent: Array<string | null> = [];
    globalThis.fetch = (async (_url: string, init?: RequestInit) => {
      sent.push(new Headers(init?.headers).get("Authorization"));
      return new Response(JSON.stringify({ status: "completed", output: { valid: true } }), {
        status: 200, headers: { "Content-Type": "application/json" },
      });
    }) as typeof fetch;
    const res = await rpc({
      method: "message/send",
      params: { skillId: "iban-validate", message: { parts: [{ kind: "data", data: { iban: "x" } }] } },
    }, header);
    expect(res.status).toBe(200);
    expect(sent).toEqual([forwarded]);
  });

  it("tasks/get answers a placeholder exactly like a missing header", async () => {
    const body = { method: "tasks/get", params: { id: "00000000-0000-0000-0000-000000000000" } };
    const missing = await (await rpc(body)).json();
    const placeholder = await (await rpc(body, "Bearer ${STRALE_API_KEY}")).json();
    expect(missing.error.message).toContain("Authentication required");
    expect(placeholder).toEqual(missing);
  });
});
