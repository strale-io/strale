/**
 * The MCP surface has to be usable by something that cannot fill in a form.
 *
 * Measured in the seven days to 2026-08-15: 176 distinct agents opened an MCP
 * session, 2 real callers executed anything, and there were 0 signups. Over the
 * same period 653 x402 calls arrived — from agents that had found the
 * pay-per-call route somewhere other than here.
 *
 * The reason is visible in what the surface said. Hitting a paid capability
 * without a key returned exactly one instruction: "Get a free API key at
 * https://strale.dev/signup". That is a web form. An autonomous agent cannot
 * complete it, and x402 — payment-as-auth, no account, built for precisely
 * this caller — was never mentioned.
 *
 * These tests pin the two properties that fix costs nothing to keep: the
 * machine-actionable route is offered, and the first-contact response does not
 * assert catalogue facts it has not checked.
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import { executeCapability, type StraleClientOptions } from "strale-mcp/tools";

const OPTS: StraleClientOptions = {
  baseUrl: "https://api.example.test",
  apiKey: "", // the whole point: no credentials
  maxPriceCents: 100,
};

afterEach(() => {
  vi.unstubAllGlobals();
});

async function refusalFor(slug: string): Promise<Record<string, unknown>> {
  const res = await executeCapability(slug, { any: "input" }, OPTS);
  return JSON.parse(res.content[0].text) as Record<string, unknown>;
}

describe("an agent refused for lack of credentials is told what it can actually do", () => {
  it("offers the pay-per-call route, with the endpoint to call", async () => {
    const body = await refusalFor("swedish-company-data");
    const pay = body.pay_per_call as Record<string, string> | undefined;

    expect(pay, "a refusal must offer the no-signup route").toBeDefined();
    expect(pay!.endpoint).toBe("https://api.example.test/x402/swedish-company-data");
    expect(pay!.catalog).toContain("/x402/catalog");
    expect(pay!.discovery).toContain("/.well-known/x402.json");
  });

  it("does not present a web signup as the only way forward", async () => {
    const body = await refusalFor("swedish-company-data");
    // Signup is still offered — for a human. It just cannot be the sole path,
    // which is what produced 176 arrivals and 0 signups.
    const asText = JSON.stringify(body);
    expect(asText).toContain("strale.dev/signup");
    expect(Object.keys(body), "the machine route must be present too").toContain("pay_per_call");
  });

  it("names the free capabilities rather than gesturing at them", async () => {
    const body = await refusalFor("swedish-company-data");
    const free = String(body.free_without_either ?? "");
    expect(free).toContain("email-validate");
    expect(free).toContain("bitcoin-address-validate"); // one of the six added later
  });

  it("still lets a free-tier capability through without any of this", async () => {
    // The refusal must not have widened. Free tier works with no key and no
    // payment; only the paid path should reach the message above.
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify({ result: { output: { valid: true } } }), { status: 200 }),
      ),
    );
    const res = await executeCapability("email-validate", { email: "a@b.com" }, OPTS);
    const body = JSON.parse(res.content[0].text) as Record<string, unknown>;
    expect(body.pay_per_call, "free tier must not be told to pay").toBeUndefined();
  });
});

describe("first contact does not assert facts it has not checked", () => {
  it("carries no hardcoded catalogue counts or retired concepts", async () => {
    // The previous response claimed "256 capabilities, 81 solutions" and
    // "dual-profile quality scores" — the SQS engine, deleted in
    // DEC-20260503-B. Counts drift within days and retired concepts never
    // un-retire, so neither belongs in a machine surface as a literal.
    const { readFileSync } = await import("node:fs");
    const { resolve } = await import("node:path");
    // vitest runs with cwd = apps/api
    const src = readFileSync(
      resolve(process.cwd(), "../../packages/mcp-server/src/tools.ts"),
      "utf8",
    );
    // "strale_execute" also appears earlier in the file, so the end marker
    // must be searched for AFTER the start — slicing on the first occurrence
    // yields a negative range and an empty string that passes vacuously.
    const start = src.indexOf('"strale_getting_started"');
    expect(start, "getting_started registration must be findable").toBeGreaterThan(0);
    const end = src.indexOf('"strale_execute"', start);
    const gettingStarted = src
      .slice(start, end > start ? end : undefined)
      // Strip comments: this asserts on what the tool RETURNS, and the
      // surrounding commentary legitimately names the retired concept in
      // order to explain why it must not appear in the payload.
      .split("\n")
      .filter((l) => !l.trim().startsWith("//") && !l.trim().startsWith("*"))
      .join("\n");
    expect(gettingStarted.length, "slice must not be empty").toBeGreaterThan(200);
    expect(gettingStarted).not.toMatch(/dual-profile|SQS score/i);
    expect(gettingStarted, "counts must be read live, not written in").not.toMatch(
      /\b(256|271|81) (capabilities|solutions)/,
    );
    expect(gettingStarted, "must read the canonical facts endpoint").toContain(
      "/v1/platform/facts",
    );
  });
});
